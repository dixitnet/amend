import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import * as Y from 'yjs'
import { ReplaceStep, ReplaceAroundStep } from 'prosemirror-transform'
import {
  ySyncPluginKey,
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  setMeta,
} from 'y-prosemirror'

// Commentaires ancrés dans le texte (évolution 4.2.4, conception du
// 12/09/2026 dans README2.md) — un commentaire ne change rien au contenu du
// document : il vit dans son propre type Yjs (`ydoc.getMap('comments')`),
// pas dans le schéma ProseMirror. Conséquence directe : il est synchronisé
// et persisté par la même plomberie que le reste du document (aucun
// changement serveur), et il n'apparaît dans aucun export (.md/.pdf), ce qui
// est le comportement voulu — une remarque, pas une modification de texte.
//
// L'ancrage utilise les positions relatives de Yjs
// (absolutePositionToRelativePosition / relativePositionToAbsolutePosition,
// déjà utilisées en interne par y-prosemirror pour les curseurs distants —
// voir yCursorPlugin) plutôt que de simples entiers ProseMirror : elles
// restent valides même si quelqu'un modifie le texte avant le passage
// commenté entre-temps.
//
// Simplification demandée le 12/09/2026 : "résoudre" un commentaire le
// supprime purement et simplement (`commentsMap.delete`) plutôt que de le
// garder consultable — contrairement au suivi des modifications, un
// commentaire résolu ne laisse aucune trace.
//
// --- Les fils de discussion (20/09/2026) ---------------------------------
//
// Une réponse est une entrée de premier niveau de la même map, portant un
// champ `parent`. Ce n'est pas la forme la plus élégante — la map mélange
// deux natures d'entrées, et tout ce qui la parcourt doit le savoir — mais
// c'est la seule qui ne perde rien.
//
// Un commentaire est rangé **en bloc** : `commentsMap.set(id, {…})`
// synchronise la valeur entière, Yjs ne fusionne pas à l'intérieur. Si les
// réponses étaient un tableau dans cet objet, répondre s'écrirait
// `set(id, {...c, replies: [...c.replies, nouvelle]})` — et deux personnes
// répondant en même temps enverraient chacune sa version complète de
// l'objet : la dernière écraserait l'autre, et une réponse disparaîtrait
// sans que personne ne le sache. Avec une clé par réponse, deux réponses
// simultanées sont deux clés différentes, cas que Yjs gère nativement.
// C'est vérifié par un test qui fait converger deux documents.
//
// Un seul niveau : une réponse ne porte jamais de réponse (`ajouterReponse`
// refuse un parent qui est lui-même une réponse). C'est une demande, et
// c'est aussi ce qui garde une carte de marge lisible.
//
// Qui peut corriger quoi : une **convention d'interface**, pas une
// protection. Les commentaires vivent dans le document Yjs, où tout
// participant peut techniquement écrire — comme il peut déjà réécrire le
// texte. On compare les noms affichés faute de mieux : le client ne connaît
// pas sa propre adresse (le serveur ne lui envoie que `myName` et
// `myColor`).

export const commentsPluginKey = new PluginKey('comments')

function decodeAnchor(json) {
  return json ? Y.createRelativePositionFromJSON(json) : null
}

function resoudreAncres(state, ydoc, anchorFrom, anchorTo) {
  const ystate = ySyncPluginKey.getState(state)
  if (!ystate) return null
  const from = relativePositionToAbsolutePosition(
    ydoc,
    ystate.type,
    decodeAnchor(anchorFrom),
    ystate.binding.mapping
  )
  const to = relativePositionToAbsolutePosition(
    ydoc,
    ystate.type,
    decodeAnchor(anchorTo),
    ystate.binding.mapping
  )
  if (from == null || to == null) return null
  return { from: Math.min(from, to), to: Math.max(from, to) }
}

/** Résout la position actuelle (from/to) d'un commentaire, ou null si son
 * ancre ne pointe plus vers un endroit valable du document (ex. le type Yjs
 * auquel elle était relative a été détruit). Prend l'état ProseMirror
 * directement (pas la vue) : appelable aussi bien depuis le plugin de
 * décoration (qui ne reçoit qu'un state) que depuis le panneau (qui a la
 * vue sous la main).
 *
 * Quand l'ancre courante est vide (passage supprimé, ou bloc recréé puis
 * geste annulé), les anciennes ancres (`anciennes`, voir le réancrage plus
 * bas) sont essayées : après Ctrl+Z, Yjs fait suivre à l'une d'elles le
 * texte rétabli. */
