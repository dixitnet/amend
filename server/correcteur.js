// La règle du correcteur, au niveau du document (point 8 de la feuille de
// route, 13/10/2026 ; claude/etude-roles-serveur.md, phase 2).
//
// Un correcteur ne modifie le texte qu'**en suivi de modifications** : ce
// qu'il tape est marqué « insertion » à son nom, ce qu'il supprime est
// marqué « suppression », et un éditeur accepte ou rejette. Jusqu'ici la
// règle ne tenait que par l'interface — qui monte le suivi verrouillé : un
// correcteur qui ouvrait la console de son navigateur écrivait ce qu'il
// voulait, sans marque. Le lecteur, lui, était étanche depuis le 29/09
// (replique.js, `verifierLecteur`).
//
// L'étude prévoyait de faire tourner ProseMirror sur le serveur, avec son
// schéma, pour « rejeter les modifications du correcteur et comparer ». On
// ne le fait pas : cela imposait à la racine du projet quatre dépendances de
// plus, aux versions exactes du client, et le risque de deux copies de
// ProseMirror dans une même page. La règle se dit aussi bien sur la
// structure Yjs, qui est ce que le serveur tient déjà :
//
//   1. LA BASE NE BOUGE PAS. On appelle *base* le texte tel qu'il serait si
//      rien n'était en attente : toutes les insertions (de n'importe qui)
//      retirées, tous les sauts de paragraphe en attente refermés, toutes les
//      marques de suivi ôtées. Une opération d'un correcteur laisse la base
//      identique, au signe, à la marque et à l'attribut près. Elle ne peut
//      donc ni écrire ni effacer du texte accepté, ni changer un style, ni
//      toucher à la structure — sauf par des marques de suivi.
//   2. IL NE SIGNE QUE DE SON NOM. Tout ce qui est en attente (une
//      insertion, une suppression, une note, un saut) et que l'opération
//      ajoute doit porter le nom du correcteur. Les propositions des autres
//      peuvent disparaître (écraser une insertion en attente la retire pour
//      de vrai, c'est ce que fait l'éditeur) ; elles ne peuvent pas
//      apparaître sous leur nom.
//
// Ce que la règle tolère, et qui est dit ici plutôt que découvert plus tard :
//   - un correcteur peut effacer l'insertion en attente de quelqu'un d'autre
//     (comme l'interface le lui permet) ;
//   - les paragraphes vides ne sont pas des sauts à part : un saut de
//     paragraphe en attente se referme dans le précédent, et la base ne
//     distingue pas « un paragraphe vide » de « un paragraphe qui ne contient
//     que des insertions » ;
//   - un correcteur qui a changé de nom entre deux sessions ne reconnaît plus
//     ses anciennes marques comme siennes (il peut les rejeter à l'écran ; le
//     serveur refuse d'effacer celles-là sous l'ancien nom) — cas rare, dit
//     dans la feuille de route.
//
// Rien ici ne dépend de ProseMirror ni de la classe `Y.*` (on reconnaît les
// types à leur forme) : le même code lit un document de n'importe quelle copie
// de Yjs.

import { createHash } from 'node:crypto'

const MARQUES_DE_SUIVI = new Set(['insertion', 'deletion', 'authorColor'])
/** Les attributs de nœud qui portent le suivi, hors de la base. */
const ATTR_SUIVI = 'suivi'
const ATTR_SAUT = 'trackedBreak'
/** Les seuls blocs qui portent un saut en attente (client/src/schema.js). */
const BLOCS_A_SAUT = new Set(['paragraph', 'heading'])

const estTexte = (n) => !!n && typeof n.toDelta === 'function' && typeof n.nodeName !== 'string'
const estElement = (n) => !!n && typeof n.nodeName === 'string' && typeof n.getAttributes === 'function'

