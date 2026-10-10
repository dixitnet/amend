// Les commentaires face aux modifications du passage commenté (08/10/2026).
//
// Signalé par Sylvain : « des comportements bizarres quand la sélection
// commentée est par la suite modifiée ou supprimée ». Ces tests montent
// l'éditeur tel qu'il est vraiment câblé — liaison Yjs, annulation, suivi des
// modifications, greffon des commentaires (surlignage + purge des orphelins) —
// et rejouent les gestes un par un, seul ou à deux clients.
//
// Trois familles :
//   1. ce qui marche — gardé comme filet (tests ordinaires) ;
//   2. ce qui était cassé — écrit **comme il doit se comporter**. Le 08/10/2026
//      ces scénarios étaient marqués `todo` (16 défauts) ; les points 1 et 2 de
//      la correction (masquer au lieu de supprimer, réancrer après un geste de
//      structure) en ont réglé 15. Le couper-coller, resté `todo`, est tranché le 10/10 : le commentaire suit ;
//   3. ce qui est à trancher (frontières, remplacement intégral) — des
//      diagnostics, pas des assertions : voir claude/rapport-tests-commentaires.md.
//
// La cause commune des défauts était dans comments.js : un commentaire est
// ancré par deux positions relatives Yjs (`anchorFrom`, `anchorTo`), et
// l'ancienne purge supprimait — pour tous les participants, sans retour
// possible — tout commentaire dont le passage se résolvait en intervalle
// vide. Or toute opération qui *recrée* un bloc (scinder, fusionner, changer
// de type, imbriquer dans une liste) supprime les caractères de l'ancien bloc
// et les réinsère dans un nouveau : pour Yjs, c'était un passage disparu.
// Maintenant : le greffon suit les passages avec ProseMirror, réancre après
// un geste de structure, et masque (sans supprimer) ce qui devient vide.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import * as Y from 'yjs'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { splitBlock, joinBackward, setBlockType, wrapIn } from 'prosemirror-commands'
import { sinkListItem, liftListItem, splitListItem } from 'prosemirror-schema-list'
import { ySyncPlugin, yUndoPlugin, undo, redo, prosemirrorToYXmlFragment } from 'y-prosemirror'
import { schema } from '../src/schema.js'
import {
  trackChangesPlugin,
  makeDispatchTransaction,
  listChanges,
  acceptChange,
  rejectChange,
  effacementSuivi,
  insertAISuggestion,
} from '../src/trackChanges.js'
import {
  commentsPlugin,
  addComment,
  resolveCommentRange,
  commentairesAncres,
  ajouterReponse,
  reponsesDe,
  purgeOrphanComments,
  rapprocher,
  estStructurel,
  NOM_ORPHELINS,
  DELAI_ORPHELIN_MS,
} from '../src/comments.js'

const ALICE = { name: 'Alice', color: '#3d5a80' }
const BRUNO = { name: 'Bruno', color: '#e07a5f' }
const IA = { name: 'IA', color: '#5f7a4a' }

const T1 = 'Le zonage est un outil parmi d’autres, et il faut le redire.'
const T2 = 'Second paragraphe, bien distinct.'
const PASSAGE = 'outil parmi d’autres'

// --- le banc ---------------------------------------------------------------

{
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'getComputedStyle', 'DocumentFragment', 'Range', 'MutationObserver', 'Event', 'KeyboardEvent']) {
    globalThis[k] = w[k]
  }
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
}

const paragraphes = (...ts) => schema.node('doc', null, ts.map((t) => schema.node('paragraph', null, [schema.text(t)])))
const liste = (...ts) =>
  schema.node('doc', null, [
    schema.node('bullet_list', null, ts.map((t) => schema.node('list_item', null, [schema.node('paragraph', null, [schema.text(t)])]))),
  ])

/** Un éditeur câblé comme celui de l'application (editor.js), sans la
 * gouttière ni les panneaux. `ydoc` : pour rejoindre un document existant. */