export function resolveCommentRange(state, ydoc, comment) {
  const principale = resoudreAncres(state, ydoc, comment.anchorFrom, comment.anchorTo)
  if (principale && principale.to > principale.from) return principale
  for (const a of comment.anciennes || []) {
    const r = resoudreAncres(state, ydoc, a.anchorFrom, a.anchorTo)
    if (r && r.to > r.from) return r
  }
  return principale
}

// --- Masquer plutôt que supprimer, et suivre le texte (08/10/2026) --------
//
// Deux défauts trouvés en rejouant les gestes d'écriture (batterie
// `commentairesEdition.test.js`, confirmés dans Chrome) :
//
// 1. Un commentaire était **supprimé**, chez tous les participants et sans
//    retour, dès que son passage se résolvait en intervalle vide. Or Entrée,
//    Retour arrière en début de paragraphe, « paragraphe → titre »,
//    citation, Tab dans une liste *recréent* le bloc : pour Yjs, les
//    caractères de l'ancien bloc sont supprimés puis réinsérés ailleurs, et
//    le passage « a disparu » alors que le texte est là. Annuler (Ctrl+Z)
//    rendait le texte, jamais le commentaire.
//
//    Désormais un commentaire dont le passage est vide est **masqué** : une
//    marque datée est posée dans `ydoc.getMap('commentsOrphelins')` (une
//    carte à part : plusieurs clients peuvent marquer en même temps sans
//    jamais réécrire un commentaire, donc sans écraser une ancre), et il
//    n'est plus compté ni dessiné. Si son passage revient (Ctrl+Z, rejet
//    d'une suppression suivie…), la marque est levée. Il n'est effacé
//    pour de bon — avec son fil — qu'au bout de `DELAI_ORPHELIN_MS`.
//    La règle du 15/09 (« le commentaire d'un texte supprimé doit
//    disparaître ») reste vraie à l'écran ; seule l'irréversibilité tombe.
//
// 2. Après un geste de structure, l'ancre Yjs ne désigne plus le texte. Le
//    greffon suit donc les passages **avec les positions ProseMirror** (ce
//    que le serveur fait déjà pour Claude : `remettreLesAncres`,
//    agentTexte.js) : à chaque transaction locale il reporte les bornes de
//    chaque passage par le `mapping` de la transaction, et, si la transaction
//    a changé la structure (voir `estStructurel`), réécrit les ancres Yjs là
//    où elles ne disent plus la même chose. Seul l'auteur du geste réancre
//    (une transaction distante n'est jamais « locale »). Les anciennes
//    ancres mortes sont gardées (`anciennes`) : après Ctrl+Z, Yjs refait
//    pointer l'ancien bloc vers sa copie rétablie (`redone`), et le
//    commentaire revient avec le texte.
//
//    Même source pour le **surlignage** : avant, il était calculé dans
//    `apply`, c'est-à-dire avant que le texte ait été écrit dans Yjs, et
//    restait décalé de la longueur de ce qu'on venait de taper jusqu'au
//    prochain rafraîchissement.
//
// Les frontières ne changent pas (écrire au bout du passage l'agrandit,
// au début non) : c'est une décision à part, voir le rapport du 08/10.

export const NOM_ORPHELINS = 'commentsOrphelins'
/** Sept jours : le temps de s'apercevoir qu'un geste a emporté un passage. */
export const DELAI_ORPHELIN_MS = 7 * 24 * 3600 * 1000
/** Combien d'anciennes ancres on garde par commentaire. */
const ANCIENNES_MAX = 4

/** La carte des marques « passage vide depuis… » du document de ce
 * commentaire, ou null pour une carte qui n'est pas dans un document. */
export function carteOrphelins(commentsMap) {
  return commentsMap && commentsMap.doc ? commentsMap.doc.getMap(NOM_ORPHELINS) : null
}

/** Ce commentaire est-il masqué (passage vide) ? */
export function estMasque(commentsMap, id) {
  const marques = carteOrphelins(commentsMap)
  return !!marques && marques.has(id)
}

/** Pour qui doit se remettre à jour quand un commentaire apparaît, change
 * ou se masque. Renvoie la fonction qui défait l'abonnement. */
