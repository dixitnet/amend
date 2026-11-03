// Ce qu'un agent (Claude, invité sur un document) sait lire et écrire dans
// le document Yjs — sans ProseMirror, sans navigateur (29/09/2026,
// claude/etude-inviter-claude.md §4 et §8).
//
// Le serveur ne connaît pas le schéma ProseMirror : il connaît la **forme
// que y-prosemirror donne au document dans Yjs** —
//
//   - un XmlElement par nœud (paragraph, heading, list_item, …) ;
//   - le texte d'un bloc dans des Y.XmlText, dont les attributs portent les
//     marques : `strong: {}`, `link: {href}`, `insertion: {user, userColor,
//     ts, groupe}`, `deletion: {…}`, `authorColor: {user, userColor}` ;
//   - les atomes en ligne (saut de ligne, note, image) : des XmlElement
//     frères de ces XmlText, dans le même bloc.
//
// Cette forme est vérifiée par client/test/agent-moteur.test.js, qui
// compare ce qu'écrit ce module avec ce que produit le client
// (insertAISuggestion) et le relit avec ProseMirror.
//
// Règle d'or : **un agent ne modifie jamais le texte directement.** Une
// proposition est un suivi de modifications, exactement comme celui d'un
// correcteur : l'ancien texte, barré (marque `deletion`), puis le nouveau
// (marque `insertion`), les deux moitiés partageant un `groupe`. Rien ne
// devient définitif avant qu'un éditeur l'accepte.

import * as Y from 'yjs'
import { diffWords } from '../shared/diff.js'
import { typographier } from '../shared/typographie.js'
import { styleParagrapheValide } from '../shared/style.js'
import { AUTEUR_AGENT, NOM_TEXTE, NOM_COMMENTAIRES, NOM_ORPHELINS } from '../shared/protocole.js'
export { NOM_TEXTE, NOM_COMMENTAIRES, NOM_ORPHELINS }

// Aucun seuil dans ce fichier : longueurs et nombres d'éléments par appel
// n'ont plus de plafond propre (supprimés le 22/10/2026) ; la sortie maximale
// d'un appel borne ce que le modèle peut écrire (server/garde-fous.js).

const MARQUES_DE_SUIVI = new Set(['insertion', 'deletion', 'authorColor'])

/** Espaces insécables, apostrophes et tirets typographiques : un agent écrit
 * rarement la même chose que le document, et « introuvable » pour une espace
 * fine ou un tiret demi-cadratin est une réponse inutile (les tirets depuis le
 * 03/11/2026 : un petit modèle recopie – en -). Longueur conservée (1 pour 1),
 * pour que les positions trouvées sur le texte normalisé valent pour
 * l'original. Pas les guillemets : « non » recopié "non" n'a pas la même
 * longueur, et des guillemets droits se retypographient mal (lequel ouvre ?) —
 * le refus « à la ponctuation près » demande alors de recopier exactement. */
export function normaliser(s) {
  return s
    .replace(/[\u00a0\u202f\u2009\u2007]/g, ' ')
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[‐‑‒–—―−]/g, '-')
}

// --- Lecture --------------------------------------------------------------

/**
 * Les blocs de texte du document, dans l'ordre : `[{ n, nom, niveau,
 * contexte, texte, segments, enAttente, notes }]`. `n` commence à 1 et compte
 * **tous** les blocs, vides compris — un numéro ne dépend pas de ce qu'on
 * choisit d'afficher.
 *
 * `texte` est le texte **tel qu'il se lirait si tout ce qui est en attente
 * était accepté** : les insertions y sont, les suppressions n'y sont pas. Un
 * saut de ligne y vaut `\n`, une note ou une image `⟦k⟧`.
 *
 * `notes` : les notes de bas de page du bloc, avec leur texte (voir
 * `lireContenu`) — c'est ce qui permet de les lire, de les corriger et de
 * les commenter sans en faire des blocs : elles n'ont pas de numéro de bloc,
 * pour que celui que l'éditeur affiche reste celui de l'agent.
 */
export function blocsDuDocument(ydoc) {
  const racine = ydoc.getXmlFragment(NOM_TEXTE)
  const blocs = []
  parcourir(racine, [])
  // Le numéro que le lecteur voit sur une note : sa place parmi les notes du
  // document, dans l'ordre — celles proposées à la suppression n'en ont plus
  // (l'éditeur les barre sans les compter).
  let compte = 0
  for (const b of blocs) for (const note of b.notes) note.numero = note.supprimee ? null : ++compte
  return blocs

  function parcourir(parent, contexte) {
    for (const enfant of parent.toArray()) {
      if (!(enfant instanceof Y.XmlElement)) continue
      if (estBlocTexte(enfant)) {
        blocs.push(decrireBloc(enfant, contexte, blocs.length + 1))
      } else {
        parcourir(enfant, [...contexte, enfant.nodeName])
      }
    }
  }
}

/**
 * Les images du document, dans l'ordre : `[{ numero, el, alt, suivi,
 * apresBloc }]`. Une image est un **bloc** (schema.js), mais sans texte : elle
 * n'a pas de numéro de bloc — celui que l'éditeur affiche ne compte que les
 * paragraphes et les titres. On la désigne donc par son rang parmi les
 * images (1, 2…) et on la situe par le bloc de texte qui la précède
 * (`apresBloc`, 0 si elle ouvre le document). Même parcours que
 * `blocsDuDocument`, pour que ce numéro de bloc soit le même.
 */
export function imagesDuDocument(ydoc) {
  const images = []
  let blocs = 0
  const parcourir = (parent) => {
    for (const enfant of parent.toArray()) {
      if (!(enfant instanceof Y.XmlElement)) continue
      if (enfant.nodeName === 'image') {
        images.push({
          numero: images.length + 1,
          el: enfant,
          alt: String(enfant.getAttribute('alt') || ''),
          suivi: enfant.getAttribute('suivi') || null,
          apresBloc: blocs,
        })
      } else if (estBlocTexte(enfant)) blocs++
      else parcourir(enfant)
    }
  }
  parcourir(ydoc.getXmlFragment(NOM_TEXTE))
  return images
}

function estBlocTexte(el) {
  if (el.nodeName === 'paragraph' || el.nodeName === 'heading') return true
  return el.toArray().some((c) => c instanceof Y.XmlText)
}

function decrireBloc(el, contexte, n) {
  const contenu = lireContenu(el)
  const enAttente = !!el.getAttribute('trackedBreak') || contenu.enAttente
  const niveau = el.nodeName === 'heading' ? Number(el.getAttribute('level')) || 1 : null
  // « Titre » ou « Sous-titre » (14/10/2026) : un paragraphe qui porte un
  // style, que `lire` signale pour que l'agent ne le prenne pas pour du texte
  // courant. Une valeur inconnue (version plus récente) est ignorée.
  const styleBrut = el.nodeName === 'paragraph' ? el.getAttribute('style') : null
  const style = styleParagrapheValide(styleBrut)
  return {
    n,
    nom: el.nodeName,
    niveau,
    style,
    contexte,
    texte: contenu.texte,
    segments: contenu.segments,
    enAttente,
    notes: contenu.notes,
    el,
  }
}

/**
 * Le contenu en ligne d'un élément (un bloc, ou une note) : ses segments de
 * texte, le texte visible, et les notes qu'il porte. Une note a la même forme
 * qu'un bloc — du texte dans des XmlText, des sauts de ligne en éléments — et
 * se lit donc par le même chemin.
 *
 * `notes[]` : `{ k, el, texte, segments, suivi, supprimee, enAttente }` où
 * `k` est le repère ⟦k⟧ que le texte du bloc montre à sa place.
 */