function client({ ydoc = null, doc = paragraphes(T1, T2), suivi = false, user = ALICE, ecrit = true } = {}) {
  const nouveau = !ydoc
  ydoc = ydoc || new Y.Doc()
  const frag = ydoc.getXmlFragment('prosemirror-content')
  if (nouveau) prosemirrorToYXmlFragment(doc, frag)
  const map = ydoc.getMap('comments')
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  const state = EditorState.create({
    schema,
    plugins: [ySyncPlugin(frag), yUndoPlugin(), trackChangesPlugin({ enabled: suivi }), commentsPlugin(ydoc, map, { peutEcrire: () => ecrit })],
  })
  const view = new EditorView(hote, { state })
  view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => user) })
  const c = {
    ydoc,
    map,
    view,
    user,
    sel(from, to = from) {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
      return c
    },
    commenter(from, to, texte = 'remarque') {
      c.sel(from, to)
      addComment(view, ydoc, map, user, texte)
      return [...map.keys()].pop()
    },
    taper(pos, texte, jusqua) {
      view.dispatch(view.state.tr.insertText(texte, pos, jusqua ?? pos))
      return c
    },
    supprimer(from, to) {
      view.dispatch(view.state.tr.delete(from, to))
      return c
    },
    cmd(commande) {
      commande(view.state, view.dispatch, view)
      return c
    },
    annuler() {
      undo(view.state, view.dispatch)
      return c
    },
    refaire() {
      redo(view.state, view.dispatch)
      return c
    },
    /** Le texte de chaque bloc de premier niveau. */
    blocs() {
      const l = []
      view.state.doc.forEach((n) => l.push(n.textContent))
      return l
    },
    /** Position (dans le document) du début de `texte`. */
    pos(texte) {
      let trouve = -1
      view.state.doc.descendants((node, p) => {
        if (node.isText && trouve < 0) {
          const i = node.text.indexOf(texte)
          if (i >= 0) trouve = p + i
        }
      })
      assert.ok(trouve >= 0, `« ${texte} » introuvable dans le document`)
      return trouve
    },
    /** Le texte surligné par chaque commentaire ancré (blocs séparés par ¶),
     * ou `null` si l'ancre ne se résout pas. */
    surlignages() {
      const out = []
      map.forEach((cm) => {
        if (cm.parent) return
        const r = resolveCommentRange(view.state, ydoc, cm)
        out.push(r ? view.state.doc.textBetween(r.from, r.to, '¶') : null)
      })
      return out
    },
    nb: () => commentairesAncres(map).length,
    toutes(action) {
      for (let i = 0; i < 20 && listChanges(view.state.doc).length; i++) action(view, listChanges(view.state.doc)[0])
      return c
    },
  }
  return c
}

/** Deux documents reliés à la main : rien ne circule avant `sync`. */
function sync(a, b) {
  Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc, Y.encodeStateVector(b.ydoc)))
  Y.applyUpdate(a.ydoc, Y.encodeStateAsUpdate(b.ydoc, Y.encodeStateVector(a.ydoc)))
}
function deuxClients(opts = {}) {
  const a = client({ ...opts })
  const b = client({ ydoc: new Y.Doc(), user: BRUNO, suivi: opts.suivi })
  sync(a, b)
  return { a, b }
}

/** Un éditeur avec un commentaire sur « outil parmi d’autres ». */
function commente(opts) {
  const e = client(opts)
  const f = e.pos(PASSAGE)
  const id = e.commenter(f, f + PASSAGE.length)
  return { e, f, t: f + PASSAGE.length, id }
}

// =============================================================================
// 1. Ce qui marche
// =============================================================================