export function observerCommentaires(commentsMap, fn) {
  const marques = carteOrphelins(commentsMap)
  commentsMap.observe(fn)
  if (marques) marques.observe(fn)
  return () => {
    commentsMap.unobserve(fn)
    if (marques) marques.unobserve(fn)
  }
}

/** Les commentaires dont le passage est vide, d'après une fonction qui sait
 * résoudre une ancre — **et leurs réponses**. Séparé du reste pour être
 * éprouvable sans monter une liaison Yjs/ProseMirror complète. Une ancre
 * non résoluble (`null`) n'est PAS un orphelin : c'est le cas au chargement,
 * avant que la liaison Yjs ne soit prête, et traiter cela en orphelin
 * masquerait tous les commentaires du document à chaque ouverture. */
export function orphelins(commentsMap, resoudre) {
  const aSupprimer = []
  commentsMap.forEach((comment, id) => {
    // Une réponse n'a pas d'ancre : elle serait vue comme orpheline dès le
    // premier passage. Son sort suit celui de son parent, juste en dessous.
    if (estUneReponse(comment)) return
    const range = resoudre(comment, id)
    if (range && range.to <= range.from) aSupprimer.push(id)
  })
  for (const parentId of [...aSupprimer]) {
    for (const reponse of reponsesDe(commentsMap, parentId)) aSupprimer.push(reponse.id)
  }
  return aSupprimer
}

/** Met les marques d'accord avec ce que `resoudre` dit des passages :
 * marque ce qui est vide, lève la marque de ce qui est revenu, retire les
 * marques sans commentaire, et efface (avec leur fil) les commentaires
 * masqués depuis plus de `DELAI_ORPHELIN_MS`. Une seule transaction.
 * Renvoie le nombre de commentaires effacés pour de bon.
 *
 * Sous suivi des modifications un texte « supprimé » reste présent, marqué :
 * son commentaire n'est donc jamais vide, et survit jusqu'à l'acceptation. */
export function rapprocher(ydoc, commentsMap, resoudre, maintenant = Date.now()) {
  const marques = ydoc.getMap(NOM_ORPHELINS)
  const vides = new Set(
    orphelins(commentsMap, resoudre).filter((id) => !estUneReponse(commentsMap.get(id)))
  )
  const aMarquer = []
  const aLever = new Set()
  const aEffacer = []
  commentsMap.forEach((comment, id) => {
    if (estUneReponse(comment)) return
    if (vides.has(id)) {
      if (!marques.has(id)) aMarquer.push(id)
    } else if (marques.has(id)) {
      const range = resoudre(comment, id)
      if (range && range.to > range.from) aLever.add(id)
    }
  })
  marques.forEach((depuis, id) => {
    if (!commentsMap.has(id)) aLever.add(id)
    else if (!aLever.has(id) && maintenant - depuis > DELAI_ORPHELIN_MS) aEffacer.push(id)
  })
  if (!aMarquer.length && !aLever.size && !aEffacer.length) return 0
  ydoc.transact(() => {
    for (const id of aMarquer) marques.set(id, maintenant)
    for (const id of aLever) marques.delete(id)
    for (const id of aEffacer) {
      for (const r of reponsesDe(commentsMap, id)) commentsMap.delete(r.id)
      commentsMap.delete(id)
      marques.delete(id)
    }
  })
  return aEffacer.length
}

/** Rapproche les marques de l'état courant de l'éditeur (voir `rapprocher`).
 * Nom conservé : c'est l'ancienne purge, qui supprimait. */
export function purgeOrphanComments(state, ydoc, commentsMap, maintenant = Date.now()) {
  return rapprocher(ydoc, commentsMap, (comment) => resolveCommentRange(state, ydoc, comment), maintenant)
}

/** Les passages de tous les commentaires ancrés, d'après Yjs (id → {from,to}).
 * Un commentaire dont l'ancre ne se résout pas n'y figure pas. */
function resoudreTout(state, ydoc, commentsMap) {
  const out = new Map()
  commentsMap.forEach((comment, id) => {
    if (estUneReponse(comment)) return
    const range = resolveCommentRange(state, ydoc, comment)
    if (range) out.set(id, range)
  })
  return out
}

function memesPlages(a, b) {
  if (a.size !== b.size) return false
  for (const [id, r] of a) {
    const s = b.get(id)
    if (!s || s.from !== r.from || s.to !== r.to) return false
  }
  return true
}

