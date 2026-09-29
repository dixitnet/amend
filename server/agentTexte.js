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
// correcteur : le nouveau texte (marque `insertion`) précède l'ancien, barré
// (marque `deletion`), les deux moitiés partageant un `groupe`. Rien ne
// devient définitif avant qu'un éditeur l'accepte.

import * as Y from 'yjs'
import { diffWords } from '../shared/diff.js'

export const NOM_TEXTE = 'prosemirror-content'
export const NOM_COMMENTAIRES = 'comments'

const LONGUEUR_AVANT_MAX = 2000
const LONGUEUR_APRES_MAX = 4000
const LONGUEUR_COMMENTAIRE_MAX = 4000
export const REMPLACEMENTS_MAX = 30

const MARQUES_DE_SUIVI = new Set(['insertion', 'deletion', 'authorColor'])

/** Espaces insécables et apostrophes typographiques : un agent écrit
 * rarement la même chose que le document, et « introuvable » pour une
 * espace fine est une réponse inutile. Longueur conservée (1 pour 1), pour
 * que les positions trouvées sur le texte normalisé valent pour l'original. */
function normaliser(s) {
  return s.replace(/[    ]/g, ' ').replace(/[’‘ʼ]/g, "'")
}

const CARACTERE_DE_MOT = /[\p{L}\p{N}_]/u
const estMot = (c) => !!c && CARACTERE_DE_MOT.test(c)

// --- Lecture --------------------------------------------------------------

/**
 * Les blocs de texte du document, dans l'ordre : `[{ n, nom, niveau,
 * contexte, texte, segments, enAttente }]`. `n` commence à 1 et compte
 * **tous** les blocs, vides compris — un numéro ne dépend pas de ce qu'on
 * choisit d'afficher.
 *
 * `texte` est le texte **tel qu'il se lirait si tout ce qui est en attente
 * était accepté** : les insertions y sont, les suppressions n'y sont pas. Un
 * saut de ligne y vaut `\n`, une note ou une image `⟦k⟧`.
 */
export function blocsDuDocument(ydoc) {
  const racine = ydoc.getXmlFragment(NOM_TEXTE)
  const blocs = []
  parcourir(racine, [])
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

function estBlocTexte(el) {
  if (el.nodeName === 'paragraph' || el.nodeName === 'heading') return true
  return el.toArray().some((c) => c instanceof Y.XmlText)
}

function decrireBloc(el, contexte, n) {
  const segments = []
  let texte = ''
  let atomes = 0
  let enAttente = !!el.getAttribute('trackedBreak')
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
          ajouter({ xt: enfant, debut: index, fin: index + 1, texte: '⟦?⟧', attrs: {}, atome: true, supprime: false, enAttente: false })
          index += 1
        }
      }
    } else if (enfant instanceof Y.XmlElement) {
      const suivi = enfant.getAttribute('suivi')
      const supprime = !!(suivi && suivi.type === 'deletion')
      let marque
      if (enfant.nodeName === 'hard_break') marque = '\n'
      else marque = `⟦${++atomes}⟧`
      ajouter({ xt: null, texte: marque, attrs: {}, atome: true, nom: enfant.nodeName, supprime, enAttente: !!suivi })
    }
  }
  const niveau = el.nodeName === 'heading' ? Number(el.getAttribute('level')) || 1 : null
  return { n, nom: el.nodeName, niveau, contexte, texte, segments, enAttente, el }
}

/** Comme blocsDuDocument, mais réduit à ce qu'un agent lit : pas de
 * segments ni d'éléments Yjs, rien qui puisse fuiter dans une réponse. */
export function resume(bloc) {
  return { n: bloc.n, type: bloc.nom, niveau: bloc.niveau, contexte: bloc.contexte, texte: bloc.texte, enAttente: bloc.enAttente }
}

export function statistiques(blocs) {
  let mots = 0
  for (const b of blocs) mots += (b.texte.match(/\S+/g) || []).length
  return { blocs: blocs.length, mots }
}

// --- Retrouver un passage --------------------------------------------------

/**
 * Où `citation` se trouve dans `bloc` : `{ ok, debut, fin }` (décalages dans
 * `bloc.texte`) — ou `{ ok: false, raison }`. Exact d'abord ; si rien, en
 * ignorant la différence entre espaces (normales, insécables, fines) et
 * entre apostrophes (droite, typographique).
 */