/** Une valeur JSON écrite toujours pareil (clés triées). */
function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v)
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  return `{${Object.keys(v)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`)
    .join(',')}}`
}

/** Le nom de la marque : y-prosemirror suffixe `--empreinte` quand un même
 * type de marque peut se superposer. */
const nomDeMarque = (cle) => {
  const i = cle.indexOf('--')
  return i < 0 ? cle : cle.slice(0, i)
}

/** Les noms, comparés sans que l'Unicode ou les espaces trompent. */
export const cleDeNom = (nom) =>
  String(nom ?? '')
    .normalize('NFC')
    .trim()

const empreinte = (s) => createHash('sha1').update(s).digest('base64')

/**
 * Ce que l'analyse d'un document dit de lui.
 * @typedef {object} Analyse
 * @property {string} base     l'empreinte de la base
 * @property {string[]} blocs  l'empreinte de chaque bloc de premier niveau (pour dire où)
 * @property {Map<string,string>} suivi  `genre\0auteur` → ce qui est en attente sous ce nom, bout à bout
 */

/**
 * @param {*} fragment  le `Y.XmlFragment` du texte
 * @returns {Analyse}
 */
export function analyser(fragment) {
  const suivi = new Map()
  // Le texte d'un genre de suivi, bout à bout, sans séparateur : un passage
  // coupé en deux (le correcteur tape au milieu de la proposition d'un autre)
  // reste la même suite de signes. Un nœud ou un saut s'écrit `nom;`.
  const noter = (genre, auteur, texte) => {
    const cle = `${genre}\0${cleDeNom(auteur)}`
    suivi.set(cle, `${suivi.get(cle) || ''}${texte}`)
  }
  const auteurDe = (v) => (v && typeof v === 'object' && v.user !== undefined ? v.user : '')

  /** Les enfants de `parent`, tels qu'ils comptent dans la base. */
  function lire(parent, dansInsertion) {
    const sortie = []
    for (const enfant of parent.toArray()) {
      if (estTexte(enfant)) {
        for (const op of enfant.toDelta()) {
          if (typeof op.insert !== 'string') {
            // Un objet intégré : pas dans ce schéma. On le garde tel quel.
            if (!dansInsertion) sortie.push({ e: canon(op.insert), m: canon(op.attributes || {}) })
            continue
          }
          const marques = {}
          let enAttente = false
          for (const [cle, valeur] of Object.entries(op.attributes || {})) {
            const nom = nomDeMarque(cle)
            if (nom === 'ychange') continue
            if (MARQUES_DE_SUIVI.has(nom)) {
              noter(nom, auteurDe(valeur), op.insert)
              if (nom === 'insertion') enAttente = true
              continue
            }
            marques[cle] = valeur
          }
          if (!enAttente && !dansInsertion) sortie.push({ s: op.insert, m: canon(marques) })
        }
      } else if (estElement(enfant)) {
        const attrs = { ...enfant.getAttributes() }
        const suiviNoeud = attrs[ATTR_SUIVI]
        const saut = attrs[ATTR_SAUT]
        delete attrs[ATTR_SUIVI]
        delete attrs[ATTR_SAUT]
        delete attrs.ychange
        let ici = dansInsertion
        if (suiviNoeud && typeof suiviNoeud === 'object') {
          noter(`noeud-${suiviNoeud.type}`, auteurDe(suiviNoeud), `${enfant.nodeName};`)
          if (suiviNoeud.type === 'insertion') ici = true
        } else if (suiviNoeud) {
          noter('noeud-inconnu', '', `${enfant.nodeName};`)
        }
        if (saut) noter('saut', auteurDe(saut), `${enfant.nodeName};`)
        const contenu = lire(enfant, ici)
        if (ici) continue
        sortie.push({ n: enfant.nodeName, a: canon(attrs), c: contenu, saut: !!saut })
      }
    }
    return refermer(fusionner(sortie))
  }

  /** Les passages voisins qui portent les mêmes marques ne font qu'un. */
  function fusionner(liste) {
    const out = []
    for (const x of liste) {
      const dernier = out[out.length - 1]
      if (x.s !== undefined && dernier && dernier.s !== undefined && dernier.m === x.m) dernier.s += x.s
      else out.push(x.s !== undefined ? { ...x } : x)
    }
    return out
  }

  /** Un saut de paragraphe en attente se referme dans le bloc d'avant — s'il
   * est du même genre ; sinon (un des deux a changé de nature depuis), le saut
   * reste, simplement n'est plus « en attente ». Ensuite, les paragraphes et
   * titres **vides** sortent de la base : un paragraphe qui ne contenait que
   * des insertions n'est pas distinguable d'un paragraphe vide, et les
   * laisser compter ferait refuser quelqu'un qui tape sur une ligne blanche. */
  function refermer(liste) {
    const out = []
    for (const x of liste) {
      const avant = out[out.length - 1]
      const ouvrable = x.saut && avant && avant.n === x.n && avant.a === x.a && BLOCS_A_SAUT.has(x.n)
      if (ouvrable) avant.c = fusionner([...avant.c, ...x.c])
      else out.push(x.n !== undefined ? { n: x.n, a: x.a, c: x.c } : x)
    }
    return out.filter((x) => !(x.n !== undefined && BLOCS_A_SAUT.has(x.n) && x.c.length === 0))
  }

  const racine = lire(fragment, false)
  const blocs = racine.map((b) => empreinte(canon(b)))
  return { base: empreinte(blocs.join('|')), blocs, suivi }
}

/** `a` est-elle une sous-suite de `b` (en retirant des signes de `b`) ? */
export function estSousSuite(a, b) {
  if (a.length > b.length) return false
  let j = 0
  for (let i = 0; i < b.length && j < a.length; i++) if (a.charCodeAt(j) === b.charCodeAt(i)) j++
  return j === a.length
}

/**
 * Compare le document d'avant et celui d'après une opération du correcteur.
 * @param {Analyse} avant
 * @param {Analyse} apres
 * @param {Iterable<string>} noms  les noms que le correcteur signe
 * @returns {{ok: true} | {ok: false, raison: string, detail: string}}
 */
export function comparer(avant, apres, noms) {
  const siens = new Set([...noms].map(cleDeNom).filter(Boolean))
  if (avant.base !== apres.base) {
    let bloc = 0
    const n = Math.max(avant.blocs.length, apres.blocs.length)
    while (bloc < n && avant.blocs[bloc] === apres.blocs[bloc]) bloc++
    return {
      ok: false,
      raison: 'un correcteur ne modifie le texte qu’en suivi de modifications',
      detail: `base modifiée au bloc ${bloc + 1} (${avant.blocs.length} → ${apres.blocs.length} blocs)`,
    }
  }
  for (const [cle, texte] of apres.suivi) {
    const auteur = cle.slice(cle.indexOf('\0') + 1)
    if (siens.has(auteur)) continue
    if (!estSousSuite(texte, avant.suivi.get(cle) || '')) {
      return {
        ok: false,
        raison: 'un correcteur ne signe que ses propres modifications',
        detail: `${cle.split('\0')[0]} ajouté au nom de « ${auteur} »`,
      }
    }
  }
  return { ok: true }
}