/** La transaction change-t-elle la **structure** (blocs scindés, fusionnés,
 * recréés, imbriqués) et pas seulement du texte au fil d'un paragraphe ?
 * C'est ce qui oblige Yjs à supprimer puis réinsérer des caractères. */
export function estStructurel(tr) {
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i]
    if (step instanceof ReplaceAroundStep) return true
    if (step instanceof ReplaceStep) {
      const { slice } = step
      if (slice.openStart > 0 || slice.openEnd > 0) return true
      let bloc = false
      slice.content.forEach((n) => {
        if (!n.isInline) bloc = true
      })
      if (bloc) return true
      const avant = tr.docs[i]
      if (!avant.resolve(step.from).sameParent(avant.resolve(step.to))) return true
    }
  }
  return false
}

/** Reporte des passages par le `mapping` d'une transaction. Le début reste
 * devant ce qu'on écrit à sa hauteur, la fin passe derrière (le passage
 * grandit quand on écrit au bout, comme avec l'ancre Yjs) — sauf si la
 * transaction est structurelle : Entrée au bout d'un passage ne doit pas
 * l'étendre au paragraphe suivant. */
function reporter(ranges, tr, structurel) {
  const out = new Map()
  ranges.forEach(({ from, to }, id) => {
    const f = tr.mapping.map(from, 1)
    const t = tr.mapping.map(to, structurel ? -1 : 1)
    out.set(id, { from: f, to: Math.max(f, t) })
  })
  return out
}

function decorer(doc, ranges, commentsMap) {
  const decos = []
  const taille = doc.content.size
  ranges.forEach((range, id) => {
    const comment = commentsMap.get(id)
    if (!comment) return
    const from = Math.max(0, Math.min(range.from, taille))
    const to = Math.max(0, Math.min(range.to, taille))
    if (from >= to) return
    decos.push(
      Decoration.inline(from, to, {
        class: 'comment-highlight',
        style: `--comment-color:${comment.color}`,
      })
    )
  })
  return DecorationSet.create(doc, decos)
}

/** Plugin ProseMirror : surligne (en décoration, rien de stocké dans le
 * document) le passage de chaque commentaire, le suit au fil des
 * transactions, réancre après un geste de structure et tient à jour les
 * marques des orphelins.
 *
 * `peutEcrire` : faux pour un lecteur, que le serveur empêche d'écrire hors
 * de ses propres commentaires — il se contente de dessiner. Les commentaires
 * vivent dans `commentsMap`, un type Yjs indépendant de ySyncPlugin : ses
 * changements ne passent pas par une transaction ProseMirror, d'où
 * l'observer ci-dessous qui force un rafraîchissement via `setMeta` (le même
 * utilitaire que yCursorPlugin). */