function lireContenu(el) {
  const segments = []
  const notes = []
  let texte = ''
  let atomes = 0
  let enAttente = false
  const ajouter = (seg) => {
    seg.decalage = texte.length
    seg.visible = !seg.supprime
    segments.push(seg)
    if (seg.visible) texte += seg.texte
    if (seg.enAttente) enAttente = true
  }
  for (const enfant of el.toArray()) {
    if (enfant instanceof Y.XmlText) {
      let index = 0
      for (const op of enfant.toDelta()) {
        if (typeof op.insert === 'string') {
          const attrs = op.attributes || {}
          ajouter({
            xt: enfant,
            debut: index,
            fin: index + op.insert.length,
            texte: op.insert,
            attrs,
            atome: false,
            supprime: !!attrs.deletion,
            enAttente: !!(attrs.insertion || attrs.deletion),
          })
          index += op.insert.length
        } else {
          // Objet intégré : ne devrait pas exister dans un XmlText de
          // y-prosemirror. Compté comme un atome, jamais modifié.
          ajouter({
            xt: enfant,
            debut: index,
            fin: index + 1,
            texte: '⟦?⟧',
            attrs: {},
            atome: true,
            supprime: false,
            enAttente: false,
          })
          index += 1
        }
      }
    } else if (enfant instanceof Y.XmlElement) {
      const suivi = enfant.getAttribute('suivi')
      const supprime = !!(suivi && suivi.type === 'deletion')
      let marque
      if (enfant.nodeName === 'hard_break') marque = '\n'
      else {
        marque = `⟦${++atomes}⟧`
        if (enfant.nodeName === 'footnote') {
          const interne = lireContenu(enfant)
          notes.push({
            k: atomes,
            el: enfant,
            texte: interne.texte,
            segments: interne.segments,
            suivi: suivi || null,
            supprimee: supprime,
            enAttente: !!suivi || interne.enAttente,
          })
        }
      }
      ajouter({
        xt: null,
        el: enfant,
        texte: marque,
        attrs: {},
        atome: true,
        nom: enfant.nodeName,
        suivi: suivi || null,
        supprime,
        enAttente: !!suivi,
      })
    }
  }
  return { segments, texte, enAttente: enAttente || notes.some((x) => x.enAttente), notes }
}

/** Où poser le curseur de l'agent pour montrer qu'il travaille sur ce
 * bloc : une position relative Yjs (JSON) au début de son texte, ou `null`
 * si le bloc n'existe pas ou n'a pas de texte (que des atomes). */
export function ancreDeBloc(ydoc, numero) {
  const bloc = blocsDuDocument(ydoc)[numero - 1]
  if (!bloc) return null
  const segment = bloc.segments.find((s) => s.xt && s.visible) || bloc.segments.find((s) => s.xt)
  if (!segment) return null
  try {
    return Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(segment.xt, segment.debut, 0))
  } catch {
    return null
  }
}

/** Comme blocsDuDocument, mais réduit à ce qu'un agent lit : pas de
 * segments ni d'éléments Yjs, rien qui puisse fuiter dans une réponse. */
export function resume(bloc) {
  return {
    n: bloc.n,
    type: bloc.nom,
    niveau: bloc.niveau,
    contexte: bloc.contexte,
    texte: bloc.texte,
    enAttente: bloc.enAttente,
    notes: bloc.notes.map((x) => ({
      k: x.k,
      numero: x.numero,
      texte: x.texte,
      enAttente: x.enAttente,
      supprimee: x.supprimee,
    })),
  }
}

export function statistiques(blocs) {
  let mots = 0
  let notes = 0
  for (const b of blocs) {
    mots += (b.texte.match(/\S+/g) || []).length
    notes += b.notes.filter((x) => !x.supprimee).length
  }
  return { blocs: blocs.length, mots, notes }
}

// --- Pourquoi une proposition est refusée -----------------------------------

/** Range la raison d'un refus dans une catégorie courte et stable, pour le
 * journal (`events-dialogue.jsonl`, `events-agents.jsonl`) : on y voit *pourquoi*
 * un modèle se fait refuser, sans jamais écrire un mot du document. */
export function motifDeRefus(raison) {
  const r = String(raison || '')
  if (/à la ponctuation près/.test(r)) return 'introuvable-ponctuation'
  if (/introuvable/.test(r)) return 'introuvable'
  if (/apparaît \d+ fois/.test(r)) return 'ambigu'
  if (/rien ne change/.test(r)) return 'identique'
  if (/en attente/.test(r)) return 'en-attente'
  if (/chevauche/.test(r)) return 'chevauche'
  if (/recouvre|traverse un élément|hors du bloc|émoji/.test(r)) return 'structure'
  if (/numéro de bloc|pas de bloc|doivent être du texte|est vide/.test(r)) return 'mal-forme'
  return 'autre'
}

/** `{ introuvable: 3, identique: 2 }` pour une liste de refus `{ raison }`. */
export function compterMotifs(refuses) {
  const motifs = {}
  for (const r of refuses || []) {
    const m = motifDeRefus(r && r.raison)
    motifs[m] = (motifs[m] || 0) + 1
  }
  return motifs
}

// --- Retrouver un passage --------------------------------------------------

/**
 * Où `citation` se trouve dans `bloc` : `{ ok, debut, fin }` (décalages dans
 * `bloc.texte`) — ou `{ ok: false, raison }`. Exact d'abord ; si rien, en
 * ignorant la différence entre espaces (normales, insécables, fines) et
 * entre apostrophes (droite, typographique).
 */
export function situer(bloc, citation) {
  const trouve = situerSansGarde(bloc, citation)
  // Une plage qui coupe une paire de substitution (un émoji, un idéogramme
  // rare) en deux : Yjs remplace chaque moitié orpheline par U+FFFD, et pas
  // au même moment chez tous les clients — les contenus divergeraient. Un
  // clavier ne produit jamais cela ; une citation recopiée par un modèle, si.
  if (trouve.ok && coupeUnePaire(bloc.texte, trouve.debut, trouve.fin)) {
    return {
      ok: false,
      raison:
        'ce passage commence ou finit au milieu d’un émoji ou d’un caractère codé sur deux positions : recopie-le en entier',
    }
  }
  return trouve
}

const estSubstitutHaut = (c) => c >= 0xd800 && c <= 0xdbff
const estSubstitutBas = (c) => c >= 0xdc00 && c <= 0xdfff

/** Vrai si `[debut, fin)` sépare les deux moitiés d'une paire de substitution
 * du texte. */
export function coupeUnePaire(texte, debut, fin) {
  const c = (i) => (i >= 0 && i < texte.length ? texte.charCodeAt(i) : -1)
  return (
    (estSubstitutBas(c(debut)) && estSubstitutHaut(c(debut - 1))) ||
    (estSubstitutHaut(c(fin - 1)) && estSubstitutBas(c(fin)))
  )
}

function situerSansGarde(bloc, citation) {
  if (!citation) return { ok: false, raison: 'le texte à retrouver est vide' }
  const exact = occurrences(bloc.texte, citation)
  if (exact.length === 1) return { ok: true, debut: exact[0], fin: exact[0] + citation.length, approche: false }
  const lieu = bloc.lieu || `le bloc ${bloc.n}`
  if (exact.length > 1)
    return {
      ok: false,
      raison: `ce passage apparaît ${exact.length} fois dans ${lieu} : allonge-le pour qu'il soit unique`,
    }
  const large = occurrences(normaliser(bloc.texte), normaliser(citation))
  if (large.length === 1)
    return { ok: true, debut: large[0], fin: large[0] + citation.length, approche: true, typographie: true }
  if (large.length > 1)
    return {
      ok: false,
      raison: `ce passage apparaît ${large.length} fois dans ${lieu} : allonge-le pour qu'il soit unique`,
    }
  // Dernier recours : sans tenir compte de la casse. Haiku 5.5 recopie parfois
  // « les bailleurs » pour « Les bailleurs » (11 citations sur 223 au banc
  // d'essai) ; on ne le renvoie pas recopier pour une majuscule.
  const sansCasse = (s) => {
    const m = normaliser(s).toLowerCase()
    return m.length === s.length ? m : null // un changement de longueur décalerait les positions
  }
  const a = sansCasse(bloc.texte)
  const b = sansCasse(citation)
  if (a && b) {
    const souple = occurrences(a, b)
    if (souple.length === 1) return { ok: true, debut: souple[0], fin: souple[0] + citation.length, approche: true }
    if (souple.length > 1)
      return {
        ok: false,
        raison: `ce passage apparaît ${souple.length} fois dans ${lieu} : allonge-le pour qu'il soit unique`,
      }
  }
  // Les mêmes lettres et chiffres, dans le même ordre, mais pas la même
  // ponctuation ni les mêmes espaces : on ne devine pas lesquelles, mais on le
  // dit — au modèle, qui recopiera mieux, et au journal (motif
  // `introuvable-ponctuation`), qui mesure ce cas sans garder un mot du texte.
  const lettres = (t) => t.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()
  const squelette = lettres(citation)
  if (squelette && lettres(bloc.texte).includes(squelette)) {
    return {
      ok: false,
      raison: `ce passage est introuvable dans ${lieu} à la ponctuation près : les mots y sont, mais la ponctuation ou les espaces diffèrent — recopie-le exactement, tel que lire le montre, ou raccourcis-le aux seuls mots qui changent`,
    }
  }
  return {
    ok: false,
    raison: `ce passage est introuvable dans ${lieu} — recopie-le exactement, tel que lire le montre (le texte a peut-être changé depuis)`,
  }
}

