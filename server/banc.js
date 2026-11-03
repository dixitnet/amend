// Le banc d'essai de Margo (03/11/2026), réservé aux administrateurs : un texte,
// une consigne, et deux ou trois réglages de Margo (modèle, manière de répondre)
// qui travaillent chacun sur **sa propre copie du texte**, en même temps, pour
// comparer ce qu'ils proposent.
//
// Ce n'est pas un second moteur : chaque colonne passe par la boucle de Margo
// (server/dialogue.js) et les outils du connecteur (server/mcp.js), avec les
// droits d'un correcteur et les garde-fous en vigueur. Ce qui change :
//   - le document est un Y.Doc **en mémoire**, créé pour l'essai et jeté après :
//     il n'est jamais enregistré, n'a pas d'identifiant de stockage, et personne
//     d'autre ne peut l'ouvrir ;
//   - rien n'est compté : ni dans les quotas, ni dans la consommation du
//     back-office, ni dans le journal `dialogue` (décision de Sylvain,
//     03/11/2026). Le coût réel apparaît donc sur la facture des fournisseurs
//     sans apparaître au back-office — la page le dit ;
//   - la limite « signes par demande » de production ne bloque pas l'essai :
//     elle est relevée à la taille du texte (la page dit si la production
//     aurait refusé la demande).
//
// Rien du texte ni des résultats n'est journalisé ni gardé : la réponse est
// diffusée au navigateur, puis tout est oublié.

import { randomBytes } from 'node:crypto'
import * as Y from 'yjs'
import { Dialogue } from './dialogue.js'
import { blocsDuDocument, fils, NOM_TEXTE } from './agentTexte.js'
import { capabilities } from './roles.js'
import { cleDe, reflexionDe, serviceDe } from './fournisseurs.js'
import { nfc } from '../shared/propre.js'

export const COLONNES_MAX = 3
/** Le corps d'une demande : un livre entier tient dedans (un signe pèse au plus
 * 4 octets en UTF-8 ; le français courant, à peine plus d'un). */
export const BANC_CORPS_OCTETS_MAX = 8 * 1024 * 1024
export const TITRE_PAR_DEFAUT = 'Texte d’essai'

// ------------------------------------------------------------ texte → Y.Doc

/** Les marques en ligne d'un Markdown simple : **gras**, *italique*, _italique_. */
const EN_LIGNE = /(\*\*[^*\n]+?\*\*|\*[^*\s][^*\n]*?\*|(?<![\p{L}\p{N}])_[^_\s][^_\n]*?_(?![\p{L}\p{N}]))/u

export function morceauxEnLigne(ligne) {
  const morceaux = []
  for (const partie of ligne.split(EN_LIGNE)) {
    if (!partie) continue
    if (partie.length > 4 && partie.startsWith('**') && partie.endsWith('**'))
      morceaux.push([partie.slice(2, -2), { strong: {} }])
    else if (
      partie.length > 2 &&
      ((partie.startsWith('*') && partie.endsWith('*')) || (partie.startsWith('_') && partie.endsWith('_')))
    )
      morceaux.push([partie.slice(1, -1), { em: {} }])
    else morceaux.push([partie, {}])
  }
  return morceaux
}

/**
 * Le texte collé, lu comme un Markdown simple : `#` à `######` pour les titres,
 * `- ` ou `* ` pour les puces, `1. ` pour les listes numérotées, `> ` pour les
 * citations. **Chaque ligne non vide est un bloc** : un texte copié depuis un
 * traitement de texte (un paragraphe par ligne) et un Markdown (paragraphes
 * séparés par une ligne vide) donnent le même document.
 * Renvoie `[{ type, niveau?, items?, texte? }]`.
 */