export function commentsPlugin(ydoc, commentsMap, { peutEcrire = () => true } = {}) {
  // Les réancrages déjà faits : un état ProseMirror survit à plusieurs mises
  // à jour de la vue, le réancrage ne doit être joué qu'une fois.
  const traites = new WeakSet()

  function etatInitial(state, annulation = null) {
    const ranges = resoudreTout(state, ydoc, commentsMap)
    return { ranges, decos: decorer(state.doc, ranges, commentsMap), reancrer: null, annulation }
  }

  /** Réécrit les ancres Yjs des passages que la transaction structurelle a
   * déplacés sans que Yjs le sache. Les anciennes ancres, si elles sont
   * mortes, sont gardées pour le Ctrl+Z. */
  function reancrer(view, estimes) {
    const ystate = ySyncPluginKey.getState(view.state)
    if (!ystate) return
    const taille = view.state.doc.content.size
    const ecritures = []
    estimes.forEach((est, id) => {
      const comment = commentsMap.get(id)
      if (!comment || est.to <= est.from || est.to > taille) return
      const actuel = resolveCommentRange(view.state, ydoc, comment)
      if (actuel && actuel.from === est.from && actuel.to === est.to) return
      ecritures.push([id, comment, est])
    })
    if (!ecritures.length) return
    const marques = ydoc.getMap(NOM_ORPHELINS)
    ydoc.transact(() => {
      for (const [id, comment, est] of ecritures) {
        const principale = resoudreAncres(view.state, ydoc, comment.anchorFrom, comment.anchorTo)
        const vivante = principale && principale.to > principale.from
        const anciennes = [...(comment.anciennes || [])]
        if (!vivante) {
          anciennes.unshift({ anchorFrom: comment.anchorFrom, anchorTo: comment.anchorTo })
        }
        commentsMap.set(id, {
          ...comment,
          anchorFrom: Y.relativePositionToJSON(
            absolutePositionToRelativePosition(est.from, ystate.type, ystate.binding.mapping)
          ),
          anchorTo: Y.relativePositionToJSON(
            absolutePositionToRelativePosition(est.to, ystate.type, ystate.binding.mapping)
          ),
          anciennes: anciennes.slice(0, ANCIENNES_MAX),
        })
        marques.delete(id)
      }
    })
  }

  /** Après annuler / refaire : Yjs a fait suivre le texte rétabli aux
   * anciennes ancres (`redone`), **sur cette machine seulement** — le lien
   * n'est pas synchronisé. Les autres participants ne retrouveraient pas le
   * passage. On réécrit donc, d'après ce qui est réellement résolu ici,
   * les ancres qui ne désignent plus les caractères vivants. Une ancre déjà
   * exacte est laissée telle quelle (rien n'est écrit). */
  function normaliser(view) {
    const ystate = ySyncPluginKey.getState(view.state)
    if (!ystate) return
    const ecritures = []
    commentsMap.forEach((comment, id) => {
      if (estUneReponse(comment)) return
      const vivant = resolveCommentRange(view.state, ydoc, comment)
      if (!vivant || vivant.to <= vivant.from) return
      const de = Y.relativePositionToJSON(
        absolutePositionToRelativePosition(vivant.from, ystate.type, ystate.binding.mapping)
      )
      const a = Y.relativePositionToJSON(
        absolutePositionToRelativePosition(vivant.to, ystate.type, ystate.binding.mapping)
      )
      if (JSON.stringify(de) === JSON.stringify(comment.anchorFrom) && JSON.stringify(a) === JSON.stringify(comment.anchorTo)) return
      ecritures.push([id, comment, de, a])
    })
    if (!ecritures.length) return
    const marques = ydoc.getMap(NOM_ORPHELINS)
    ydoc.transact(() => {
      for (const [id, comment, de, a] of ecritures) {
        // L'ancre qu'on quitte reste en réserve : refaire (Ctrl+Maj+Z)
        // supprime de nouveau le texte rétabli, et c'est elle, pas la
        // nouvelle, que Yjs fait alors suivre vers sa copie refaite.
        const quittee = { anchorFrom: comment.anchorFrom, anchorTo: comment.anchorTo }
        const anciennes = [quittee, ...(comment.anciennes || [])].filter(
          (x, i, tous) => i === tous.findIndex((y) => JSON.stringify(y) === JSON.stringify(x))
        )
        commentsMap.set(id, {
          ...comment,
          anchorFrom: de,
          anchorTo: a,
          anciennes: anciennes.slice(0, ANCIENNES_MAX),
        })
        marques.delete(id)
      }
    })
  }

  return new Plugin({
    key: commentsPluginKey,
    state: {
      init(_config, state) {
        return etatInitial(state)
      },
      apply(tr, old, oldState, newState) {
        const meta = tr.getMeta(ySyncPluginKey)
        const distante = !!(meta && meta.isChangeOrigin)
        const rafraichir = !!tr.getMeta(commentsPluginKey)
        if (!tr.docChanged && !rafraichir) return old
        // Transaction venue de Yjs (autre participant, annuler / refaire), ou
        // simple rafraîchissement : Yjs est à jour, on le lit.
        if (distante || rafraichir || !tr.docChanged) {
          return etatInitial(newState, tr.docChanged && meta && meta.isUndoRedoOperation ? {} : null)
        }
        // Transaction locale : Yjs n'a pas encore reçu le texte (ySyncPlugin
        // l'écrit dans la mise à jour de la vue, après celle-ci). On suit
        // donc les passages avec la transaction elle-même.
        const structurel = estStructurel(tr)
        // Un commentaire arrivé d'un autre participant à l'instant n'est pas
        // encore connu (le rafraîchissement est différé) : Yjs correspond
        // encore à l'état d'avant la transaction, on le lit tel quel.
        let connus = old.ranges
        commentsMap.forEach((comment, id) => {
          if (estUneReponse(comment) || connus.has(id)) return
          const range = resolveCommentRange(oldState, ydoc, comment)
          if (!range) return
          if (connus === old.ranges) connus = new Map(connus)
          connus.set(id, range)
        })
        const ranges = reporter(connus, tr, structurel)
        // Une transaction ajoutée par un autre greffon (suivi des
        // modifications) ne doit pas faire oublier un réancrage en attente.
        const enAttente =
          old.reancrer && !traites.has(old.reancrer) ? reporter(old.reancrer, tr, false) : null
        return {
          ranges,
          decos: decorer(newState.doc, ranges, commentsMap),
          reancrer: structurel ? ranges : enAttente,
          annulation: null,
        }
      },
    },
    props: {
      decorations(state) {
        return commentsPluginKey.getState(state).decos
      },
    },
    view(view) {
      let minuteur = null
      let detruit = false
      const surCarte = () => {
        setMeta(view, commentsPluginKey, true)
        // Pas dans l'observer : le texte n'est peut-être pas encore arrivé.
        if (peutEcrire() && minuteur === null) {
          minuteur = setTimeout(() => {
            minuteur = null
            if (!detruit) purgeOrphanComments(view.state, ydoc, commentsMap)
          }, 0)
        }
      }
      commentsMap.observe(surCarte)
      return {
        // Après chaque changement du document (Yjs est alors à jour) :
        // réancrer si le geste a changé la structure, puis mettre les
        // marques des orphelins d'accord avec ce qui est réellement là.
        // Fait ici plutôt que dans `apply` : ce sont des écritures dans
        // Yjs, elles n'ont rien à faire dans le calcul d'un état
        // ProseMirror, qui doit rester pur.
        update(v, prevState) {
          if (v.state.doc === prevState.doc) return
          const etat = commentsPluginKey.getState(v.state)
          const enAttente = etat.reancrer && !traites.has(etat.reancrer) ? etat.reancrer : null
          const aNormaliser = etat.annulation && !traites.has(etat.annulation) ? etat.annulation : null
          if (aNormaliser) traites.add(aNormaliser)
          if (enAttente) traites.add(enAttente)
          if (peutEcrire()) {
            if (enAttente) reancrer(v, enAttente)
            if (aNormaliser) normaliser(v)
            purgeOrphanComments(v.state, ydoc, commentsMap)
          }
          if (!enAttente && !memesPlages(resoudreTout(v.state, ydoc, commentsMap), etat.ranges)) {
            setMeta(v, commentsPluginKey, true)
          }
        },
        destroy() {
          detruit = true
          clearTimeout(minuteur)
          commentsMap.unobserve(surCarte)
        },
      }
    },
  })
}