function occurrences(texte, motif) {
  const out = []
  if (!motif) return out
  for (let i = texte.indexOf(motif); i !== -1; i = texte.indexOf(motif, i + 1)) out.push(i)
  return out
}

/**
 * Les segments qui portent le passage `[debut, fin)` du texte du bloc, et
 * leur position dans le XmlText. `{ ok, xt, de, jusqua, segments }` :
 * `[de, jusqua)` sont des index du XmlText, ou une raison de refus.
 *
 * `permettreMarques` : un commentaire peut porter sur du texte déjà en
 * attente ; une proposition ne peut pas s'y superposer.
 */
function plageDansLeTexte(bloc, debut, fin, { permettreMarques = false } = {}) {
  const visibles = bloc.segments.filter((s) => s.visible)
  const premier = visibles.findIndex((s) => debut >= s.decalage && debut < s.decalage + s.texte.length)
  const dernier = visibles.findIndex((s) => fin - 1 >= s.decalage && fin - 1 < s.decalage + s.texte.length)
  if (premier === -1 || dernier === -1) return { ok: false, raison: 'passage hors du bloc' }
  const couverts = visibles.slice(premier, dernier + 1)
  const atome = couverts.find((s) => s.atome)
  if (atome) {
    return {
      ok: false,
      raison:
        atome.texte === '\n'
          ? "le passage recouvre un saut de ligne : fais deux propositions distinctes, de part et d'autre"
          : `le passage recouvre l'appel de note ${atome.texte} : fais deux propositions distinctes, de part et d'autre — pour insérer juste après l'appel, prends comme \`avant\` les premiers mots qui le suivent et ajoute le texte devant eux dans \`apres\` ; juste avant l'appel, les derniers mots qui le précèdent ; pour supprimer la note entière, utilise \`supprimer\``,
    }
  }
  const xt = couverts[0].xt
  if (couverts.some((s) => s.xt !== xt))
    return { ok: false, raison: 'le passage traverse un élément du document : découpe-le' }
  // Les segments physiques entre le premier et le dernier doivent être
  // ceux-là seulement : une suppression en attente au milieu ne se voit
  // pas dans le texte, mais elle est bien dans le passage.
  const physiques = bloc.segments.filter((s) => s.xt === xt)
  const i0 = physiques.indexOf(couverts[0])
  const i1 = physiques.indexOf(couverts[couverts.length - 1])
  const entre = physiques.slice(i0, i1 + 1)
  if (entre.some((s) => !s.visible))
    return { ok: false, raison: "le passage contient une suppression déjà en attente : attends qu'elle soit traitée" }
  if (!permettreMarques && entre.some((s) => s.enAttente)) {
    return {
      ok: false,
      raison: "le passage contient déjà une modification en attente : attends qu'un éditeur la traite",
    }
  }
  const de = couverts[0].debut + (debut - couverts[0].decalage)
  const jusqua = couverts[couverts.length - 1].debut + (fin - couverts[couverts.length - 1].decalage)
  return { ok: true, xt, de, jusqua, segments: couverts }
}

// --- Une note comme cible ---------------------------------------------------

/**
 * Ce sur quoi porte une demande : le bloc `numero`, ou — quand `note` est
 * donné — **le texte d'une de ses notes**, qui a la même forme qu'un bloc
 * (`texte`, `segments`) et se retrouve donc par les mêmes fonctions.
 * `{ refus }` si la cible n'existe pas ou ne peut pas être corrigée.
 *
 * Une note qui vient d'être proposée (insertion en attente) n'est pas suivie
 * mot à mot par l'éditeur : la proposition, c'est la note entière. On n'y
 * superpose donc rien, comme on ne corrige pas le texte qu'un autre vient de
 * proposer. Une note proposée à la suppression non plus.
 */
function cibleDe(blocs, numero, note, { pourCorriger = true } = {}) {
  const bloc = blocs[numero - 1]
  if (!bloc) return { refus: `il n'y a pas de bloc ${numero}` }
  if (note === undefined || note === null) return bloc
  if (!Number.isInteger(note) || note < 1)
    return { refus: '`note` doit être le repère ⟦k⟧ de la note dans le bloc (un entier à partir de 1)' }
  const trouvee = bloc.notes.find((x) => x.k === note)
  if (!trouvee) {
    return {
      refus: bloc.notes.length
        ? `il n'y a pas de note ⟦${note}⟧ dans le bloc ${numero} (notes de ce bloc : ${bloc.notes.map((x) => `⟦${x.k}⟧`).join(', ')})`
        : `le bloc ${numero} ne porte aucune note`,
    }
  }
  if (pourCorriger && trouvee.suivi) {
    return {
      refus:
        trouvee.suivi.type === 'deletion'
          ? `la note ⟦${note}⟧ du bloc ${numero} est déjà proposée à la suppression : attends qu'un éditeur la traite`
          : `la note ⟦${note}⟧ du bloc ${numero} vient d'être proposée : son texte ne se corrige pas avant qu'un éditeur l'ait acceptée ou refusée`,
    }
  }
  return {
    n: bloc.n,
    nom: 'note',
    contexte: [],
    texte: trouvee.texte,
    segments: trouvee.segments,
    enAttente: trouvee.enAttente,
    notes: [],
    el: trouvee.el,
    lieu: `la note ⟦${note}⟧ du bloc ${numero}`,
    note: trouvee,
    bloc,
  }
}

// --- Proposer --------------------------------------------------------------

/**
 * Découpe un remplacement `avant` → `apres` en modifications élémentaires,
 * **avec l'algorithme de l'IA du panneau** (shared/diff.js) : mot à mot, les
 * mots inchangés restent intacts, un mot remplacé par un autre est une paire
 * (ancien barré puis nouveau, un groupe), et un mot presque identique
 * (« chomage » → « chômage ») se réduit à la lettre. Une correction de trois
 * mots se relit donc en trois cartes, comme quand l'IA la propose.
 *
 * `[{ de, fin, nouveau, paire }]`, positions dans `avant`. Vide si rien ne
 * change.
 */
export function modificationsDe(avant, apres) {
  const ops = diffWords(avant, apres)
  const out = []
  let index = 0
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (!op.text) continue
    if (op.type === 'equal') {
      index += op.text.length
      continue
    }
    const suivant = ops[i + 1]
    if (op.type === 'delete' && suivant && suivant.type === 'insert' && suivant.text) {
      out.push({ de: index, fin: index + op.text.length, nouveau: suivant.text, paire: true })
      index += op.text.length
      i++
    } else if (op.type === 'delete') {
      out.push({ de: index, fin: index + op.text.length, nouveau: '', paire: false })
      index += op.text.length
    } else {
      out.push({ de: index, fin: index, nouveau: op.text, paire: false })
    }
  }
  return out
}

function miseEnFormeHeritee(seg, { sansLien = false } = {}) {
  const out = {}
  for (const [cle, valeur] of Object.entries(seg.attrs || {})) {
    if (MARQUES_DE_SUIVI.has(cle)) continue
    if (sansLien && cle === 'link') continue
    out[cle] = valeur
  }
  return out
}

const seChevauchent = (a, b) => a.xt === b.xt && (a.de === b.de || (a.de < b.jusqua && b.de < a.jusqua))

/**
 * Applique des remplacements `[{ bloc, avant, apres }]` en suivi de
 * modifications, au nom de `auteur` (`{ name, color }`), dans **une seule
 * transaction**. Chacun est jugé indépendamment (et en entier : s'il en
 * refuse un morceau, il n'en applique aucun) ; ce qui est refusé est
 * rapporté avec sa raison, le reste passe. Aucune écriture si rien n'est
 * accepté.
 *
 * `{ appliques: [{ index, bloc }], refuses: [{ index, bloc, raison }] }`
 */
