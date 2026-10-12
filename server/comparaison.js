// Comparer deux états d'un document, et en restaurer un « en avant »
// (11/10/2026, claude/conception-compactage-versions.md §6.3 et §6.4).
//
// Le principe, pour la restauration : on ne revient jamais en arrière. Le
// journal d'un document est une histoire que personne ne réécrit, et deux
// personnes peuvent avoir le document ouvert pendant qu'une troisième
// « restaure ». Restaurer, c'est donc **proposer, en suivi de modifications,
// les changements qui ramènent le document à ce qu'il était** : ce qui a été
// ajouté depuis est proposé à la suppression, ce qui a été supprimé est
// reproposé, ce qui a changé est ramené mot à mot. Un éditeur relit et
// accepte — ou refuse ce qu'il ne veut pas ramener. Rien n'est perdu, et tout
// le monde voit ce qui se passe.
//
// Le moteur est celui des agents invités (agentTexte.js) : mêmes marques de
// suivi, mêmes refus. Ce qu'il ne sait pas faire, la restauration ne le fait
// pas non plus, et le dit : mises en forme, images, tableaux, notes de bas de
// page et niveaux de titres ne sont comparés que par leur texte.

import * as Y from 'yjs'
import { ajouter, blocsDuDocument, proposer } from './agentTexte.js'

/** Au-delà, l'alignement exact (O(n×m)) est remplacé par un alignement par
 * rang : on le dit dans le résultat (`approximatif`). */
const CELLULES_MAX = 4_000_000
/** Deux blocs supprimé/ajouté côte à côte sont « le même, modifié » s'ils
 * partagent au moins cette part de leurs mots. */
const SEUIL_PARENTE = 0.4
/** Ce que le moteur de propositions accepte par remplacement. */
const AVANT_MAX = 2000
const APRES_MAX = 4000

/** Un instantané (octets Yjs) lu comme une liste de blocs de texte :
 * `[{ n, nom, niveau, contexte, texte }]`. Le texte est celui qui se lirait
 * si les modifications en attente étaient acceptées. */
export function blocsDeInstantane(octets) {
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, octets)
    return blocsPlats(doc)
  } finally {
    doc.destroy()
  }
}

export function blocsPlats(ydoc) {
  return blocsDuDocument(ydoc).map((b) => ({
    n: b.n,
    nom: b.nom,
    niveau: b.niveau,
    contexte: b.contexte,
    texte: b.texte,
  }))
}

/**
 * Aligne deux suites de blocs. `[{ type, i, j }]` dans l'ordre du document,
 * `i` et `j` étant des indices (0-based) dans `a` et `b` :
 *   - 'egal'      : même texte ;
 *   - 'modifie'   : deux blocs apparentés (le même, retouché) ;
 *   - 'supprime'  : dans `a` seulement (`j` null) ;
 *   - 'ajoute'    : dans `b` seulement (`i` null).
 * `approximatif` vaut true quand le cœur du texte était trop gros pour un
 * alignement exact.
 */
export function aligner(a, b) {
  const ta = a.map((x) => x.texte)
  const tb = b.map((x) => x.texte)
  let debut = 0
  while (debut < ta.length && debut < tb.length && ta[debut] === tb[debut]) debut++
  let finA = ta.length
  let finB = tb.length
  while (finA > debut && finB > debut && ta[finA - 1] === tb[finB - 1]) {
    finA--
    finB--
  }
  const ops = []
  for (let k = 0; k < debut; k++) ops.push({ type: 'egal', i: k, j: k })

  const coeurA = ta.slice(debut, finA)
  const coeurB = tb.slice(debut, finB)
  let approximatif = false
  let brut
  if (coeurA.length * coeurB.length > CELLULES_MAX) {
    approximatif = true
    brut = alignerParRang(coeurA.length, coeurB.length)
  } else {
    brut = alignerExact(coeurA, coeurB)
  }
  for (const o of apparier(brut, coeurA, coeurB)) {
    ops.push({ type: o.type, i: o.i === null ? null : o.i + debut, j: o.j === null ? null : o.j + debut })
  }

  const queue = ta.length - finA
  for (let k = 0; k < queue; k++) ops.push({ type: 'egal', i: finA + k, j: finB + k })
  return { ops, approximatif }
}