/** Crée un commentaire ancré sur la sélection actuelle. Retourne false (sans
 * rien créer) si la sélection est vide. */
export function addComment(view, ydoc, commentsMap, user, text) {
  const { from, to } = view.state.selection
  if (from === to) return false
  const ystate = ySyncPluginKey.getState(view.state)
  if (!ystate) return false
  const anchorFrom = Y.relativePositionToJSON(
    absolutePositionToRelativePosition(from, ystate.type, ystate.binding.mapping)
  )
  const anchorTo = Y.relativePositionToJSON(
    absolutePositionToRelativePosition(to, ystate.type, ystate.binding.mapping)
  )
  const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  commentsMap.set(id, {
    id,
    author: user.name,
    color: user.color,
    anchorFrom,
    anchorTo,
    text,
    createdAt: Date.now(),
  })
  // Le surlignage tout de suite, et surtout le passage connu du greffon avant
  // la prochaine frappe : il suit les passages avec les transactions, et ne
  // reporte que ceux qu'il connaît. L'observer, lui, rafraîchit plus tard.
  view.dispatch(view.state.tr.setMeta(commentsPluginKey, true))
  return true
}

/** Vrai pour une réponse, faux pour un commentaire ancré dans le texte. */
export function estUneReponse(commentaire) {
  return !!(commentaire && commentaire.parent)
}

/** Les commentaires ancrés, réponses et commentaires masqués exclus — ce que
 * la marge dessine. */
export function commentairesAncres(commentsMap) {
  const out = []
  commentsMap.forEach((commentaire, id) => {
    if (!estUneReponse(commentaire) && !estMasque(commentsMap, id)) out.push([id, commentaire])
  })
  return out
}

/** Les réponses d'un commentaire, dans l'ordre où elles ont été écrites.
 * `createdAt` peut être identique pour deux réponses écrites à la même
 * milliseconde sur deux machines : on départage par l'identifiant, pour que
 * tout le monde voie le **même** ordre. */