export function proposer(ydoc, remplacements, auteur, ts = Date.now()) {
  const blocs = blocsDuDocument(ydoc)
  const appliques = []
  const refuses = []
  const retenus = []
  const refuse = (index, bloc, raison) => refuses.push({ index, bloc, raison })

  remplacements.forEach((r, index) => {
    const numero = r && Number.isInteger(r.bloc) ? r.bloc : null
    if (numero === null) return refuse(index, r && r.bloc, 'numéro de bloc manquant ou invalide')
    if (typeof r.avant !== 'string' || typeof r.apres !== 'string')
      return refuse(index, numero, '`avant` et `apres` doivent être du texte')
    const bloc = cibleDe(blocs, numero, r.note)
    if (bloc.refus) return refuse(index, numero, bloc.refus)
    const trouve = situer(bloc, r.avant)
    if (!trouve.ok) return refuse(index, numero, trouve.raison)
    // Un nœud texte ProseMirror ne porte pas de saut de ligne.
    // Typographié comme ce qu'on taperait dans l'éditeur (shared/typographie.js).
    const apres = typographier(r.apres.replace(/[\r\n]+/g, ' '))
    // Retrouvé à la typographie près (le modèle a recopié ’ en ', « » en "",
    // – en -) : la correction se calcule sur le texte **du document**, sinon
    // chaque apostrophe ou guillemet recopié à plat deviendrait une fausse
    // modification (le même signe barré puis réécrit). Même longueur : les
    // positions sont les mêmes. Pas pour une majuscule recopiée en minuscule,
    // où le texte du document ferait proposer un changement de casse.
    const base = trouve.typographie ? bloc.texte.slice(trouve.debut, trouve.fin) : r.avant
    const modifications = modificationsDe(base, apres)
    if (!modifications.length)
      return refuse(
        index,
        numero,
        'rien ne change entre `avant` et `apres` : le texte est déjà conforme (espaces insécables, guillemets et apostrophes typographiques y sont peut-être déjà, même si tu ne les distingues pas) — passe à la suite'
      )

    const morceaux = []
    for (const m of modifications) {
      const debut = trouve.debut + m.de
      if (m.fin > m.de) {
        const plage = plageDansLeTexte(bloc, debut, trouve.debut + m.fin)
        if (!plage.ok) return refuse(index, numero, plage.raison)
        morceaux.push({
          index,
          numero,
          xt: plage.xt,
          de: plage.de,
          jusqua: plage.jusqua,
          nouveau: m.nouveau,
          paire: m.paire,
          forme: miseEnFormeHeritee(plage.segments[0]),
        })
      } else {
        // Une insertion pure : elle se place contre un caractère du passage
        // retrouvé — jamais dans le vide.
        const apresUnCaractere = m.de > 0
        const plage = apresUnCaractere
          ? plageDansLeTexte(bloc, debut - 1, debut, { permettreMarques: true })
          : plageDansLeTexte(bloc, debut, debut + 1, { permettreMarques: true })
        if (!plage.ok) return refuse(index, numero, plage.raison)
        const seg = plage.segments[0]
        const point = apresUnCaractere ? plage.jusqua : plage.de
        const auMilieu = point > seg.debut && point < seg.fin
        // Au milieu d'un texte déjà en attente, non : on ne s'insère pas
        // dans la proposition de quelqu'un d'autre.
        if (seg.enAttente && auMilieu)
          return refuse(
            index,
            numero,
            "l'endroit est dans une modification déjà en attente : attends qu'un éditeur la traite"
          )
        morceaux.push({
          index,
          numero,
          xt: plage.xt,
          de: point,
          jusqua: point,
          nouveau: m.nouveau,
          paire: false,
          forme: miseEnFormeHeritee(seg, { sansLien: !auMilieu }),
        })
      }
    }
    // Deux remplacements ne se marchent pas dessus : le premier arrivé passe.
    if (morceaux.some((m) => retenus.some((p) => p.index !== index && seChevauchent(m, p)))) {
      return refuse(index, numero, 'ce remplacement chevauche un autre remplacement de la même demande')
    }
    retenus.push(...morceaux)
    appliques.push({ index, bloc: numero })
  })

  if (!retenus.length) return { appliques, refuses: refuses.sort((a, b) => a.index - b.index) }

  // Un rang par XmlText, pour que le tri regroupe les morceaux qui partagent
  // le même.
  const rangs = new Map()
  for (const morceau of retenus) if (!rangs.has(morceau.xt)) rangs.set(morceau.xt, rangs.size)
  // Du dernier au premier : chaque écriture ne décale que ce qui la suit. Le
  // nouveau texte s'écrit à la fin de l'ancien barré (« ancien, puis nouveau »,
  // comme une frappe par-dessus une sélection), donc l'insertion précède le
  // marquage de la suppression, qui ne touche que `de..jusqua`.
  const ordre = [...retenus].sort((a, b) => rangs.get(a.xt) - rangs.get(b.xt) || b.de - a.de || b.jusqua - a.jusqua)
  const tracer = (groupe) => ({ user: auteur.name, userColor: auteur.color, ts, groupe })
  const couleur = { user: auteur.name, userColor: auteur.color }
  ydoc.transact(() => {
    for (const { xt, de, jusqua, nouveau, paire, forme } of ordre) {
      if (jusqua > de && nouveau && paire) {
        const groupe = `${ts}-${Math.random().toString(36).slice(2, 8)}`
        xt.insert(jusqua, nouveau, { ...forme, insertion: tracer(groupe), authorColor: couleur })
        xt.format(de, jusqua - de, { deletion: tracer(groupe) })
      } else if (jusqua > de) {
        xt.format(de, jusqua - de, { deletion: tracer(null) })
      } else {
        xt.insert(de, nouveau, { ...forme, insertion: tracer(null), authorColor: couleur })
      }
    }
  }, 'agent')
  return { appliques: appliques.sort((a, b) => a.index - b.index), refuses: refuses.sort((a, b) => a.index - b.index) }
}

// --- Paragraphes ajoutés -----------------------------------------------------

/**
 * Ajoute des paragraphes entiers, en suivi de modifications, **juste après**
 * un bloc : `[{ apres_bloc, texte }]` (`apres_bloc: 0` : tout au début du
 * document). Une ligne du texte, un paragraphe.
 *
 * Même forme que ce que l'IA du panneau écrit quand elle ajoute un bloc
 * (client/src/trackChanges.js, `blocsDepuisTexte`) : un paragraphe ordinaire
 * dont tout le texte porte la marque `insertion`, sans `trackedBreak` — le
 * saut qui le sépare n'est pas une modification de plus à relire. Accepter
 * lève la marque ; rejeter retire le texte **et** le bloc (`retirerTexte`).
 *
 * Jugé comme `proposer` : chaque ajout seul, ce qui est refusé est rapporté
 * avec sa raison. Les numéros de blocs de la demande sont ceux de **avant**
 * l'appel (deux ajouts après le même bloc se suivent dans l'ordre donné).
 *
 * `{ appliques: [{ index, bloc, paragraphes }], refuses: [{ index, bloc, raison }] }`
 * où `bloc` est le numéro du premier paragraphe ajouté.
 */
export function ajouter(ydoc, ajouts, auteur, ts = Date.now()) {
  const blocs = blocsDuDocument(ydoc)
  const racine = ydoc.getXmlFragment(NOM_TEXTE)
  const appliques = []
  const refuses = []
  const retenus = []
  const refuse = (index, bloc, raison) => refuses.push({ index, bloc, raison })

  ajouts.forEach((a, index) => {
    const numero = a && Number.isInteger(a.apres_bloc) && a.apres_bloc >= 0 ? a.apres_bloc : null
    if (numero === null)
      return refuse(index, a && a.apres_bloc, '`apres_bloc` doit être un numéro de bloc (0 pour tout au début)')
    if (typeof a.texte !== 'string') return refuse(index, numero, '`texte` doit être du texte')
    const lignes = a.texte
      .split(/\r\n|\r|\n/)
      .map((l) => typographier(l.trim()))
      .filter(Boolean)
    if (!lignes.length) return refuse(index, numero, 'le texte est vide')
    let ancre = null
    if (numero > 0) {
      const bloc = blocs[numero - 1]
      if (!bloc) return refuse(index, numero, `il n'y a pas de bloc ${numero}`)
      // Comme un correcteur dans l'éditeur : un saut de paragraphe se suit au
      // premier niveau du document, pas dans une liste ni une citation.
      if (bloc.contexte.length) {
        return refuse(
          index,
          numero,
          `le bloc ${numero} est dans ${bloc.contexte.includes('blockquote') ? 'une citation' : 'une liste'} : un paragraphe ne s'ajoute pas à cet endroit — ajoute-le après le bloc qui la précède ou la suit, ou propose-le dans un commentaire`
        )
      }
      ancre = bloc.el
    }
    retenus.push({ index, numero, ancre, lignes })
  })

  if (!retenus.length) return { appliques, refuses: refuses.sort((a, b) => a.index - b.index) }

  const trace = { user: auteur.name, userColor: auteur.color, ts, groupe: null }
  const couleur = { user: auteur.name, userColor: auteur.color }
  // Le dernier bloc posé après chaque ancre : un second ajout au même endroit
  // vient après le premier, pas avant.
  const dernier = new Map()
  ydoc.transact(() => {
    for (const { index, numero, ancre, lignes } of retenus) {
      const cle = ancre || 'debut'
      const base = dernier.get(cle) || ancre
      let position = base ? racine.toArray().indexOf(base) + 1 : 0
      if (base && position === 0) {
        refuse(index, numero, "le bloc n'est plus là")
        continue
      }
      for (const ligne of lignes) {
        const el = new Y.XmlElement('paragraph')
        racine.insert(position, [el])
        const xt = new Y.XmlText()
        el.insert(0, [xt])
        xt.insert(0, ligne, { insertion: trace, authorColor: couleur })
        dernier.set(cle, el)
        position += 1
      }
      appliques.push({ index, bloc: numero + 1, paragraphes: lignes.length })
    }
  }, 'agent')
  return { appliques: appliques.sort((a, b) => a.index - b.index), refuses: refuses.sort((a, b) => a.index - b.index) }
}