function alignerExact(a, b) {
  const n = a.length
  const m = b.length
  const largeur = m + 1
  const dp = new Int32Array((n + 1) * largeur)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * largeur + j] =
        a[i] === b[j] ? dp[(i + 1) * largeur + j + 1] + 1 : Math.max(dp[(i + 1) * largeur + j], dp[i * largeur + j + 1])
    }
  }
  const out = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) out.push({ type: 'egal', i: i++, j: j++ })
    else if (dp[(i + 1) * largeur + j] >= dp[i * largeur + j + 1]) out.push({ type: 'supprime', i: i++, j: null })
    else out.push({ type: 'ajoute', i: null, j: j++ })
  }
  while (i < n) out.push({ type: 'supprime', i: i++, j: null })
  while (j < m) out.push({ type: 'ajoute', i: null, j: j++ })
  return out
}

/** Quand tout est trop gros : le k-ième bloc de l'un contre le k-ième de
 * l'autre, le reste ajouté ou supprimé. Moins fin, mais borné. */
function alignerParRang(n, m) {
  const out = []
  const communs = Math.min(n, m)
  for (let k = 0; k < communs; k++) out.push({ type: 'supprime', i: k, j: null }, { type: 'ajoute', i: null, j: k })
  for (let k = communs; k < n; k++) out.push({ type: 'supprime', i: k, j: null })
  for (let k = communs; k < m; k++) out.push({ type: 'ajoute', i: null, j: k })
  return out
}

const mots = (t) => new Set(t.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])

function parente(x, y) {
  const a = mots(x)
  const b = mots(y)
  if (!a.size && !b.size) return 1
  let commun = 0
  for (const w of a) if (b.has(w)) commun++
  return commun / Math.max(a.size, b.size)
}

/** Dans chaque plage de suppressions/ajouts consécutifs, associe dans
 * l'ordre les blocs assez proches : ce sont des blocs modifiés, pas un bloc
 * disparu et un autre apparu. */
function apparier(brut, a, b) {
  const out = []
  let k = 0
  while (k < brut.length) {
    if (brut[k].type === 'egal') {
      out.push(brut[k++])
      continue
    }
    const supprimes = []
    const ajoutes = []
    while (k < brut.length && brut[k].type !== 'egal') {
      if (brut[k].type === 'supprime') supprimes.push(brut[k].i)
      else ajoutes.push(brut[k].j)
      k++
    }
    let prochain = 0
    const apparies = new Map()
    for (const i of supprimes) {
      let trouve = -1
      // Seulement vers l'avant : l'ordre des blocs ne se croise pas.
      for (let p = prochain; p < ajoutes.length && p < prochain + 8; p++) {
        if (parente(a[i], b[ajoutes[p]]) >= SEUIL_PARENTE) {
          trouve = p
          break
        }
      }
      if (trouve >= 0) {
        apparies.set(i, ajoutes[trouve])
        prochain = trouve + 1
      }
    }
    const prisB = new Set(apparies.values())
    // Dans l'ordre du document : une suppression non appariée, puis les
    // ajouts non appariés, puis le bloc modifié quand les deux côtés y sont.
    let ia = 0
    let ib = 0
    while (ia < supprimes.length || ib < ajoutes.length) {
      if (ia < supprimes.length && !apparies.has(supprimes[ia])) {
        out.push({ type: 'supprime', i: supprimes[ia++], j: null })
      } else if (ib < ajoutes.length && !prisB.has(ajoutes[ib])) {
        out.push({ type: 'ajoute', i: null, j: ajoutes[ib++] })
      } else {
        out.push({ type: 'modifie', i: supprimes[ia++], j: ajoutes[ib++] })
      }
    }
  }
  return out
}

/**
 * La comparaison de deux suites de blocs, pour l'écran : seuls les blocs qui
 * diffèrent sont rendus, avec leur texte des deux côtés. `identiques` compte
 * ceux qui n'ont pas bougé.
 */