export function reponsesDe(commentsMap, parentId) {
  const out = []
  commentsMap.forEach((commentaire, id) => {
    if (commentaire && commentaire.parent === parentId) out.push({ ...commentaire, id })
  })
  out.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return out
}

function nouvelIdentifiant(prefixe) {
  return `${prefixe}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Ajoute une réponse à un commentaire. Refuse de répondre à une réponse :
 * un seul niveau. Renvoie l'identifiant créé, ou null. */
export function ajouterReponse(commentsMap, user, parentId, text) {
  const texte = String(text || '').trim()
  if (!texte) return null
  const parent = commentsMap.get(parentId)
  if (!parent || estUneReponse(parent)) return null
  const id = nouvelIdentifiant('r')
  commentsMap.set(id, {
    id,
    parent: parentId,
    author: user.name,
    color: user.color,
    text: texte,
    createdAt: Date.now(),
  })
  return id
}

/** Vrai si cette personne peut corriger ce commentaire. Convention, pas
 * protection — voir la note en tête de fichier. */
export function peutModifier(commentaire, user) {
  return !!commentaire && !!user && commentaire.author === user.name
}

/** Corrige le texte d'un commentaire ou d'une réponse. `editedAt` est posé
 * pour que les autres sachent qu'un texte a changé sous leurs yeux : un
 * commentaire qui se réécrit sans le dire est plus troublant qu'utile. */
export function modifierTexte(commentsMap, id, texte) {
  const courant = commentsMap.get(id)
  if (!courant) return false
  const propre = String(texte || '').trim()
  if (!propre || propre === courant.text) return false
  commentsMap.set(id, { ...courant, text: propre, editedAt: Date.now() })
  return true
}

/** Résout un commentaire : il s'en va, **et ses réponses avec lui**. Sans
 * ça, elles resteraient dans le fichier, invisibles et éternelles. En une
 * seule transaction, pour que les autres participants ne voient jamais un
 * fil à moitié effacé. */
export function supprimerFil(ydoc, commentsMap, id) {
  const commentaire = commentsMap.get(id)
  if (!commentaire) return 0
  const aSupprimer = estUneReponse(commentaire)
    ? [id]
    : [id, ...reponsesDe(commentsMap, id).map((r) => r.id)]
  ydoc.transact(() => {
    for (const cle of aSupprimer) commentsMap.delete(cle)
  })
  return aSupprimer.length
}

/** L'identifiant du commentaire dont le passage contient `pos`, ou null.
 * Sert à la marge comme à la feuille du petit écran : un seul endroit où
 * l'on décide « de quel commentaire parle-t-on ». */
export function commentaireAuPoint(state, ydoc, commentsMap, pos) {
  let trouve = null
  commentsMap.forEach((commentaire, id) => {
    if (estUneReponse(commentaire)) return
    const range = resolveCommentRange(state, ydoc, commentaire)
    if (range && pos >= range.from && pos <= range.to) trouve = id
  })
  return trouve
}

function relativeTime(ts) {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 10) return "à l'instant"
  if (s < 60) return `il y a ${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** Panneau latéral "Commentaires" : composer un commentaire sur la
 * sélection actuelle, lister les commentaires existants, "Résoudre" (qui
 * les supprime — voir la note en tête de fichier), et cliquer un
 * commentaire fait défiler le document jusqu'à son passage. */
export function mountCommentsPanel(container, ydoc, commentsMap, getView, user) {
  function render() {
    const view = getView()
    container.innerHTML = ''

    const header = document.createElement('div')
    header.className = 'changes-header'
    const title = document.createElement('h3')
    // Le compte est celui des commentaires, pas des messages : une
    // conversation de six réponses reste un commentaire.
    title.textContent = `Commentaires (${commentairesAncres(commentsMap).length})`
    header.appendChild(title)
    container.appendChild(header)

    const hint = document.createElement('p')
    hint.className = 'ai-hint'
    hint.textContent = 'Sélectionne un passage dans le texte, puis ajoute un commentaire.'
    container.appendChild(hint)

    const textarea = document.createElement('textarea')
    textarea.rows = 2
    textarea.placeholder = 'Ton commentaire...'
    container.appendChild(textarea)

    const addBtn = document.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'btn-primary'
    addBtn.textContent = 'Ajouter un commentaire'
    container.appendChild(addBtn)

    const status = document.createElement('p')
    status.className = 'ai-status'
    container.appendChild(status)

    // Entrée envoie, Maj+Entrée garde le retour à la ligne — même
    // convention que le champ d'instruction du panneau IA (aiPanel.js).
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submit()
      }
    })
    addBtn.onclick = submit

    function submit() {
      if (!view) return
      const text = textarea.value.trim()
      if (!text) {
        status.textContent = "Écris d'abord un commentaire."
        return
      }
      const ok = addComment(view, ydoc, commentsMap, user, text)
      if (!ok) {
        status.textContent = "Sélectionne d'abord un passage dans le texte."
        return
      }
      view.focus()
      // La map Yjs déclenche déjà un ré-rendu via l'observer plus bas.
    }

    if (commentairesAncres(commentsMap).length === 0) {
      const empty = document.createElement('p')
      empty.className = 'changes-empty'
      empty.textContent = 'Aucun commentaire pour le moment.'
      container.appendChild(empty)
      return
    }

    const entries = commentairesAncres(commentsMap).map(([, c]) => c)
    // Ordre du document plutôt que d'ajout, quand la position est encore
    // résoluble — plus utile pour s'y retrouver dans un document long.
    entries.sort((a, b) => {
      const ra = view ? resolveCommentRange(view.state, ydoc, a) : null
      const rb = view ? resolveCommentRange(view.state, ydoc, b) : null
      if (ra && rb) return ra.from - rb.from
      if (ra) return -1
      if (rb) return 1
      return a.createdAt - b.createdAt
    })

    const list = document.createElement('ul')
    list.className = 'changes-list comments-list'
    for (const c of entries) {
      const item = document.createElement('li')
      item.className = 'change-item comment-item'
      item.style.setProperty('--user-color', c.color)

      const meta = document.createElement('div')
      meta.className = 'change-meta'
      meta.innerHTML = `<strong>${escapeHtml(c.author)}</strong> · ${relativeTime(c.createdAt)}${
        c.editedAt ? ' · modifié' : ''
      }`

      const text = document.createElement('div')
      text.className = 'change-text'
      text.textContent = c.text

      const actions = document.createElement('div')
      actions.className = 'change-actions'
      const resolveBtn = document.createElement('button')
      resolveBtn.type = 'button'
      resolveBtn.textContent = 'Résoudre'
      resolveBtn.className = 'btn-accept'
      resolveBtn.onclick = () => supprimerFil(ydoc, commentsMap, c.id)
      actions.appendChild(resolveBtn)

      item.append(meta, text)
      // Le panneau latéral **montre** les fils, il ne les tient pas : on y
      // lit les réponses, on répond et l'on corrige dans la marge, où la
      // conversation a lieu. En dessous de 1100 px de large la marge
      // disparaît (style.css) et ce panneau reprend la main : il doit donc
      // au moins dire qu'une discussion existe, plutôt que de faire croire
      // à un commentaire resté sans réponse.
      const fil = reponsesDe(commentsMap, c.id)
      if (fil.length) {
        const liste = document.createElement('div')
        liste.className = 'comment-replies'
        for (const r of fil) {
          const ligne = document.createElement('div')
          ligne.className = 'comment-reply'
          ligne.style.setProperty('--user-color', r.color)
          const qui = document.createElement('strong')
          qui.textContent = r.author
          const quoi = document.createElement('span')
          quoi.textContent = ` ${r.text}`
          ligne.append(qui, quoi)
          liste.appendChild(ligne)
        }
        item.appendChild(liste)
      }
      item.appendChild(actions)
      item.addEventListener('click', (e) => {
        if (e.target.closest('.change-actions')) return
        scrollToComment(c)
      })
      list.appendChild(item)
    }
    container.appendChild(list)
  }

  /** Même principe que changesPanel.js's scrollChangeToMiddle : centre le
   * passage commenté dans `.editor-container`, plutôt que de simplement le
   * rendre visible. */
  function scrollToComment(comment) {
    const view = getView()
    if (!view) return
    const range = resolveCommentRange(view.state, ydoc, comment)
    if (!range) return
    const container = view.dom.closest('.editor-container')
    if (!container) return
    const coords = view.coordsAtPos(range.from)
    const containerRect = container.getBoundingClientRect()
    const middle = containerRect.top + container.clientHeight / 2
    container.scrollTop += coords.top - middle
  }

  render()
  const arreter = observerCommentaires(commentsMap, render)

  return {
    destroy() {
      arreter()
    },
  }
}