// --- Supprimer une note ou une image -----------------------------------------

/** Pourquoi un nœud suivi entier (note, image) ne peut pas être proposé à la
 * suppression, ou `null`. */
function refusDuSuivi(suivi, nom) {
  if (!suivi) return null
  if (suivi.type === 'deletion') return `${nom} est déjà proposée à la suppression, en attente d'un éditeur`
  return `${nom} vient d'être proposée (ajout en attente) : un éditeur doit d'abord l'accepter ou la refuser`
}

/**
 * Propose de supprimer, **en suivi de modifications**, des notes de bas de
 * page entières (`{ bloc, note }`, le repère ⟦k⟧ de la note dans le bloc) ou
 * des images (`{ image }`, leur rang parmi les images du document).
 *
 * Même geste qu'une personne qui efface une note ou une image en suivi
 * (client/src/suivi/reecriture.js) : le nœud reste en place et porte
 * `suivi: { type: 'deletion', user, userColor, ts }`. Accepter le retire,
 * refuser efface l'attribut. Le texte d'une note qu'une modification en
 * attente touche n'empêche rien : la décision sur la note entière l'emporte.
 *
 * `{ appliques: [{ index, bloc }], refuses: [{ index, bloc, raison }] }` —
 * `bloc` est celui de la note, ou celui qui précède l'image (null au début).
 */
export function supprimer(ydoc, elements, auteur, ts = Date.now()) {
  const blocs = blocsDuDocument(ydoc)
  const images = imagesDuDocument(ydoc)
  const appliques = []
  const refuses = []
  const retenus = []
  const vus = new Set()
  const refuse = (index, bloc, raison) => refuses.push({ index, bloc, raison })

  elements.forEach((e, index) => {
    if (!e || typeof e !== 'object') return refuse(index, null, 'élément invalide')
    const aNote = e.note !== undefined && e.note !== null
    const aImage = e.image !== undefined && e.image !== null
    if (aNote === aImage) {
      return refuse(
        index,
        Number.isInteger(e.bloc) ? e.bloc : null,
        'donne soit `bloc` et `note` (pour une note), soit `image` (pour une image)'
      )
    }
    let cible
    if (aImage) {
      if (!Number.isInteger(e.image) || e.image < 1)
        return refuse(index, null, "`image` doit être le numéro de l'image, tel que `lire` le donne (⟦image n⟧)")
      const img = images[e.image - 1]
      if (!img) {
        return refuse(
          index,
          null,
          images.length
            ? `il n'y a pas d'image ${e.image} (le document en compte ${images.length})`
            : "le document n'a aucune image"
        )
      }
      const refus = refusDuSuivi(img.suivi, `l'image ${e.image}`)
      if (refus) return refuse(index, img.apresBloc || null, refus)
      cible = { el: img.el, bloc: img.apresBloc || null }
    } else {
      if (!Number.isInteger(e.bloc)) return refuse(index, null, 'numéro de bloc manquant ou invalide')
      const c = cibleDe(blocs, e.bloc, e.note, { pourCorriger: false })
      if (c.refus) return refuse(index, e.bloc, c.refus)
      const refus = refusDuSuivi(c.note.suivi, `la note ⟦${e.note}⟧ du bloc ${e.bloc}`)
      if (refus) return refuse(index, e.bloc, refus)
      cible = { el: c.note.el, bloc: e.bloc }
    }
    if (vus.has(cible.el))
      return refuse(index, cible.bloc, 'cet élément est déjà demandé plus haut dans la même demande')
    vus.add(cible.el)
    retenus.push({ index, ...cible })
  })

  if (!retenus.length) return { appliques, refuses: refuses.sort((a, b) => a.index - b.index) }

  const suivi = { type: 'deletion', user: auteur.name, userColor: auteur.color, ts }
  ydoc.transact(() => {
    for (const r of retenus) {
      r.el.setAttribute('suivi', { ...suivi })
      appliques.push({ index: r.index, bloc: r.bloc })
    }
  }, 'agent')
  return { appliques: appliques.sort((a, b) => a.index - b.index), refuses: refuses.sort((a, b) => a.index - b.index) }
}

// --- Les modifications en attente -------------------------------------------

/** Qui a proposé un segment, et quoi : `{ type, user }` ou `null`. Le texte
 * porte ses marques, un nœud entier (note, image, saut de ligne) son
 * attribut `suivi`. */
function suiviDuSegment(seg) {
  if (seg.atome) return seg.suivi ? { type: seg.suivi.type, user: seg.suivi.user || '' } : null
  if (seg.attrs.insertion) return { type: 'insertion', user: seg.attrs.insertion.user || '' }
  if (seg.attrs.deletion) return { type: 'deletion', user: seg.attrs.deletion.user || '' }
  return null
}

/** Les modifications d'un contenu (un bloc, ou le texte d'une note) : des
 * suites de segments en attente **contigus et du même auteur** — un mot
 * barré suivi de son remplaçant font une seule modification, comme dans le
 * panneau. Une note suivie entière n'en fait pas partie (elle est traitée à
 * part) et coupe la suite. */
function regrouper(segments) {
  const groupes = []
  let courant = null
  for (const seg of segments) {
    const suivi = suiviDuSegment(seg)
    if (!suivi || (seg.atome && seg.nom === 'footnote')) {
      courant = null
      continue
    }
    if (courant && courant.user === suivi.user) courant.segments.push(seg)
    else {
      courant = { user: suivi.user, segments: [seg] }
      groupes.push(courant)
    }
  }
  return groupes
}

const EXTRAIT_MODIFICATION = 200
const CONTEXTE_MODIFICATION = 40
const court = (t) => (t.length > EXTRAIT_MODIFICATION ? `${t.slice(0, EXTRAIT_MODIFICATION)}…` : t)
const lisible = (t) => t.replace(/\n/g, ' ⏎ ')

/** Ce que dit une modification de texte : « remplace … par … », « insère … »,
 * « supprime … », avec le texte qui l'entoure (tel qu'il se lirait accepté). */
function decrireGroupe(groupe, texte) {
  let avant = ''
  let apres = ''
  for (const seg of groupe.segments) {
    const s = suiviDuSegment(seg)
    if (s.type === 'deletion') avant += seg.texte
    else apres += seg.texte
  }
  const premier = groupe.segments[0]
  const dernier = groupe.segments[groupe.segments.length - 1]
  const debut = premier.decalage
  const fin = dernier.visible ? dernier.decalage + dernier.texte.length : dernier.decalage
  const n = CONTEXTE_MODIFICATION
  const gauche = texte.slice(Math.max(0, debut - n), debut)
  const droite = texte.slice(fin, fin + n)
  const contexte = `${debut > n ? '…' : ''}${gauche}${texte.slice(debut, fin)}${droite}${fin + n < texte.length ? '…' : ''}`
  let quoi
  if (avant && apres) quoi = `remplace « ${court(lisible(avant))} » par « ${court(lisible(apres))} »`
  else if (apres) quoi = `insère « ${court(lisible(apres))} »`
  else quoi = `supprime « ${court(lisible(avant))} »`
  return { avant, apres, quoi, contexte: lisible(contexte) }
}

/**
 * Toutes les modifications en attente du document, dans l'ordre :
 * `[{ id, bloc, auteur, quoi, contexte, nature, cible }]`.
 *
 * `id` désigne la modification **dans l'état présent du document** :
 * `12-1` (la première du bloc 12), `12-n2` (la note ⟦2⟧ du bloc 12, ajoutée
 * ou supprimée entière), `12-n2-1` (une correction dans le texte de cette
 * note), `image-3`, `12-coupure` (un paragraphe coupé en deux en suivi). Il
 * change dès que le document change : on le relit avant de s'en servir.
 *
 * `nature` et `cible` servent à `retirer` : `texte` (des segments),
 * `paragraphe` (un paragraphe entièrement ajouté par la même personne),
 * `noeud` (une note, une image ou un saut de ligne suivis entiers),
 * `coupure` (que seul un éditeur défait).
 */