export function comparer(avant, apres) {
  const { ops, approximatif } = aligner(avant, apres)
  const changements = []
  let identiques = 0
  for (const o of ops) {
    if (o.type === 'egal') {
      identiques++
      continue
    }
    changements.push({
      type: o.type,
      avant:
        o.i === null
          ? null
          : { n: avant[o.i].n, nom: avant[o.i].nom, niveau: avant[o.i].niveau, texte: avant[o.i].texte },
      apres:
        o.j === null
          ? null
          : { n: apres[o.j].n, nom: apres[o.j].nom, niveau: apres[o.j].niveau, texte: apres[o.j].texte },
    })
  }
  return { changements, identiques, approximatif }
}

// --- Restaurer en avant ----------------------------------------------------

/**
 * Ce qu'il faut proposer pour que `actuel` (les blocs du document
 * aujourd'hui) redevienne `cible` (les blocs de la version à restaurer) :
 * `{ remplacements, ajouts, ignores, stats }`.
 *
 * Les remplacements et les ajouts sont dans la forme que `proposer` et
 * `ajouter` attendent, numéros de blocs de `actuel` compris. `ignores` : ce
 * que le moteur ne peut pas faire (un bloc trop long pour une proposition).
 */
export function planDeRestauration(actuel, cible) {
  const { ops, approximatif } = aligner(actuel, cible)
  const remplacements = []
  const ajouts = []
  const ignores = []
  const stats = { modifies: 0, ajoutes: 0, supprimes: 0, identiques: 0 }
  // Le dernier bloc de `actuel` rencontré : un bloc ajouté se pose après lui.
  let ancre = 0
  for (const o of ops) {
    if (o.type === 'egal') {
      stats.identiques++
      ancre = actuel[o.i].n
    } else if (o.type === 'modifie') {
      const x = actuel[o.i]
      const y = cible[o.j]
      ancre = x.n
      if (x.texte.length > AVANT_MAX || y.texte.length > APRES_MAX) {
        ignores.push({ bloc: x.n, raison: 'bloc trop long pour être ramené d’un coup : à reprendre à la main' })
        continue
      }
      remplacements.push({ bloc: x.n, avant: x.texte, apres: y.texte })
      stats.modifies++
    } else if (o.type === 'supprime') {
      const x = actuel[o.i]
      ancre = x.n
      if (!x.texte) continue
      if (x.texte.length > AVANT_MAX) {
        ignores.push({
          bloc: x.n,
          raison: 'bloc trop long pour être proposé à la suppression d’un coup : à reprendre à la main',
        })
        continue
      }
      remplacements.push({ bloc: x.n, avant: x.texte, apres: '' })
      stats.supprimes++
    } else {
      const y = cible[o.j]
      if (!y.texte.trim()) continue
      if (y.texte.length > APRES_MAX) {
        ignores.push({ bloc: ancre, raison: 'paragraphe à rétablir trop long : à reprendre à la main' })
        continue
      }
      ajouts.push({ apres_bloc: ancre, texte: y.texte })
      stats.ajoutes++
    }
  }
  return { remplacements, ajouts, ignores, stats, approximatif }
}

/**
 * Applique la restauration à `ydoc`, au nom de `auteur` : d'abord les
 * remplacements, puis les ajouts (qui ne déplacent aucun numéro de bloc
 * auparavant). `{ stats, refuses, ignores, approximatif }` où `refuses` est
 * ce que le moteur de propositions a écarté (texte déjà en attente, etc.).
 */
export function restaurerEnAvant(ydoc, ciblesBlocs, auteur, ts = Date.now()) {
  const plan = planDeRestauration(blocsPlats(ydoc), ciblesBlocs)
  const refuses = []
  const stats = { ...plan.stats }
  // Une seule demande de chaque sorte : les numéros de blocs du plan sont
  // ceux de « avant », et seul `ajouter` en déplace (après `proposer`).
  if (plan.remplacements.length) {
    const r = proposer(ydoc, plan.remplacements, auteur, ts)
    for (const x of r.refuses) {
      refuses.push({ bloc: x.bloc, raison: x.raison })
      stats[plan.remplacements[x.index].apres === '' ? 'supprimes' : 'modifies']--
    }
  }
  if (plan.ajouts.length) {
    const r = ajouter(ydoc, plan.ajouts, auteur, ts)
    for (const x of r.refuses) {
      refuses.push({ bloc: x.bloc, raison: x.raison })
      stats.ajoutes--
    }
  }
  return { stats, refuses, ignores: plan.ignores, approximatif: plan.approximatif }
}