export function blocsDeTexte(brut) {
  const lignes = nfc(String(brut || ''))
    .replace(/\r\n?/g, '\n')
    .split('\n')
  const blocs = []
  for (const ligneBrute of lignes) {
    const ligne = ligneBrute.replace(/\s+$/, '')
    if (!ligne.trim()) continue
    let m
    if ((m = ligne.match(/^\s{0,3}(#{1,6})\s+(.*)$/))) {
      blocs.push({ type: 'heading', niveau: m[1].length, texte: m[2].trim() })
    } else if ((m = ligne.match(/^\s*[-*•]\s+(.*)$/))) {
      const dernier = blocs[blocs.length - 1]
      if (dernier && dernier.type === 'bullet_list') dernier.items.push(m[1].trim())
      else blocs.push({ type: 'bullet_list', items: [m[1].trim()] })
    } else if ((m = ligne.match(/^\s*\d+[.)]\s+(.*)$/))) {
      const dernier = blocs[blocs.length - 1]
      if (dernier && dernier.type === 'ordered_list') dernier.items.push(m[1].trim())
      else blocs.push({ type: 'ordered_list', items: [m[1].trim()] })
    } else if ((m = ligne.match(/^\s*>\s?(.*)$/))) {
      if (m[1].trim()) blocs.push({ type: 'blockquote', texte: m[1].trim() })
    } else {
      blocs.push({ type: 'paragraph', texte: ligne.trim() })
    }
  }
  return blocs
}

function ecrireTexte(el, ligne) {
  const xt = new Y.XmlText()
  el.insert(0, [xt])
  let index = 0
  for (const [texte, marques] of morceauxEnLigne(ligne)) {
    // Les attributs sont donnés à chaque morceau, même vides : Yjs reprend
    // sinon ceux du morceau précédent (voir server/modeleBienvenue.js).
    xt.insert(index, texte, marques)
    index += texte.length
  }
}

function paragraphe(parent, ligne) {
  const p = new Y.XmlElement('paragraph')
  parent.insert(parent.length, [p])
  ecrireTexte(p, ligne)
}

/** Un Y.Doc de la forme que y-prosemirror donne au document (comme
 * server/modeleBienvenue.js), sans aucune marque de suivi. */
export function documentDeTexte(brut) {
  const ydoc = new Y.Doc()
  const racine = ydoc.getXmlFragment(NOM_TEXTE)
  ydoc.transact(() => {
    for (const bloc of blocsDeTexte(brut)) {
      if (bloc.type === 'heading') {
        const el = new Y.XmlElement('heading')
        racine.insert(racine.length, [el])
        el.setAttribute('level', bloc.niveau)
        ecrireTexte(el, bloc.texte)
      } else if (bloc.type === 'bullet_list' || bloc.type === 'ordered_list') {
        const liste = new Y.XmlElement(bloc.type)
        racine.insert(racine.length, [liste])
        for (const item of bloc.items) {
          const li = new Y.XmlElement('list_item')
          liste.insert(liste.length, [li])
          paragraphe(li, item)
        }
      } else if (bloc.type === 'blockquote') {
        const q = new Y.XmlElement('blockquote')
        racine.insert(racine.length, [q])
        paragraphe(q, bloc.texte)
      } else {
        paragraphe(racine, bloc.texte)
      }
    }
  }, 'banc')
  return ydoc
}

// ----------------------------------------------------------- Y.Doc → résultat

const regrouper = (morceaux) => {
  const out = []
  for (const m of morceaux) {
    if (!m.t) continue
    const dernier = out[out.length - 1]
    if (dernier && dernier.type === m.type) dernier.t += m.t
    else out.push({ ...m })
  }
  return out
}

/** Le contenu d'un bloc (ou d'une note) en morceaux `{ t, type }`, `type`
 * valant 'egal', 'ins' ou 'del'. Une note devient `[note : …]`. */
function morceauxDe(segments, notes) {
  const morceaux = []
  let k = 0
  for (const s of segments) {
    if (!s.atome) {
      const type = s.attrs.deletion ? 'del' : s.attrs.insertion ? 'ins' : 'egal'
      morceaux.push({ t: s.texte, type })
      continue
    }
    if (s.nom === 'footnote') {
      const note = notes[k++]
      if (!note) continue
      const suivi = note.suivi && note.suivi.type
      if (suivi === 'deletion' || suivi === 'insertion') {
        const type = suivi === 'deletion' ? 'del' : 'ins'
        morceaux.push({ t: `[note : ${note.texte}]`, type })
      } else {
        morceaux.push({ t: '[note : ', type: 'egal' })
        morceaux.push(...morceauxDe(note.segments, []))
        morceaux.push({ t: ']', type: 'egal' })
      }
    } else if (s.texte === '\n') {
      morceaux.push({ t: '\n', type: s.supprime ? 'del' : 'egal' })
    } else {
      morceaux.push({ t: s.nom === 'image' ? '[image]' : s.texte, type: s.supprime ? 'del' : 'egal' })
    }
  }
  return morceaux
}

/** Ce que Margo a laissé dans le document : les blocs qui portent une
 * modification en attente (avec leur texte en morceaux égal / ajouté /
 * supprimé) et les commentaires, avec le passage qu'ils visent. */
export function resultatDe(ydoc) {
  const modifications = []
  for (const b of blocsDuDocument(ydoc)) {
    if (!b.enAttente) continue
    const morceaux = regrouper(morceauxDe(b.segments, b.notes))
    const ajoute = morceaux.length > 0 && morceaux.every((m) => m.type === 'ins')
    modifications.push({ bloc: b.n, nom: b.nom, niveau: b.niveau, ajoute, morceaux })
  }
  const commentaires = fils(ydoc).map((c) => ({
    bloc: c.bloc,
    passage: c.passage,
    texte: c.texte,
    reponses: c.reponses.map((r) => r.texte),
  }))
  return { modifications, commentaires }
}

// --------------------------------------------------------------- la demande

export class BancErreur extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** Vérifie et met en forme la demande du navigateur. `reglages` : ceux de
 * Margo en production (`ReglagesIa.de('margo')`) ; `modeles` : la liste des
 * modèles proposés (`MODELES` de server/reglagesIa.js). */
export function validerDemande(corps, { reglages, modeles }) {
  const c = corps && typeof corps === 'object' ? corps : {}
  const texte = typeof c.texte === 'string' ? c.texte : ''
  if (!texte.trim()) throw new BancErreur(400, 'Collez un texte à faire relire.')
  const consigne = typeof c.consigne === 'string' ? nfc(c.consigne.trim()) : ''
  if (!consigne) throw new BancErreur(400, 'Écrivez la consigne donnée à Margo.')
  const titre = (typeof c.titre === 'string' && nfc(c.titre.trim()).slice(0, 200)) || TITRE_PAR_DEFAUT
  const brutes = Array.isArray(c.colonnes) ? c.colonnes : []
  if (!brutes.length) throw new BancErreur(400, 'Choisissez au moins un modèle.')
  if (brutes.length > COLONNES_MAX) throw new BancErreur(400, `${COLONNES_MAX} colonnes au plus.`)
  const colonnes = brutes.map((col, i) => {
    const modele = col && typeof col.modele === 'string' ? col.modele : ''
    const connu = modeles.find((m) => m.id === modele)
    if (!connu) throw new BancErreur(400, `Colonne ${i + 1} : modèle inconnu.`)
    if (!cleDe(modele))
      throw new BancErreur(400, `Colonne ${i + 1} : la clé d’accès à ${serviceDe(modele)} n’est pas configurée.`)
    const maniere = col && typeof col.maniere === 'string' ? col.maniere : reglages.maniere || ''
    // Le niveau de réflexion : l'un de ceux que le modèle accepte ; par défaut,
    // celui de la production (le moins coûteux).
    const { niveaux, defaut } = reflexionDe(modele)
    const reflexion = col && col.reflexion != null && col.reflexion !== '' ? col.reflexion : defaut
    if (!niveaux.includes(reflexion))
      throw new BancErreur(400, `Colonne ${i + 1} : niveau de réflexion non accepté par ${connu.nom}.`)
    return { modele, nom: connu.nom, maniere, maniereModifiee: maniere !== (reglages.maniere || ''), reflexion }
  })
  const blocs = blocsDeTexte(texte)
  if (!blocs.length) throw new BancErreur(400, 'Collez un texte à faire relire.')
  return { texte, consigne, titre, colonnes }
}

/** Les signes du texte tel que Margo le lira (somme des blocs). */
export function signesDuTexte(ydoc) {
  return blocsDuDocument(ydoc).reduce((n, b) => n + b.texte.length, 0)
}

/**
 * Le banc. Un seul objet pour le serveur : il tient sa propre boucle de Margo,
 * branchée sur des documents en mémoire au lieu du stockage.
 */
export class Banc {
  constructor({ fetch: fetcher = null, maintenant = () => Date.now(), pause } = {}) {
    this.maintenant = maintenant
    /** Un essai à la fois sur l'instance : trois copies d'un livre entier
     * tiennent en mémoire, six commencent à peser sur un petit serveur. */
    this.enCours = false
    /** docId → { ydoc, titre } : les copies en cours d'essai, et rien d'autre. */
    this.docs = new Map()
    const docs = this.docs
    const storage = {
      getDoc: (id) => (docs.has(id) ? { id, title: docs.get(id).titre } : null),
      roleFor: (id) => (docs.has(id) ? 'correcteur' : null),
    }
    const rooms = {
      lireDocument: async (id, fn) => {
        const d = docs.get(id)
        if (!d) throw new Error('copie d’essai introuvable')
        return fn(d.ydoc)
      },
      ecrireDocument: async (id, fn) => {
        const d = docs.get(id)
        if (!d) throw new Error('copie d’essai introuvable')
        return fn(d.ydoc)
      },
    }
    // Rien n'est compté : l'accès est celui de la route (administrateurs),
    // et l'enregistrement de la consommation ne fait rien.
    const quotas = { acces: () => true, enregistrer: () => {} }
    this.dialogue = new Dialogue({
      storage,
      rooms,
      quotas,
      metrics: null,
      presence: null,
      fetch: fetcher,
      maintenant,
      ...(pause ? { pause } : {}),
    })
  }

  /**
   * Lance toutes les colonnes en même temps. `emettre(evt)` reçoit les
   * événements de Margo, chacun marqué de sa colonne (`col`, à partir de 0),
   * puis un `resultat` par colonne ; `annule()` dit si le navigateur est parti.
   * `demande` : la sortie de `validerDemande`.
   */
  async lancer(demande, { email, prenom, signesParDemande }, emettre, annule = () => false) {
    if (this.enCours)
      throw new BancErreur(429, 'Un essai est déjà en cours sur cette instance. Attendez qu’il se termine.')
    this.enCours = true
    try {
      await this._lancer(demande, { email, prenom, signesParDemande }, emettre, annule)
    } finally {
      this.enCours = false
    }
  }

  async _lancer(demande, { email, prenom, signesParDemande }, emettre, annule) {
    const essai = randomBytes(6).toString('hex')
    const ids = demande.colonnes.map((_, i) => `banc-${essai}-${i}`)
    for (const id of ids) this.docs.set(id, { ydoc: documentDeTexte(demande.texte), titre: demande.titre })
    try {
      const taille = signesDuTexte(this.docs.get(ids[0]).ydoc)
      emettre({
        type: 'debut',
        signes: taille,
        consigne: demande.consigne.length,
        colonnes: demande.colonnes.map((c) => ({
          modele: c.modele,
          nom: c.nom,
          maniereModifiee: c.maniereModifiee,
          reflexion: c.reflexion,
        })),
        refuseeEnProduction: taille + demande.consigne.length > signesParDemande,
        signesParDemande,
      })
      await Promise.all(
        demande.colonnes.map(async (col, i) => {
          const docId = ids[i]
          const agent = { id: docId, docId, nom: 'Margo (IA)', role: 'correcteur', par: email }
          const session = {
            email,
            prenom,
            docId,
            titre: demande.titre,
            messages: [{ role: 'user', content: demande.consigne }],
            portee: { type: 'document' },
            agent,
            taille: taille + demande.consigne.length,
            modele: col.modele,
            // La limite de production ne bloque pas l'essai : Margo doit pouvoir lire
            // tout le texte, et le relire (le texte rendu par `lire` porte en plus
            // les numéros de bloc). Sous la limite, rien ne change.
            signesParDemande: Math.max(signesParDemande, 3 * (taille + demande.consigne.length)),
            maniere: col.maniere,
            // Le niveau par défaut est celui de la production : rien à demander de plus.
            reflexion: col.reflexion === reflexionDe(col.modele).defaut ? null : col.reflexion,
            acces: { agent, capabilities: capabilities('correcteur') },
          }
          const debut = this.maintenant()
          await this.dialogue.converser(session, (evt) => emettre({ col: i, ...evt }), annule)
          if (annule()) return
          try {
            emettre({
              col: i,
              type: 'resultat',
              ms: this.maintenant() - debut,
              ...resultatDe(this.docs.get(docId).ydoc),
            })
          } catch (err) {
            console.error('[banc] résultat illisible :', err && err.message)
            emettre({ col: i, type: 'resultat', ms: this.maintenant() - debut, modifications: [], commentaires: [] })
          }
        })
      )
    } finally {
      for (const id of ids) {
        const d = this.docs.get(id)
        if (d) d.ydoc.destroy()
        this.docs.delete(id)
      }
    }
  }
}