export function modificationsDuDocument(ydoc) {
  const blocs = blocsDuDocument(ydoc)
  const images = imagesDuDocument(ydoc)
  const out = []
  const parBloc = new Map()
  for (const img of images) {
    if (!img.suivi) continue
    const liste = parBloc.get(img.apresBloc) || []
    liste.push(img)
    parBloc.set(img.apresBloc, liste)
  }
  const ajouterImages = (n) => {
    for (const img of parBloc.get(n) || []) {
      const ajout = img.suivi.type !== 'deletion'
      out.push({
        id: `image-${img.numero}`,
        bloc: n || null,
        auteur: img.suivi.user || '',
        quoi: `${ajout ? 'ajoute' : 'supprime'} l'image ${img.numero}${img.alt.trim() ? ` « ${court(img.alt.trim())} »` : ''}`,
        contexte: '',
        nature: 'noeud',
        cible: { el: img.el, type: img.suivi.type },
      })
    }
  }
  ajouterImages(0)
  for (const b of blocs) {
    const coupure = b.el.getAttribute('trackedBreak')
    if (coupure) {
      out.push({
        id: `${b.n}-coupure`,
        bloc: b.n,
        auteur: coupure.user || '',
        quoi: `coupe le paragraphe : le bloc ${b.n} commence ici`,
        contexte: court(lisible(b.texte.slice(0, CONTEXTE_MODIFICATION))),
        nature: 'coupure',
        cible: null,
      })
    }
    const groupes = regrouper(b.segments)
    // Un paragraphe entièrement proposé par une seule personne (`ajouter`, ou
    // la réécriture d'un paragraphe) : le retirer retire le bloc.
    const entier =
      groupes.length === 1 &&
      b.segments.length > 0 &&
      b.segments.every((seg) => !seg.atome && seg.attrs.insertion) &&
      !b.el.getAttribute('trackedBreak')
    groupes.forEach((g, i) => {
      const d = decrireGroupe(g, b.texte)
      out.push({
        id: `${b.n}-${i + 1}`,
        bloc: b.n,
        auteur: g.user,
        quoi: entier ? `ajoute le paragraphe « ${court(lisible(d.apres))} »` : d.quoi,
        contexte: entier ? '' : d.contexte,
        nature: entier ? 'paragraphe' : 'texte',
        cible: entier ? { el: b.el } : { segments: g.segments },
      })
    })
    for (const note of b.notes) {
      const nom = `la note ⟦${note.k}⟧${note.numero ? ` (note ${note.numero})` : ''}`
      if (note.suivi) {
        const ajout = note.suivi.type !== 'deletion'
        out.push({
          id: `${b.n}-n${note.k}`,
          bloc: b.n,
          note: note.k,
          auteur: note.suivi.user || '',
          quoi: `${ajout ? 'ajoute' : 'supprime'} ${nom} : « ${court(lisible(note.texte))} »`,
          contexte: '',
          nature: 'noeud',
          cible: { el: note.el, type: note.suivi.type },
        })
        continue
      }
      regrouper(note.segments).forEach((g, i) => {
        const d = decrireGroupe(g, note.texte)
        out.push({
          id: `${b.n}-n${note.k}-${i + 1}`,
          bloc: b.n,
          note: note.k,
          auteur: g.user,
          quoi: `dans ${nom}, ${d.quoi}`,
          contexte: d.contexte,
          nature: 'texte',
          cible: { segments: g.segments },
        })
      })
    }
    ajouterImages(b.n)
  }
  return out
}

/**
 * Retire des propositions **de l'auteur lui-même** (`auteur.name`), désignées
 * par leur `id` (`modificationsDuDocument`), sans laisser de trace — comme
 * une personne qui efface ce qu'elle vient de proposer : le texte inséré
 * disparaît, le texte barré redevient normal, la note ou l'image ajoutée est
 * retirée, celle qu'on proposait de supprimer reste. La proposition d'un
 * autre ne se retire pas : seul un éditeur la refuse.
 *
 * Depuis le 03/11/2026, aussi ses propres commentaires, par leur identifiant
 * (celui que `fils` donne) : un fil s'en va avec ses réponses — refusé s'il
 * porte la réponse de quelqu'un d'autre —, une réponse s'en va seule.
 *
 * `{ appliques: [{ index, id, bloc }], refuses: [{ index, id, bloc, raison }] }`
 */
export function retirer(ydoc, ids, auteur) {
  const toutes = modificationsDuDocument(ydoc)
  const parId = new Map(toutes.map((m) => [m.id, m]))
  const carte = ydoc.getMap(NOM_COMMENTAIRES)
  const masques = ydoc.getMap(NOM_ORPHELINS)
  const appliques = []
  const refuses = []
  const retenues = []
  const commentaires = [] // [{ index, id, cles }]
  const vus = new Set()
  ids.forEach((id, index) => {
    const cle = typeof id === 'string' ? id.trim() : ''
    // Un commentaire (fil ou réponse) de l'agent lui-même (03/11/2026).
    const c = cle && !parId.has(cle) ? carte.get(cle) : null
    if (c && typeof c === 'object' && !masques.has(cle)) {
      if (vus.has(cle))
        return refuses.push({ index, id: cle, bloc: null, raison: 'déjà demandé plus haut dans la même demande' })
      vus.add(cle)
      if (c.author !== auteur.name)
        return refuses.push({
          index,
          id: cle,
          bloc: null,
          raison: `ce commentaire est de ${c.author || 'quelqu’un d’autre'} : tu ne retires que les tiens`,
        })
      const cles = [cle]
      if (!c.parent) {
        const reponses = []
        carte.forEach((r, rid) => {
          if (r && typeof r === 'object' && r.parent === cle) reponses.push({ ...r, id: rid })
        })
        if (reponses.some((r) => r.author !== auteur.name))
          return refuses.push({
            index,
            id: cle,
            bloc: null,
            raison:
              'ce fil porte la réponse de quelqu’un d’autre : il ne se retire pas ; corrige-toi plutôt par une réponse dans le fil',
          })
        cles.push(...reponses.map((r) => r.id))
      }
      commentaires.push({ index, id: cle, cles })
      return
    }
    const m = parId.get(cle)
    if (!m) {
      return refuses.push({
        index,
        id: cle,
        bloc: null,
        raison: `aucune modification en attente ni aucun commentaire ne porte l'identifiant « ${court(cle)} » — relis \`modifications\` ou \`commentaires\` : les identifiants des modifications changent dès que le document change`,
      })
    }
    if (m.auteur !== auteur.name)
      return refuses.push({
        index,
        id: cle,
        bloc: m.bloc,
        raison: `cette modification est de ${m.auteur || 'quelqu’un d’autre'} : tu ne retires que les tiennes (un éditeur accepte ou refuse les autres)`,
      })
    if (m.nature === 'coupure')
      return refuses.push({ index, id: cle, bloc: m.bloc, raison: 'une coupure de paragraphe ne se retire pas ici' })
    if (vus.has(cle))
      return refuses.push({ index, id: cle, bloc: m.bloc, raison: 'déjà demandé plus haut dans la même demande' })
    vus.add(cle)
    retenues.push({ index, m })
  })
  if (!retenues.length && !commentaires.length) return { appliques, refuses: refuses.sort((a, b) => a.index - b.index) }

  // Les segments de texte, du dernier au premier dans chaque XmlText : effacer
  // ne décale que ce qui suit.
  const morceaux = []
  const elements = []
  for (const { m } of retenues) {
    if (m.nature === 'texte') {
      for (const seg of m.cible.segments) {
        if (seg.atome) elements.push({ el: seg.el, type: seg.suivi.type })
        else morceaux.push({ xt: seg.xt, debut: seg.debut, fin: seg.fin, insertion: !!seg.attrs.insertion })
      }
    } else if (m.nature === 'paragraphe') elements.push({ el: m.cible.el, type: 'insertion' })
    else elements.push(m.cible)
  }
  const rangs = new Map()
  for (const x of morceaux) if (!rangs.has(x.xt)) rangs.set(x.xt, rangs.size)
  morceaux.sort((a, b) => rangs.get(a.xt) - rangs.get(b.xt) || b.debut - a.debut)

  ydoc.transact(() => {
    for (const x of morceaux) {
      if (x.insertion) x.xt.delete(x.debut, x.fin - x.debut)
      else x.xt.format(x.debut, x.fin - x.debut, { deletion: null })
    }
    for (const { el, type } of elements) {
      if (type === 'deletion') {
        el.removeAttribute('suivi')
        continue
      }
      const parent = el.parent
      const position = parent ? parent.toArray().indexOf(el) : -1
      if (position === -1) continue
      // Le document ne reste jamais sans bloc : le dernier se vide seulement.
      if (parent === ydoc.getXmlFragment(NOM_TEXTE) && parent.length === 1) {
        for (const enfant of el.toArray()) if (enfant instanceof Y.XmlText) enfant.delete(0, enfant.length)
        continue
      }
      parent.delete(position, 1)
    }
    // Un fil s'en va avec ses réponses, en une transaction, comme quand une
    // personne le résout (client/src/comments.js, `supprimerFil`).
    for (const { cles } of commentaires)
      for (const cle of cles) {
        carte.delete(cle)
        masques.delete(cle)
      }
  }, 'agent')
  for (const { index, id } of commentaires) appliques.push({ index, id, bloc: null })
  for (const { index, m } of retenues) appliques.push({ index, id: m.id, bloc: m.bloc })
  return { appliques: appliques.sort((a, b) => a.index - b.index), refuses: refuses.sort((a, b) => a.index - b.index) }
}