test('témoin : le commentaire surligne exactement son passage', () => {
  const { e } = commente()
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('écrire avant le passage ne le déplace pas : il suit son texte', () => {
  const { e, f } = commente()
  e.taper(f - 1, 'XX')
  assert.deepEqual(e.surlignages(), [PASSAGE])
  e.taper(3, 'YY') // beaucoup plus tôt
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('écrire à l’intérieur du passage l’agrandit', () => {
  const { e, f } = commente()
  e.taper(f + 6, 'XX')
  assert.deepEqual(e.surlignages(), ['outil XXparmi d’autres'])
})

test('supprimer un morceau à l’intérieur le raccourcit, le commentaire reste', () => {
  const { e, f } = commente()
  e.supprimer(f + 6, f + 12) // « parmi »
  assert.deepEqual(e.surlignages(), ['outil d’autres'])
})

test('supprimer le premier ou le dernier caractère raccourcit le passage', () => {
  const a = commente().e
  a.supprimer(a.pos(PASSAGE), a.pos(PASSAGE) + 1)
  assert.deepEqual(a.surlignages(), ['util parmi d’autres'])
  const { e, f, t } = commente()
  e.supprimer(t - 1, t)
  assert.deepEqual(e.surlignages(), ['outil parmi d’autre'])
  void f
})

test('une suppression qui mord sur le passage n’en retire que la partie commune', () => {
  const début = commente()
  début.e.supprimer(début.f - 4, début.f + 5) // « un » + « outil »
  assert.deepEqual(début.e.surlignages(), ['parmi d’autres'])
  const fin = commente()
  fin.e.supprimer(fin.t - 5, fin.t + 4) // « tres » + « , et »
  assert.deepEqual(fin.e.surlignages(), ['outil parmi d’a'])
})

test('taper par-dessus une partie du passage le conserve, avec le nouveau texte dedans', () => {
  const { e, f } = commente()
  e.taper(f + 6, 'XX', f + 12) // « parmi » → « XX »
  assert.equal(e.nb(), 1)
  assert.deepEqual(e.surlignages(), ['outil XXd’autres'])
})

test('supprimer le passage entier fait disparaître le commentaire (voulu depuis le 15/09/2026)', () => {
  const { e, f, t } = commente()
  e.supprimer(f, t)
  assert.equal(e.nb(), 0)
  const g = commente()
  g.e.supprimer(g.f - 3, g.t + 3)
  assert.equal(g.e.nb(), 0, 'passage plus du contexte : même sort')
})

test('… et son fil de réponses avec lui : plus rien à l’écran, tout reste en réserve', () => {
  const { e, f, t, id } = commente()
  ajouterReponse(e.map, BRUNO, id, 'une réponse')
  assert.equal(e.map.size, 2)
  e.supprimer(f, t)
  assert.equal(e.nb(), 0, 'aucune carte à dessiner')
  assert.equal(e.map.size, 2, 'masqué, pas supprimé : Ctrl+Z doit pouvoir le rendre')
  assert.ok(e.ydoc.getMap(NOM_ORPHELINS).has(id))
})

test('annuler une suppression partielle rend le passage entier', () => {
  const { e, f, t } = commente()
  e.supprimer(f + 3, t - 3)
  assert.ok(e.surlignages()[0].length < PASSAGE.length, 'le passage est raccourci')
  e.annuler()
  assert.deepEqual(e.surlignages(), [PASSAGE])
  assert.equal(e.blocs()[0], T1)
})

test('annuler une frappe par-dessus le passage le rend intact', () => {
  const { e, f, t } = commente()
  e.taper(f, 'machin', t)
  e.annuler()
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('annuler une frappe à l’intérieur du passage le rend intact', () => {
  const { e, f } = commente()
  e.taper(f + 6, 'XX')
  e.annuler()
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('un commentaire à cheval sur deux paragraphes suit les modifications hors de son passage', () => {
  const e = client()
  const f = e.pos('outil')
  const t = e.pos('Second') + 4
  e.commenter(f, t)
  assert.deepEqual(e.surlignages(), ['outil parmi d’autres, et il faut le redire.¶Seco'])
  e.supprimer(e.pos('redire'), e.pos('redire') + 6) // dans le passage : « redire »
  assert.equal(e.nb(), 1)
  e.taper(2, 'ZZ')
  assert.equal(e.nb(), 1)
})

test('écrire dans un autre paragraphe, ou en début de document, laisse le commentaire en place', () => {
  const { e } = commente()
  e.taper(e.pos('Second') + 3, 'XYZ')
  e.sel(1).cmd(splitBlock) // Entrée tout au début : le texte ne bouge pas de bloc
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('Entrée après le passage laisse le passage entier', () => {
  const { e, t } = commente()
  e.sel(t + 3).cmd(splitBlock)
  assert.deepEqual(e.surlignages(), [PASSAGE])
  assert.equal(e.blocs().length, 3)
})

// =============================================================================
// 1 bis. Avec le suivi des modifications
// =============================================================================

test('suivi : « supprimer » le passage le barre sans supprimer le commentaire', () => {
  const { e, f, t } = commente({ suivi: true })
  e.supprimer(f, t)
  assert.equal(e.blocs()[0], T1, 'le texte est toujours là, barré')
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('suivi : accepter la suppression retire le texte — et le commentaire avec lui', () => {
  const { e, f, t } = commente({ suivi: true })
  e.supprimer(f, t)
  e.toutes(acceptChange)
  assert.equal(e.nb(), 0)
  assert.equal(e.blocs()[0], 'Le zonage est un , et il faut le redire.')
})

test('suivi : rejeter la suppression rend le commentaire à son passage', () => {
  const { e, f, t } = commente({ suivi: true })
  e.supprimer(f, t)
  e.toutes(rejectChange)
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('suivi : annuler (Ctrl+Z) une suppression suivie rend le commentaire', () => {
  const { e, f, t } = commente({ suivi: true })
  e.supprimer(f, t)
  e.annuler()
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('suivi : remplacer le passage — le commentaire reste sur l’ancien texte barré', () => {
  const { e, f, t } = commente({ suivi: true })
  e.taper(f, 'machin', t)
  assert.equal(e.nb(), 1)
  assert.deepEqual(e.surlignages(), [PASSAGE], 'il ne glisse pas sur le texte de remplacement')
})

test('suivi : remplacer puis tout rejeter rend le texte et le commentaire', () => {
  const { e, f, t } = commente({ suivi: true })
  e.taper(f, 'machin', t)
  e.toutes(rejectChange)
  assert.deepEqual(e.surlignages(), [PASSAGE])
  assert.equal(e.blocs()[0], T1)
})

test('suivi : remplacer puis tout accepter retire le commentaire (son texte a disparu)', () => {
  const { e, f, t } = commente({ suivi: true })
  e.taper(f, 'machin', t)
  e.toutes(acceptChange)
  assert.equal(e.nb(), 0)
  assert.equal(e.blocs()[0], 'Le zonage est un machin, et il faut le redire.')
})

test('suivi : écrire dans le passage puis rejeter la frappe laisse le passage intact', () => {
  const { e, f } = commente({ suivi: true })
  e.taper(f + 6, 'XX')
  e.toutes(rejectChange)
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('suivi : Retour arrière dans le passage ne le perd pas', () => {
  const { e, f } = commente({ suivi: true })
  e.sel(f + 6)
  effacementSuivi(() => ALICE, true)(e.view.state, e.view.dispatch)
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('suivi : commentaire sur un texte que j’ai inséré — le rejeter retire aussi le commentaire', () => {
  const e = client({ suivi: true })
  e.taper(e.pos('redire'), 'XYZ ')
  const p = e.pos('XYZ')
  e.commenter(p, p + 3)
  assert.deepEqual(e.surlignages(), ['XYZ'])
  e.toutes(rejectChange)
  assert.equal(e.nb(), 0)
})

test('IA : une suggestion qui remplace le passage le laisse commenté ; la rejeter le rend intact', () => {
  const { e, f, t } = commente({ suivi: true })
  insertAISuggestion(e.view, f, t, 'instrument de planification', IA)
  assert.equal(e.nb(), 1)
  e.toutes(rejectChange)
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('IA : accepter la suggestion garde le commentaire, posé sur le nouveau texte', () => {
  const { e, f, t } = commente({ suivi: true })
  insertAISuggestion(e.view, f, t, 'instrument de planification', IA)
  e.toutes(acceptChange)
  assert.equal(e.nb(), 1)
  assert.deepEqual(e.surlignages(), ['instrument de planification'])
})

// =============================================================================
// 1 ter. À deux
// =============================================================================

test('à deux : l’écriture de l’autre avant le passage ne le déplace pas', () => {
  const { a, b } = deuxClients()
  const f = a.pos(PASSAGE)
  a.commenter(f, f + PASSAGE.length)
  sync(a, b)
  assert.deepEqual(b.surlignages(), [PASSAGE])
  b.taper(5, 'ZZZZ')
  sync(a, b)
  assert.deepEqual(a.surlignages(), [PASSAGE])
  assert.deepEqual(b.surlignages(), [PASSAGE])
})

test('à deux : suppression et frappe simultanées dans le passage — convergence', () => {
  const { a, b } = deuxClients()
  const f = a.pos(PASSAGE)
  a.commenter(f, f + PASSAGE.length)
  sync(a, b)
  a.supprimer(f + 3, f + 9)
  b.taper(f + 10, 'YY')
  sync(a, b)
  assert.equal(a.nb(), 1)
  assert.deepEqual(a.surlignages(), b.surlignages(), 'les deux voient la même chose')
  assert.deepEqual(a.blocs(), b.blocs())
})

test('à deux : l’un barre le passage (suivi), l’autre accepte — le commentaire part chez les deux', () => {
  const { a, b } = deuxClients()
  const f = a.pos(PASSAGE)
  a.commenter(f, f + PASSAGE.length)
  sync(a, b)
  const suiviB = client({ ydoc: b.ydoc, user: BRUNO, suivi: true })
  suiviB.supprimer(f, f + PASSAGE.length)
  sync(a, suiviB)
  assert.deepEqual(a.surlignages(), [PASSAGE], 'tant que non accepté, le commentaire reste')
  a.toutes(acceptChange)
  sync(a, suiviB)
  assert.equal(a.nb(), 0)
  assert.equal(suiviB.nb(), 0)
})

test('à deux : un arrivant qui charge le document retrouve les commentaires, sans les purger', () => {
  const a = client()
  const f = a.pos(PASSAGE)
  a.commenter(f, f + PASSAGE.length)
  a.supprimer(f + 2, f + 8)
  const c = client({ ydoc: new Y.Doc(), user: BRUNO })
  Y.applyUpdate(c.ydoc, Y.encodeStateAsUpdate(a.ydoc))
  assert.equal(c.nb(), 1)
  assert.deepEqual(c.surlignages(), a.surlignages())
})

// =============================================================================
// 2. Ce qui est cassé — écrit comme il devrait se comporter (`todo`)
// =============================================================================

const DEFAUT = (n, resume) => ({ todo: `défaut ${n} : ${resume}` })

// (Les 15 autres défauts — Entrée, fusion, titre, citation, listes, annuler,
// collaboration — sont réglés et ont perdu leur `todo` le 08/10/2026.)

test('Entrée juste avant le passage conserve le commentaire', () => {
  const { e, f } = commente()
  e.sel(f).cmd(splitBlock)
  assert.deepEqual(e.blocs().slice(0, 2), ['Le zonage est un ', 'outil parmi d’autres, et il faut le redire.'])
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('Entrée plus loin avant le passage (même paragraphe) conserve le commentaire', () => {
  const { e, f } = commente()
  e.sel(f - 3).cmd(splitBlock)
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('suivi : Entrée avant le passage conserve le commentaire', () => {
  const { e, f } = commente({ suivi: true })
  e.sel(f - 3).cmd(splitBlock)
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('Entrée au milieu du passage : le commentaire couvre les deux moitiés', () => {
  const { e, f } = commente()
  e.sel(f + 6).cmd(splitBlock)
  assert.deepEqual(e.surlignages(), ['outil ¶parmi d’autres'])
})

test('Retour arrière en début de paragraphe (fusion) : le commentaire du second paragraphe survit', () => {
  const e = client()
  const p = e.pos('distinct')
  e.commenter(p, p + 8)
  e.sel(e.pos('Second')).cmd(joinBackward)
  assert.equal(e.blocs().length, 1)
  assert.deepEqual(e.surlignages(), ['distinct'])
})

test('changer le paragraphe en titre conserve ses commentaires', () => {
  const { e } = commente()
  e.sel(3).cmd(setBlockType(schema.nodes.heading, { level: 2 }))
  assert.equal(e.view.state.doc.child(0).type.name, 'heading')
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('envelopper le paragraphe dans une citation conserve ses commentaires', () => {
  const { e } = commente()
  e.sel(3).cmd(wrapIn(schema.nodes.blockquote))
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('liste : imbriquer un élément (Tab) conserve ses commentaires', () => {
  const e = client({ doc: liste('Premier point', 'Deuxième point commenté', 'Troisième point') })
  const f = e.pos('commenté')
  e.commenter(f, f + 8)
  e.sel(f + 2).cmd(sinkListItem(schema.nodes.list_item))
  assert.deepEqual(e.surlignages(), ['commenté'])
})

test('liste : sortir un élément de la liste (Maj+Tab) conserve ses commentaires', () => {
  const e = client({ doc: liste('Premier point', 'Deuxième point commenté', 'Troisième point') })
  const f = e.pos('commenté')
  e.commenter(f, f + 8)
  e.sel(f + 2).cmd(liftListItem(schema.nodes.list_item))
  assert.deepEqual(e.surlignages(), ['commenté'])
})

test('liste : Entrée au milieu du mot commenté garde le mot entier commenté', () => {
  const e = client({ doc: liste('Premier point', 'Deuxième point commenté', 'Troisième point') })
  const f = e.pos('commenté')
  e.commenter(f, f + 8)
  e.sel(f + 2).cmd(splitListItem(schema.nodes.list_item))
  assert.equal(e.surlignages().length, 1)
  assert.equal(e.surlignages()[0].replace('¶', ''), 'commenté')
})

test('fusion de deux paragraphes : un commentaire à cheval ne s’étend pas au-delà de son passage', () => {
  const e = client()
  const f = e.pos('outil')
  const t = e.pos('Second') + 4 // « Seco »
  e.commenter(f, t)
  e.sel(e.pos('Second')).cmd(joinBackward)
  assert.deepEqual(e.surlignages(), ['outil parmi d’autres, et il faut le redire.Seco'])
})

test('suppression à cheval jusqu’au milieu du second paragraphe : seul le reste commenté demeure surligné', () => {
  const e = client()
  const f = e.pos('outil')
  e.commenter(f, e.pos('Second') + 4) // … « Seco »
  e.supprimer(f - 5, e.pos('Second') + 2) // jusqu’à « Se »
  assert.deepEqual(e.surlignages(), ['co'])
})

test('supprimer le passage entier puis annuler (Ctrl+Z) rend aussi le commentaire', () => {
  const { e, f, t } = commente()
  e.supprimer(f, t)
  assert.equal(e.nb(), 0)
  e.annuler()
  assert.equal(e.blocs()[0], T1)
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('annuler une opération de structure rend aussi les commentaires qu’elle a emportés', () => {
  const { e } = commente()
  e.sel(3).cmd(setBlockType(schema.nodes.heading, { level: 2 }))
  e.annuler()
  assert.equal(e.view.state.doc.child(0).type.name, 'paragraph')
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('à deux : l’Entrée de l’un avant le passage de l’autre ne détruit pas son commentaire', () => {
  const { a, b } = deuxClients()
  const f = a.pos(PASSAGE)
  const id = a.commenter(f, f + PASSAGE.length)
  ajouterReponse(a.map, ALICE, id, 'réponse')
  sync(a, b)
  b.sel(f - 3).cmd(splitBlock)
  sync(a, b)
  assert.equal(a.nb(), 1)
  assert.equal(b.nb(), 1)
  assert.equal(a.map.size, 2, 'la réponse aussi')
})

test('couper-coller le passage ailleurs : le commentaire le suit', () => {
  const { e, f, t } = commente()
  const morceau = e.view.state.doc.slice(f, t)
  e.supprimer(f, t)
  const p = e.pos('Second')
  e.view.dispatch(e.view.state.tr.replaceRange(p, p, morceau))
  assert.equal(e.nb(), 1)
  assert.deepEqual(e.surlignages(), [PASSAGE], 'le surlignage est sur le texte collé')
})

test('couper-coller : l’autre participant voit le commentaire sur le texte collé, et rien n’est masqué', () => {
  const { a, b } = deuxClients()
  const f = a.pos(PASSAGE)
  const t = f + PASSAGE.length
  a.commenter(f, t)
  sync(a, b)
  const morceau = a.view.state.doc.slice(f, t)
  a.supprimer(f, t)
  const p = a.pos('Second')
  a.view.dispatch(a.view.state.tr.replaceRange(p, p, morceau))
  sync(a, b)
  assert.equal(a.nb(), 1)
  assert.equal(b.nb(), 1)
  assert.deepEqual(b.surlignages(), [PASSAGE])
  assert.equal(a.map.doc.getMap('commentsOrphelins').size, 0, 'plus de marque d’orphelin')
})

test('couper sans coller : le commentaire est masqué comme avant ; coller un autre texte ne le reprend pas', () => {
  const { e, f, t } = commente()
  e.supprimer(f, t)
  assert.equal(e.nb(), 0)
  const p = e.pos('Second')
  e.taper(p, 'tout autre texte')
  assert.equal(e.nb(), 0)
})

// =============================================================================
// 3. À trancher : constats, pas d’assertions
// =============================================================================

test('à trancher : écrire juste à la fin du passage l’agrandit, au début non', (t) => {
  const fin = commente()
  fin.e.taper(fin.t, 'XX')
  const debut = commente()
  debut.e.taper(debut.f, 'XX')
  t.diagnostic(`fin : ${JSON.stringify(fin.e.surlignages())} | début : ${JSON.stringify(debut.e.surlignages())}`)
  assert.ok(true)
})

test('à trancher : taper par-dessus tout le passage — le commentaire passe sur le nouveau texte', (t) => {
  const { e, f, t: fin } = commente()
  e.taper(f, 'machin', fin)
  t.diagnostic(`après remplacement : ${JSON.stringify(e.surlignages())} (hors suivi, l’ancien texte n’existe plus)`)
  assert.ok(true)
})

test('à trancher : effacer le passage caractère par caractère masque le commentaire au dernier', (t) => {
  const { e, f, t: fin } = commente()
  let cran = 0
  for (let p = fin; p > f; p--) {
    e.supprimer(p - 1, p)
    cran++
    if (e.nb() === 0) break
  }
  t.diagnostic(`commentaire masqué au caractère ${cran} sur ${PASSAGE.length}`)
  assert.equal(e.nb(), 0)
})

// =============================================================================
// 4. Masquer plutôt que supprimer, suivre le texte (08/10/2026)
// =============================================================================

const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms))
/** Ce que la page dessine vraiment : les passages surlignés dans le DOM. */
const dessin = (e) => [...e.view.dom.querySelectorAll('.comment-highlight')].map((n) => n.textContent)
const marques = (e) => [...e.ydoc.getMap(NOM_ORPHELINS).keys()]

test('le surlignage dessiné suit le texte dès la frappe (avant : décalé jusqu’au rafraîchissement suivant)', () => {
  const { e, f } = commente()
  assert.deepEqual(dessin(e), [PASSAGE])
  e.taper(f - 1, 'XX')
  assert.deepEqual(dessin(e), [PASSAGE])
  e.taper(3, 'YY')
  assert.deepEqual(dessin(e), [PASSAGE])
  e.supprimer(3, 5)
  assert.deepEqual(dessin(e), [PASSAGE])
})

test('le surlignage dessiné suit aussi Entrée, la fusion et le changement en titre', () => {
  const { e, f } = commente()
  e.sel(f - 3).cmd(splitBlock)
  assert.deepEqual(dessin(e), [PASSAGE])
  e.annuler()
  assert.deepEqual(dessin(e), [PASSAGE])
  e.cmd(setBlockType(schema.nodes.heading, { level: 2 }))
  assert.deepEqual(dessin(e), [PASSAGE])
})

test('supprimer le passage : masqué (marque posée), rien à l’écran, tout en réserve', () => {
  const { e, f, t, id } = commente()
  ajouterReponse(e.map, BRUNO, id, 'une réponse')
  e.supprimer(f, t)
  assert.equal(e.nb(), 0)
  assert.deepEqual(dessin(e), [])
  assert.deepEqual(marques(e), [id])
  assert.equal(e.map.size, 2, 'le commentaire et sa réponse sont toujours là')
})

test('Ctrl+Z rend le commentaire, sa réponse, et lève la marque', () => {
  const { e, f, t, id } = commente()
  ajouterReponse(e.map, BRUNO, id, 'une réponse')
  e.supprimer(f, t).annuler()
  assert.equal(e.nb(), 1)
  assert.deepEqual(e.surlignages(), [PASSAGE])
  assert.equal(reponsesDe(e.map, id).length, 1)
  assert.deepEqual(marques(e), [], 'plus de marque : il est de retour')
  assert.deepEqual(dessin(e), [PASSAGE])
})

test('refaire (Ctrl+Maj+Z) le masque de nouveau, annuler le rend encore', () => {
  const { e, f, t } = commente()
  e.supprimer(f, t).annuler()
  e.refaire()
  assert.equal(e.nb(), 0)
  e.annuler()
  assert.equal(e.nb(), 1)
  assert.deepEqual(e.surlignages(), [PASSAGE])
})

test('sept jours après, le commentaire masqué est effacé avec son fil — pas avant', () => {
  const { e, f, t, id } = commente()
  ajouterReponse(e.map, BRUNO, id, 'une réponse')
  e.supprimer(f, t)
  const depuis = e.ydoc.getMap(NOM_ORPHELINS).get(id)
  assert.equal(purgeOrphanComments(e.view.state, e.ydoc, e.map, depuis + DELAI_ORPHELIN_MS - 1000), 0)
  assert.equal(e.map.size, 2, 'la veille : toujours là')
  assert.equal(purgeOrphanComments(e.view.state, e.ydoc, e.map, depuis + DELAI_ORPHELIN_MS + 1000), 1)
  assert.equal(e.map.size, 0, 'ni commentaire ni réponse')
  assert.deepEqual(marques(e), [])
})

test('une marque dont le commentaire a été résolu est retirée', () => {
  const { e, f, t, id } = commente()
  e.supprimer(f, t)
  e.map.delete(id)
  purgeOrphanComments(e.view.state, e.ydoc, e.map)
  assert.deepEqual(marques(e), [])
})

test('une ancre non résoluble n’est jamais marquée (le document se charge)', () => {
  const doc = new Y.Doc()
  const map = doc.getMap('comments')
  map.set('c-1', { id: 'c-1', author: 'Alice', color: '#000', anchorFrom: null, anchorTo: null, text: 'x', createdAt: 1 })
  assert.equal(rapprocher(doc, map, () => null, Date.now()), 0)
  assert.deepEqual([...doc.getMap(NOM_ORPHELINS).keys()], [])
})

test('une frappe ordinaire ne réécrit pas le commentaire (pas de bruit dans le document)', () => {
  const { e, f, id } = commente()
  const avant = JSON.stringify(e.map.get(id))
  e.taper(f - 1, 'XX')
  e.taper(3, 'YY')
  e.supprimer(3, 5)
  e.taper(f + 8, 'ZZ') // à l’intérieur
  assert.equal(JSON.stringify(e.map.get(id)), avant)
})

test('Entrée avant le passage réécrit ses ancres, une seule fois, et garde l’ancienne en réserve', () => {
  const { e, f, id } = commente()
  const avant = e.map.get(id)
  e.sel(f - 3).cmd(splitBlock)
  const apres = e.map.get(id)
  assert.notDeepEqual(apres.anchorFrom, avant.anchorFrom)
  assert.equal(apres.anciennes.length, 1)
  assert.deepEqual(apres.anciennes[0].anchorFrom, avant.anchorFrom)
  // Frapper ensuite ne change plus rien.
  e.taper(e.pos('Le zonage') + 2, 'AB')
  assert.deepEqual(e.map.get(id).anchorFrom, apres.anchorFrom)
  assert.equal(e.map.get(id).anciennes.length, 1)
})

test('Entrée, annuler, refaire, annuler : le commentaire accompagne le texte à chaque fois', () => {
  const { e, f } = commente()
  e.sel(f - 3).cmd(splitBlock)
  assert.deepEqual(e.surlignages(), [PASSAGE])
  e.annuler()
  assert.deepEqual(e.surlignages(), [PASSAGE])
  assert.equal(e.blocs().length, 2)
  e.refaire()
  assert.deepEqual(e.surlignages(), [PASSAGE])
  assert.equal(e.blocs().length, 3)
  e.annuler()
  assert.deepEqual(e.surlignages(), [PASSAGE])
  assert.deepEqual(dessin(e), [PASSAGE])
})

test('beaucoup de gestes de structure à la suite : le passage suit, les anciennes ancres restent bornées', () => {
  const { e, f, id } = commente()
  const p = () => e.pos('Le zonage')
  for (let i = 0; i < 4; i++) {
    e.sel(p() + 3).cmd(splitBlock) // scinde « Le » / « zonage… »
    assert.deepEqual(e.surlignages(), [PASSAGE])
    e.sel(e.pos('zonage')).cmd(joinBackward) // refusionne
    assert.deepEqual(e.surlignages(), [PASSAGE])
  }
  assert.ok((e.map.get(id).anciennes || []).length <= 4)
  assert.equal(e.nb(), 1)
})

test('Entrée juste après le passage : le passage n’est pas étendu au paragraphe suivant', () => {
  const { e, t } = commente()
  e.sel(t).cmd(splitBlock)
  assert.deepEqual(e.surlignages(), [PASSAGE])
  assert.deepEqual(dessin(e), [PASSAGE])
})

test('frontières inchangées : écrire au bout du passage l’agrandit, au début non', () => {
  const fin = commente()
  fin.e.taper(fin.t, 'XX')
  assert.deepEqual(fin.e.surlignages(), [PASSAGE + 'XX'])
  const debut = commente()
  debut.e.taper(debut.f, 'XX')
  assert.deepEqual(debut.e.surlignages(), [PASSAGE])
})

test('à deux : l’Entrée de B réancre pour tout le monde, et A voit le même passage', async () => {
  const { a, b } = deuxClients()
  const f = a.pos(PASSAGE)
  const id = a.commenter(f, f + PASSAGE.length)
  sync(a, b)
  await tick()
  b.sel(f - 3).cmd(splitBlock)
  sync(a, b)
  await tick()
  assert.deepEqual(a.surlignages(), [PASSAGE])
  assert.deepEqual(b.surlignages(), [PASSAGE])
  assert.deepEqual(dessin(a), [PASSAGE])
  assert.deepEqual(dessin(b), [PASSAGE])
  assert.deepEqual(marques(a), [])
  assert.deepEqual(marques(b), [])
  assert.equal(JSON.stringify(a.map.get(id).anchorFrom), JSON.stringify(b.map.get(id).anchorFrom), 'même ancre des deux côtés')
})

test('à deux : A supprime le passage, B le voit masqué ; Ctrl+Z de A le rend aux deux', async () => {
  const { a, b } = deuxClients()
  const f = a.pos(PASSAGE)
  a.commenter(f, f + PASSAGE.length)
  sync(a, b)
  await tick()
  a.supprimer(f, f + PASSAGE.length)
  sync(a, b)
  await tick()
  assert.equal(a.nb(), 0)
  assert.equal(b.nb(), 0)
  a.annuler()
  sync(a, b)
  await tick()
  assert.equal(a.nb(), 1)
  assert.equal(b.nb(), 1)
  assert.deepEqual(b.surlignages(), [PASSAGE])
  assert.deepEqual(marques(b), [])
})

test('un lecteur dessine mais n’écrit rien : ni marque, ni réancrage, ni effacement', async () => {
  const a = client()
  const f = a.pos(PASSAGE)
  a.commenter(f, f + PASSAGE.length)
  const lecteur = client({ ydoc: new Y.Doc(), user: BRUNO, ecrit: false })
  sync(a, lecteur)
  await tick()
  assert.deepEqual(dessin(lecteur), [PASSAGE], 'il voit le passage commenté')
  // Le texte change sous ses yeux : Entrée, puis suppression du passage.
  a.sel(f - 3).cmd(splitBlock)
  sync(a, lecteur)
  await tick()
  assert.deepEqual(dessin(lecteur), [PASSAGE], 'il suit le réancrage de A')
  a.supprimer(a.pos(PASSAGE), a.pos(PASSAGE) + PASSAGE.length)
  sync(a, lecteur)
  await tick()
  assert.deepEqual(dessin(lecteur), [])
  assert.equal(lecteur.nb(), 0, 'masqué chez lui aussi (la marque est celle de A)')
  assert.equal(
    Y.decodeStateVector(Y.encodeStateVector(lecteur.ydoc)).get(lecteur.ydoc.clientID),
    undefined,
    'il n’a écrit aucune opération dans le document'
  )
})

test('la séquence relevée dans Chrome (Entrée, annuler, supprimer, annuler, titre, annuler) : texte et commentaire intacts à chaque pas', () => {
  const { e, f, t } = commente()
  const original = e.blocs()
  const intact = (quand) => {
    assert.deepEqual(e.blocs(), original, `texte intact ${quand}`)
    assert.deepEqual(e.surlignages(), [PASSAGE], `commentaire intact ${quand}`)
    assert.deepEqual(dessin(e), [PASSAGE], `surlignage intact ${quand}`)
  }
  e.sel(f).cmd(splitBlock)
  assert.equal(e.blocs().length, 3)
  assert.deepEqual(e.surlignages(), [PASSAGE])
  e.annuler()
  intact('après Entrée puis annuler')
  e.supprimer(f, t)
  assert.equal(e.nb(), 0)
  e.annuler()
  intact('après suppression puis annuler')
  e.sel(f + 2).cmd(setBlockType(schema.nodes.heading, { level: 2 }))
  assert.deepEqual(e.surlignages(), [PASSAGE])
  e.annuler()
  intact('après titre puis annuler')
})

test('estStructurel : la frappe et la suppression dans un paragraphe non, Entrée / fusion / titre oui', () => {
  const e = client()
  const f = e.pos(PASSAGE)
  const sans = (action) => {
    const avant = e.view.state
    let dernier = null
    e.view.setProps({
      dispatchTransaction: (tr) => {
        dernier = tr
        e.view.updateState(e.view.state.apply(tr))
      },
    })
    action()
    e.view.setProps({ dispatchTransaction: makeDispatchTransaction(e.view, () => ALICE) })
    void avant
    return dernier
  }
  assert.equal(estStructurel(sans(() => e.taper(f, 'a'))), false)
  assert.equal(estStructurel(sans(() => e.supprimer(f, f + 2))), false)
  assert.equal(estStructurel(sans(() => e.sel(f).cmd(splitBlock))), true)
  assert.equal(estStructurel(sans(() => e.sel(e.pos('Second')).cmd(setBlockType(schema.nodes.heading, { level: 2 })))), true)
})