export function situer(bloc, citation) {
  if (!citation) return { ok: false, raison: 'le texte à retrouver est vide' }
  const exact = occurrences(bloc.texte, citation)
  if (exact.length === 1) return { ok: true, debut: exact[0], fin: exact[0] + citation.length, approche: false }
  if (exact.length > 1) return { ok: false, raison: `ce passage apparaît ${exact.length} fois dans le bloc ${bloc.n} : allonge-le pour qu'il soit unique` }
  const large = occurrences(normaliser(bloc.texte), normaliser(citation))
  if (large.length === 1) return { ok: true, debut: large[0], fin: large[0] + citation.length, approche: true }
  if (large.length > 1) return { ok: false, raison: `ce passage apparaît ${large.length} fois dans le bloc ${bloc.n} : allonge-le pour qu'il soit unique` }
  return { ok: false, raison: `ce passage est introuvable dans le bloc ${bloc.n} — recopie-le exactement, tel que lire le montre (le texte a peut-être changé depuis)` }
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
      raison: `le passage recouvre ${atome.texte === '\n' ? 'un saut de ligne' : `la note ou l'image ${atome.texte}`} : fais deux propositions distinctes, de part et d'autre`,
    }
  }
  const xt = couverts[0].xt
  if (couverts.some((s) => s.xt !== xt)) return { ok: false, raison: 'le passage traverse un élément du document : découpe-le' }
  // Les segments physiques entre le premier et le dernier doivent être
  // ceux-là seulement : une suppression en attente au milieu ne se voit
  // pas dans le texte, mais elle est bien dans le passage.
  const physiques = bloc.segments.filter((s) => s.xt === xt)
  const i0 = physiques.indexOf(couverts[0])
  const i1 = physiques.indexOf(couverts[couverts.length - 1])
  const entre = physiques.slice(i0, i1 + 1)
  if (entre.some((s) => !s.visible)) return { ok: false, raison: 'le passage contient une suppression déjà en attente : attends qu\'elle soit traitée' }
  if (!permettreMarques && entre.some((s) => s.enAttente)) {
    return { ok: false, raison: 'le passage contient déjà une modification en attente : attends qu\'un éditeur la traite' }
  }
  const de = couverts[0].debut + (debut - couverts[0].decalage)
  const jusqua = couverts[couverts.length - 1].debut + (fin - couverts[couverts.length - 1].decalage)
  return { ok: true, xt, de, jusqua, segments: couverts }
}

// --- Proposer --------------------------------------------------------------

/**
 * Découpe un remplacement `avant` → `apres` en modifications élémentaires,
 * **avec l'algorithme de l'IA du panneau** (shared/diff.js) : mot à mot, les
 * mots inchangés restent intacts, un mot remplacé par un autre est une paire
 * (nouveau avant ancien, un groupe), et un mot presque identique
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
    if (typeof r.avant !== 'string' || typeof r.apres !== 'string') return refuse(index, numero, '`avant` et `apres` doivent être du texte')
    if (r.avant.length > LONGUEUR_AVANT_MAX) return refuse(index, numero, `\`avant\` est trop long (${LONGUEUR_AVANT_MAX} signes au plus) : propose plusieurs remplacements courts`)
    if (r.apres.length > LONGUEUR_APRES_MAX) return refuse(index, numero, `\`apres\` est trop long (${LONGUEUR_APRES_MAX} signes au plus)`)
    const bloc = blocs[numero - 1]
    if (!bloc) return refuse(index, numero, `il n'y a pas de bloc ${numero}`)
    const trouve = situer(bloc, r.avant)
    if (!trouve.ok) return refuse(index, numero, trouve.raison)
    // Un nœud texte ProseMirror ne porte pas de saut de ligne.
    const apres = r.apres.replace(/[\r\n]+/g, ' ')
    const modifications = modificationsDe(r.avant, apres)
    if (!modifications.length) return refuse(index, numero, 'rien ne change entre `avant` et `apres`')

    const morceaux = []
    for (const m of modifications) {
      const debut = trouve.debut + m.de
      if (m.fin > m.de) {
        const plage = plageDansLeTexte(bloc, debut, trouve.debut + m.fin)
        if (!plage.ok) return refuse(index, numero, plage.raison)
        morceaux.push({ index, numero, xt: plage.xt, de: plage.de, jusqua: plage.jusqua, nouveau: m.nouveau, paire: m.paire, forme: miseEnFormeHeritee(plage.segments[0]) })
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
        if (seg.enAttente && auMilieu) return refuse(index, numero, "l'endroit est dans une modification déjà en attente : attends qu'un éditeur la traite")
        morceaux.push({ index, numero, xt: plage.xt, de: point, jusqua: point, nouveau: m.nouveau, paire: false, forme: miseEnFormeHeritee(seg, { sansLien: !auMilieu }) })
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
  // Du dernier au premier : chaque écriture ne décale que ce qui la suit. À
  // position égale, la suppression avant l'insertion : le nouveau texte se
  // place ainsi devant l'ancien barré.
  const ordre = [...retenus].sort((a, b) => rangs.get(a.xt) - rangs.get(b.xt) || b.de - a.de || b.jusqua - a.jusqua)
  const tracer = (groupe) => ({ user: auteur.name, userColor: auteur.color, ts, groupe })
  const couleur = { user: auteur.name, userColor: auteur.color }
  ydoc.transact(() => {
    for (const { xt, de, jusqua, nouveau, paire, forme } of ordre) {
      if (jusqua > de && nouveau && paire) {
        const groupe = `${ts}-${Math.random().toString(36).slice(2, 8)}`
        xt.insert(de, nouveau, { ...forme, insertion: tracer(groupe), authorColor: couleur })
        xt.format(de + nouveau.length, jusqua - de, { deletion: tracer(groupe) })
      } else if (jusqua > de) {
        xt.format(de, jusqua - de, { deletion: tracer(null) })
      } else {
        xt.insert(de, nouveau, { ...forme, insertion: tracer(null), authorColor: couleur })
      }
    }
  }, 'agent')
  return { appliques: appliques.sort((a, b) => a.index - b.index), refuses: refuses.sort((a, b) => a.index - b.index) }
}

// --- Commentaires -----------------------------------------------------------

function identifiant(prefixe) {
  return `${prefixe}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Un commentaire ancré sur `citation`, dans le bloc `bloc`. */
export function commenter(ydoc, { bloc: numero, citation, texte }, auteur) {
  const propre = String(texte || '').trim()
  if (!propre) return { ok: false, raison: 'le commentaire est vide' }
  if (propre.length > LONGUEUR_COMMENTAIRE_MAX) return { ok: false, raison: `le commentaire est trop long (${LONGUEUR_COMMENTAIRE_MAX} signes au plus)` }
  if (!Number.isInteger(numero)) return { ok: false, raison: 'numéro de bloc manquant ou invalide' }
  const blocs = blocsDuDocument(ydoc)
  const bloc = blocs[numero - 1]
  if (!bloc) return { ok: false, raison: `il n'y a pas de bloc ${numero}` }
  const trouve = situer(bloc, String(citation || ''))
  if (!trouve.ok) return { ok: false, raison: trouve.raison }
  const plage = plageDansLeTexte(bloc, trouve.debut, trouve.fin, { permettreMarques: true })
  if (!plage.ok) return { ok: false, raison: plage.raison }
  const id = identifiant('c')
  ydoc.transact(() => {
    ydoc.getMap(NOM_COMMENTAIRES).set(id, {
      id,
      author: auteur.name,
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
  carte.forEach((c, id) => {
    if (!c || typeof c !== 'object') return
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
  const propre = String(texte || '').trim()
  if (!propre) return { ok: false, raison: 'la réponse est vide' }
  if (propre.length > LONGUEUR_COMMENTAIRE_MAX) return { ok: false, raison: `la réponse est trop longue (${LONGUEUR_COMMENTAIRE_MAX} signes au plus)` }
  const carte = ydoc.getMap(NOM_COMMENTAIRES)
  const parent = carte.get(String(commentaire || ''))
  if (!parent || parent.parent) return { ok: false, raison: 'commentaire introuvable (on ne répond qu\'à un commentaire ancré dans le texte)' }
  const id = identifiant('r')
  ydoc.transact(() => {
    carte.set(id, { id, parent: parent.id, author: auteur.name, color: auteur.color, text: propre, createdAt: Date.now() })
  }, 'agent')
  return { ok: true, id }
}