// --- Notes ajoutées -----------------------------------------------------------

/** Le tronçon d'un delta Yjs à partir de `point` (en signes), avec ses
 * attributs : ce qu'il faut recopier dans le nouveau texte quand un appel de
 * note coupe un paragraphe en deux. */
function queueDuDelta(delta, point) {
  const out = []
  let index = 0
  for (const op of delta) {
    const longueur = typeof op.insert === 'string' ? op.insert.length : 1
    if (index + longueur <= point) {
      index += longueur
      continue
    }
    if (typeof op.insert === 'string') {
      const morceau = op.insert.slice(Math.max(0, point - index))
      if (morceau) out.push(op.attributes ? { insert: morceau, attributes: op.attributes } : { insert: morceau })
    } else out.push(op)
    index += longueur
  }
  return out
}

/** Les commentaires dont l'ancre est dans `xt` à partir de `point` : à
 * remettre sur le nouveau texte une fois le paragraphe coupé. Une ancre se
 * range sur un élément Yjs précis — le texte recopié étant de nouveaux
 * éléments, sans cela les commentaires placés après l'appel perdraient leur
 * passage. Un commentaire à cheval sur le point est ramené à ce qui précède. */
function ancresADeplacer(ydoc, xt, point) {
  const carte = ydoc.getMap(NOM_COMMENTAIRES)
  const abs = (json) => {
    try {
      return json ? Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(json), ydoc) : null
    } catch {
      return null
    }
  }
  const out = []
  carte.forEach((c, id) => {
    if (!c || typeof c !== 'object') return
    const de = abs(c.anchorFrom)
    const a = abs(c.anchorTo)
    const deDansXt = de && de.type === xt
    const aDansXt = a && a.type === xt
    if (!deDansXt && !aDansXt) return
    out.push({
      id,
      valeur: c,
      de: deDansXt && de.index >= point ? de.index - point : null,
      a: aDansXt && a.index > point ? a.index - point : null,
    })
  })
  return out
}

function remettreLesAncres(ydoc, deplacements, xt, nouveau) {
  const carte = ydoc.getMap(NOM_COMMENTAIRES)
  for (const d of deplacements) {
    if (d.de === null && d.a === null) continue
    const suivante = { ...d.valeur }
    if (d.de !== null)
      suivante.anchorFrom = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(nouveau, d.de, 0))
    if (d.a !== null) {
      // À cheval : le début reste avant l'appel, la fin le suivrait dans un
      // autre texte, et une ancre ne se compte que dans un seul. On la ramène
      // à la fin de ce qui précède l'appel.
      suivante.anchorTo =
        d.de === null
          ? Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(xt, xt.length, 0))
          : Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(nouveau, d.a, 0))
    }
    carte.set(d.id, suivante)
  }
}

/**
 * Ajoute des notes de bas de page, en suivi de modifications :
 * `[{ bloc, apres, texte }]` — l'appel se pose **juste après** le passage
 * `apres` (une citation exacte et unique dans le bloc ; sans `apres`, à la
 * fin du bloc), et `texte` est la note.
 *
 * Même forme que ce que l'éditeur écrit quand une personne insère une note
 * avec le suivi allumé (client/src/footnotes.js, `insererNote`) : un élément
 * `footnote` dont l'attribut `suivi` vaut `{ type: 'insertion', user,
 * userColor, ts }`, qui contient son texte, sans marque — la proposition,
 * c'est la note entière. Accepter lève l'attribut ; rejeter retire la note.
 *
 * Poser un appel au milieu d'une ligne coupe son texte en deux dans Yjs (un
 * nœud ne se glisse pas dans un XmlText) : c'est ce que fait aussi le client.
 * Les commentaires ancrés après l'appel sont suivis sur le nouveau texte.
 *
 * Refusé : dans un titre (le schéma n'y admet pas de note), un texte vide ou
 * trop long, un endroit qui tombe au milieu d'une proposition en attente.
 *
 * `{ appliques: [{ index, bloc }], refuses: [{ index, bloc, raison }] }`
 */
export function ajouterNotes(ydoc, demandes, auteur, ts = Date.now()) {
  const blocs = blocsDuDocument(ydoc)
  const appliques = []
  const refuses = []
  const retenus = []
  const refuse = (index, bloc, raison) => refuses.push({ index, bloc, raison })

  demandes.forEach((d, index) => {
    const numero = d && Number.isInteger(d.bloc) ? d.bloc : null
    if (numero === null) return refuse(index, d && d.bloc, 'numéro de bloc manquant ou invalide')
    if (typeof d.texte !== 'string') return refuse(index, numero, '`texte` doit être du texte')
    // Une note ne porte ni paragraphe ni liste : un saut de ligne y serait
    // une espace.
    const texte = typographier(d.texte.replace(/\s*[\r\n]+\s*/g, ' ').trim())
    if (!texte) return refuse(index, numero, 'le texte de la note est vide')
    const bloc = blocs[numero - 1]
    if (!bloc) return refuse(index, numero, `il n'y a pas de bloc ${numero}`)
    if (bloc.nom === 'heading') {
      return refuse(
        index,
        numero,
        `le bloc ${numero} est un titre : un titre reprend dans la table des matières et l'en-tête de page, où un appel de note n'a rien à faire — pose la note dans le paragraphe qui suit`
      )
    }
    if (d.apres !== undefined && d.apres !== null && typeof d.apres !== 'string')
      return refuse(index, numero, '`apres` doit être un passage du bloc (ou rester absent pour la fin du bloc)')

    if (!d.apres) {
      retenus.push({ index, numero, el: bloc.el, xt: null, point: null, texte })
      return
    }
    const trouve = situer(bloc, d.apres)
    if (!trouve.ok) return refuse(index, numero, trouve.raison)
    const plage = plageDansLeTexte(bloc, trouve.fin - 1, trouve.fin, { permettreMarques: true })
    if (!plage.ok) return refuse(index, numero, plage.raison)
    const seg = plage.segments[0]
    // Au milieu d'une proposition d'un autre, non : on ne s'y glisse pas.
    if (seg.enAttente && plage.jusqua > seg.debut && plage.jusqua < seg.fin) {
      return refuse(
        index,
        numero,
        "l'endroit est dans une modification déjà en attente : attends qu'un éditeur la traite, ou place la note après elle"
      )
    }
    retenus.push({ index, numero, el: bloc.el, xt: plage.xt, point: plage.jusqua, texte })
  })

  if (!retenus.length) return { appliques, refuses: refuses.sort((a, b) => a.index - b.index) }

  const suivi = { type: 'insertion', user: auteur.name, userColor: auteur.color, ts }
  const fabriquer = (texte) => {
    const note = new Y.XmlElement('footnote')
    note.setAttribute('suivi', { ...suivi })
    return { note, texte }
  }
  // Les appels qui tombent dans un même texte, du plus loin au plus proche :
  // couper à un point ne déplace que ce qui le suit. À point égal, ils se
  // posent d'un seul geste, dans l'ordre demandé.
  const groupes = new Map() // xt → Map(point → [retenu])
  const alaFin = new Map() // el → [retenu]
  for (const r of retenus) {
    if (r.xt) {
      if (!groupes.has(r.xt)) groupes.set(r.xt, new Map())
      const parPoint = groupes.get(r.xt)
      if (!parPoint.has(r.point)) parPoint.set(r.point, [])
      parPoint.get(r.point).push(r)
    } else {
      if (!alaFin.has(r.el)) alaFin.set(r.el, [])
      alaFin.get(r.el).push(r)
    }
  }
  const poses = new Set()
  const poser = (parent, position, rs) => {
    const fabriques = rs.map((r) => fabriquer(r.texte))
    parent.insert(
      position,
      fabriques.map((f) => f.note)
    )
    // Le texte d'une note s'écrit une fois la note intégrée au document.
    fabriques.forEach((f, i) => {
      const xt = new Y.XmlText()
      f.note.insert(0, [xt])
      xt.insert(0, f.texte)
      poses.add(rs[i])
    })
  }

  ydoc.transact(() => {
    for (const [xt, parPoint] of groupes) {
      const parent = xt.parent
      const position = parent ? parent.toArray().indexOf(xt) : -1
      if (position === -1) {
        for (const rs of parPoint.values()) for (const r of rs) refuse(r.index, r.numero, "le bloc n'est plus là")
        continue
      }
      const points = [...parPoint.keys()].sort((a, b) => b - a)
      for (const point of points) {
        const rs = parPoint.get(point)
        const longueur = xt.length
        if (point <= 0) poser(parent, position, rs)
        else if (point >= longueur) poser(parent, position + 1, rs)
        else {
          const queue = queueDuDelta(xt.toDelta(), point)
          const deplacements = ancresADeplacer(ydoc, xt, point)
          xt.delete(point, longueur - point)
          const suite = new Y.XmlText()
          parent.insert(position + 1, [suite])
          suite.applyDelta(queue, { sanitize: false })
          remettreLesAncres(ydoc, deplacements, xt, suite)
          poser(parent, position + 1, rs)
        }
      }
    }
    for (const [el, rs] of alaFin) poser(el, el.length, rs)
  }, 'agent')

  for (const r of retenus) if (poses.has(r)) appliques.push({ index: r.index, bloc: r.numero })
  return { appliques: appliques.sort((a, b) => a.index - b.index), refuses: refuses.sort((a, b) => a.index - b.index) }
}

// --- Commentaires -----------------------------------------------------------

function identifiant(prefixe) {
  return `${prefixe}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const ANCRE_NOTE_MAX = 60

/**
 * Où ancrer un commentaire qui porte sur une note : **le texte qui touche
 * son appel**, pas le texte de la note. Une ancre à l'intérieur d'une note
 * tomberait dans un nœud que l'éditeur ne dessine pas dans la colonne du
 * texte — la carte n'aurait nulle part où se poser. Le commentaire dit de
 * quelle note il parle (voir `commenter`).
 */
function ancreDeNote(cible) {
  const freres = cible.bloc.el.toArray()
  const i = freres.indexOf(cible.el)
  const avant = freres[i - 1]
  if (avant instanceof Y.XmlText && avant.length > 0) {
    return { ok: true, xt: avant, de: Math.max(0, avant.length - ANCRE_NOTE_MAX), jusqua: avant.length }
  }
  const apres = freres[i + 1]
  if (apres instanceof Y.XmlText && apres.length > 0) {
    return { ok: true, xt: apres, de: 0, jusqua: Math.min(apres.length, ANCRE_NOTE_MAX) }
  }
  return {
    ok: false,
    raison: `aucun texte autour de l'appel de la note ⟦${cible.note.k}⟧ du bloc ${cible.n} : commente plutôt le bloc, avec une citation`,
  }
}

/**
 * Un commentaire ancré sur `citation`, dans le bloc `bloc`. Avec `note` (le
 * repère ⟦k⟧ d'une note du bloc), il porte sur cette note : il est ancré sur
 * le texte qui précède son appel, et son texte commence par « À propos de la
 * note 12 : » pour que la personne sache de quoi il parle. `citation` est
 * alors inutile.
 */
export function commenter(ydoc, { bloc: numero, citation, texte, note }, auteur) {
  let propre = typographier(String(texte || '').trim())
  if (!propre) return { ok: false, raison: 'le commentaire est vide' }
  if (!Number.isInteger(numero)) return { ok: false, raison: 'numéro de bloc manquant ou invalide' }
  const blocs = blocsDuDocument(ydoc)
  let plage
  if (note !== undefined && note !== null) {
    const cible = cibleDe(blocs, numero, note, { pourCorriger: false })
    if (cible.refus) return { ok: false, raison: cible.refus }
    plage = ancreDeNote(cible)
    if (!plage.ok) return plage
    const nom = cible.note.numero ? `la note ${cible.note.numero}` : `la note ⟦${note}⟧ du bloc ${numero}`
    propre = `À propos de ${nom} : ${propre}`
  } else {
    const bloc = blocs[numero - 1]
    if (!bloc) return { ok: false, raison: `il n'y a pas de bloc ${numero}` }
    const trouve = situer(bloc, String(citation || ''))
    if (!trouve.ok) return { ok: false, raison: trouve.raison }
    plage = plageDansLeTexte(bloc, trouve.debut, trouve.fin, { permettreMarques: true })
    if (!plage.ok) return { ok: false, raison: plage.raison }
  }
  const id = identifiant('c')
  ydoc.transact(() => {
    ydoc.getMap(NOM_COMMENTAIRES).set(id, {
      id,
      author: auteur.name,
      authorId: auteur.id || AUTEUR_AGENT,
      color: auteur.color,
      anchorFrom: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(plage.xt, plage.de, 0)),
      anchorTo: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(plage.xt, plage.jusqua, 0)),
      text: propre,
      createdAt: Date.now(),
    })
  }, 'agent')
  return { ok: true, id }
}

/** Les fils de commentaires, avec le passage commenté quand on sait le
 * retrouver. */
export function fils(ydoc) {
  const carte = ydoc.getMap(NOM_COMMENTAIRES)
  const racines = []
  const reponses = new Map()
  const masques = ydoc.getMap(NOM_ORPHELINS)
  carte.forEach((c, id) => {
    if (!c || typeof c !== 'object') return
    // Un passage supprimé : le commentaire n'existe plus que pour Ctrl+Z.
    if (masques.has(id)) return
    if (c.parent) {
      if (!reponses.has(c.parent)) reponses.set(c.parent, [])
      reponses.get(c.parent).push({ ...c, id })
    } else racines.push({ ...c, id })
  })
  racines.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
  const blocs = blocsDuDocument(ydoc)
  return racines.map((c) => ({
    id: c.id,
    auteur: c.author,
    texte: c.text,
    date: c.createdAt,
    bloc: blocDe(ydoc, blocs, c),
    passage: passageDe(ydoc, c),
    reponses: (reponses.get(c.id) || [])
      .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
      .map((r) => ({ id: r.id, auteur: r.author, texte: r.text, date: r.createdAt })),
  }))
}

function resoudre(ydoc, json) {
  try {
    if (!json) return null
    const abs = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(json), ydoc)
    return abs && abs.type instanceof Y.XmlText ? abs : null
  } catch {
    return null
  }
}

function passageDe(ydoc, c) {
  const a = resoudre(ydoc, c.anchorFrom)
  const b = resoudre(ydoc, c.anchorTo)
  if (!a || !b || a.type !== b.type || b.index <= a.index) return null
  // Le texte visible seulement : ce que les suppressions en attente ont
  // retiré n'est plus ce que la personne a commenté.
  let index = 0
  let out = ''
  for (const op of a.type.toDelta()) {
    if (typeof op.insert !== 'string') {
      index += 1
      continue
    }
    const supprime = op.attributes && op.attributes.deletion
    const de = Math.max(a.index, index)
    const jusqua = Math.min(b.index, index + op.insert.length)
    if (!supprime && jusqua > de) out += op.insert.slice(de - index, jusqua - index)
    index += op.insert.length
  }
  return out.length > 400 ? out.slice(0, 400) + '…' : out
}

function blocDe(ydoc, blocs, c) {
  const a = resoudre(ydoc, c.anchorFrom)
  if (!a) return null
  const b = blocs.find((bl) => bl.segments.some((s) => s.xt === a.type))
  return b ? b.n : null
}

/** Répond à un fil (un seul niveau, comme dans l'éditeur). */
export function repondre(ydoc, { commentaire, texte }, auteur) {
  const propre = typographier(String(texte || '').trim())
  if (!propre) return { ok: false, raison: 'la réponse est vide' }
  const carte = ydoc.getMap(NOM_COMMENTAIRES)
  const parent = carte.get(String(commentaire || ''))
  if (!parent || parent.parent)
    return { ok: false, raison: "commentaire introuvable (on ne répond qu'à un commentaire ancré dans le texte)" }
  const id = identifiant('r')
  ydoc.transact(() => {
    carte.set(id, {
      id,
      parent: parent.id,
      author: auteur.name,
      authorId: auteur.id || AUTEUR_AGENT,
      color: auteur.color,
      text: propre,
      createdAt: Date.now(),
    })
  }, 'agent')
  return { ok: true, id }
}
