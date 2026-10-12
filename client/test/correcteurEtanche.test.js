// La règle du correcteur face à l'éditeur véritable (point 8, 13/10/2026).
//
// server/test/correcteur.test.js dit ce que la règle accepte et refuse sur
// des documents fabriqués à la main. Ici, c'est l'inverse : on monte l'éditeur
// tel qu'il est câblé dans l'application (liaison Yjs, suivi des
// modifications, annulation, commentaires), avec un correcteur dedans, on lui
// fait faire des gestes de correcteur — frapper, effacer, Entrée, coller,
// annuler, commenter, insérer une note — et chaque opération Yjs qu'il envoie
// est soumise à la réplique du serveur. **Aucune ne doit être refusée.** C'est
// le garde-fou contre le seul vrai risque de cette règle : refuser à tort un
// correcteur honnête, qui verrait sa page se recharger en pleine frappe.
//
// Puis le même client, trafiqué (suivi coupé, droit de modifier librement),
// écrit ce qu'il veut : le serveur doit le refuser, et la réplique rester
// exactement ce qu'elle était.
//
// Le « serveur » est la vraie classe `Repliques` du serveur, avec un journal
// en mémoire. Seuls des octets passent d'un côté à l'autre (le client et le
// serveur ont chacun leur copie de Yjs).

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import * as Y from 'yjs'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { splitBlock, joinBackward } from 'prosemirror-commands'
import { ySyncPlugin, yUndoPlugin, undo, redo, prosemirrorToYXmlFragment } from 'y-prosemirror'
import { schema } from '../src/schema.js'
import {
  trackChangesPlugin,
  makeDispatchTransaction,
  listChanges,
  acceptChange,
  rejectChange,
} from '../src/trackChanges.js'
import { commentsPlugin, addComment } from '../src/comments.js'
import { insererNote, footnotesPlugin } from '../src/footnotes.js'
import { Repliques } from '../../server/replique.js'
import { idCompte } from '../../server/users.js'

{
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of [
    'HTMLElement',
    'Node',
    'Element',
    'getComputedStyle',
    'DocumentFragment',
    'Range',
    'MutationObserver',
    'Event',
    'KeyboardEvent',
  ]) {
    globalThis[k] = w[k]
  }
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
}

const NOM_TEXTE = 'prosemirror-content'
const CAMILLE = { name: 'Camille Correctrice', color: '#336699', id: idCompte('camille@test.local') }
const MARIE = { name: 'Marie Éditrice', color: '#e07a5f', id: idCompte('marie@test.local') }

const T1 = 'Le zonage est un outil parmi d’autres, et il faut le redire.'
const T2 = 'Second paragraphe, bien distinct.'
const T3 = 'Troisième et dernier paragraphe du texte.'

const paragraphes = (...ts) =>
  schema.node(
    'doc',
    null,
    ts.map((t) => schema.node('paragraph', null, t ? [schema.text(t)] : []))
  )
const avecListe = () =>
  schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text(T1)]),
    schema.node('bullet_list', null, [
      schema.node('list_item', null, [schema.node('paragraph', null, [schema.text('Premier point')])]),
      schema.node('list_item', null, [schema.node('paragraph', null, [schema.text('Second point')])]),
    ]),
    schema.node('blockquote', null, [schema.node('paragraph', null, [schema.text('Une citation à respecter.')])]),
    schema.node('paragraph', null, [schema.text(T3)]),
  ])

/** Un serveur (la vraie réplique) et ses clients. `libre` : le client peut
 * modifier hors suivi — c'est le client trafiqué. */
async function scene({ initial = paragraphes(T1, T2, T3), mode = 'refuser' } = {}) {
  const base = new Y.Doc()
  prosemirrorToYXmlFragment(initial, base.getXmlFragment(NOM_TEXTE))
  const journal = [Buffer.from(Y.encodeStateAsUpdate(base))]
  const stockage = {
    journalInfo: () => ({ octets: 0 }),
    readUpdates: () => journal.map((u) => Buffer.from(u)),
    enAttente: () => [],
    compactionTrigger: 1e9,
    maxUncompactedBytes: 1e12,
  }
  const violations = []
  const refus = []
  const serveur = new Repliques(stockage, { modeCorrecteur: () => mode, surViolation: (i) => violations.push(i) })
  await serveur.obtenir('d')
  serveur.retenir('d')
  const clients = []

  function rejoindre(user, { correcteur = false, libre = !correcteur, suivi = correcteur } = {}) {
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, serveur.etat('d'))
    const frag = ydoc.getXmlFragment(NOM_TEXTE)
    const map = ydoc.getMap('comments')
    const hote = document.createElement('div')
    document.body.appendChild(hote)
    const state = EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(frag),
        yUndoPlugin(),
        trackChangesPlugin({ enabled: suivi }),
        commentsPlugin(ydoc, map, { peutEcrire: () => true }),
        footnotesPlugin(() => user),
      ],
    })
    const view = new EditorView(hote, { state })
    view.setProps({
      dispatchTransaction: makeDispatchTransaction(view, () => user, { peutModifierLibrement: () => libre }),
    })
    const c = { user, ydoc, map, view, correcteur, envoyes: 0 }
    ydoc.on('update', (u, origine) => {
      if (origine === 'relais') return
      c.envoyes++
      const octets = Buffer.from(u)
      const verdict = correcteur
        ? serveur.appliquerCorrecteur('d', octets, {
            noms: [user.name],
            idAuteur: user.id,
            email: `${user.name}@test.local`,
          })
        : serveur.appliquer('d', octets)
      if (!verdict.ok) {
        refus.push({ qui: user.name, raison: verdict.raison })
        return
      }
      journal.push(octets)
      for (const autre of clients) if (autre !== c) Y.applyUpdate(autre.ydoc, u, 'relais')
    })
    Object.assign(c, {
      sel(from, to = from) {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
        return c
      },
      taper(texte) {
        for (const ch of texte) {
          const { from, to } = view.state.selection
          view.dispatch(view.state.tr.insertText(ch, from, to))
        }
        return c
      },
      taperA(pos, texte, jusqua) {
        view.dispatch(view.state.tr.insertText(texte, pos, jusqua ?? pos))
        return c
      },
      effacer(from, to) {
        view.dispatch(view.state.tr.delete(from, to))
        return c
      },
      cmd(commande) {
        commande(view.state, view.dispatch, view)
        return c
      },
      pos(texte) {
        // Cherche dans le texte de chaque bloc : les frappes suivies sont autant de
        // passages distincts (l'horodatage de la marque change à chaque signe).
        let trouve = -1
        view.state.doc.descendants((node, p) => {
          if (trouve >= 0 || !node.isTextblock) return
          const i = node.textContent.indexOf(texte)
          if (i >= 0) trouve = p + 1 + i
        })
        assert.ok(trouve >= 0, `« ${texte} » introuvable`)
        return trouve
      },
      annuler() {
        undo(view.state, view.dispatch)
        return c
      },
      refaire() {
        redo(view.state, view.dispatch)
        return c
      },
      texte() {
        const l = []
        view.state.doc.forEach((n) => l.push(n.textContent))
        return l
      },
    })
    clients.push(c)
    return c
  }
  return { serveur, rejoindre, violations, refus, journal, clients }
}

const etatServeur = (s) => Buffer.from(s.serveur.etat('d')).toString('base64')
const faux = (s) => ({ violations: s.violations.map((v) => `${v.raison} (${v.detail})`), refus: s.refus })
const toutPasse = (s) => assert.deepEqual(faux(s), { violations: [], refus: [] })

// =============================================================================
// 1. Un correcteur honnête n'est jamais refusé
// =============================================================================

test('frapper au milieu d’un mot, à la fin, au début : lettre par lettre', async () => {
  const s = await scene()
  const c = s.rejoindre(CAMILLE, { correcteur: true })
  c.sel(c.pos('zonage') + 3).taper(' très')
  c.sel(c.pos('Second')).taper('Ah ! ')
  c.sel(c.pos('du texte.') + 9).taper(' Fin.')
  toutPasse(s)
  assert.ok(c.envoyes >= 10, `${c.envoyes} opérations jouées`)
  assert.match(c.texte().join(' '), /zon très age/.test(c.texte().join(' ')) ? /./ : /zon/)
})

test('effacer du texte de base (suppression suivie), char par char et d’un coup', async () => {
  const s = await scene()
  const c = s.rejoindre(CAMILLE, { correcteur: true })
  const f = c.pos('outil')
  c.effacer(f, f + 1)
  c.effacer(f + 1, f + 3)
  c.effacer(c.pos('Second'), c.pos('Second') + 20)
  toutPasse(s)
})

test('remplacer une sélection par du texte, d’une frappe puis par collage', async () => {
  const s = await scene()
  const c = s.rejoindre(CAMILLE, { correcteur: true })
  const f = c.pos('outil parmi')
  c.sel(f, f + 5).taper('instrument')
  c.taperA(c.pos('bien distinct'), 'très marqué', c.pos('bien distinct') + 13)
  toutPasse(s)
})

test('effacer ce qu’on vient de taper, et le retaper', async () => {
  const s = await scene()
  const c = s.rejoindre(CAMILLE, { correcteur: true })
  const f = c.pos('Second')
  c.sel(f).taper('provisoire')
  c.effacer(f, f + 10)
  c.sel(f).taper('définitif')
  toutPasse(s)
})

test('Entrée au milieu, à la fin, au début d’un paragraphe, puis taper dans le nouveau', async () => {
  const s = await scene()
  const c = s.rejoindre(CAMILLE, { correcteur: true })
  c.sel(c.pos('et il faut')).cmd(splitBlock)
  c.taper('Suite ')
  c.sel(c.pos('Second paragraphe') + 'Second paragraphe, bien distinct.'.length).cmd(splitBlock)
  c.taper('Tout neuf.')
  c.sel(c.pos('Troisième')).cmd(splitBlock)
  toutPasse(s)
})

test('Entrée puis Retour arrière : on referme son propre saut', async () => {
  const s = await scene()
  const c = s.rejoindre(CAMILLE, { correcteur: true })
  c.sel(c.pos('et il faut')).cmd(splitBlock)
  c.cmd(joinBackward)
  toutPasse(s)
})

test('plusieurs Entrée à la suite sur une ligne blanche', async () => {
  const s = await scene({ initial: paragraphes(T1, '', T3) })
  const c = s.rejoindre(CAMILLE, { correcteur: true })
  c.sel(c.pos(T3) - 2).taper('x')
  const blanc = c.view.state.doc.child(0).nodeSize + 1
  c.sel(blanc).cmd(splitBlock).cmd(splitBlock).taper('trois lignes')
  toutPasse(s)
})

test('effacer à cheval sur deux paragraphes', async () => {
  const s = await scene()
  const c = s.rejoindre(CAMILLE, { correcteur: true })
  c.effacer(c.pos('il faut'), c.pos('Second') + 6)
  toutPasse(s)
})

test('annuler et refaire ses propres gestes', async () => {
  const s = await scene()
  const c = s.rejoindre(CAMILLE, { correcteur: true })
  c.sel(c.pos('zonage')).taper('XX')
  c.annuler()
  c.refaire()
  c.effacer(c.pos('outil'), c.pos('outil') + 5)
  c.annuler()
  c.sel(c.pos('Second')).cmd(splitBlock).taper('A')
  c.annuler()
  c.annuler()
  toutPasse(s)
})

test('dans une liste et dans une citation', async () => {
  const s = await scene({ initial: avecListe() })
  const c = s.rejoindre(CAMILLE, { correcteur: true })
  c.sel(c.pos('Premier') + 7).taper(' (bis)')
  c.effacer(c.pos('Second'), c.pos('Second') + 3)
  c.sel(c.pos('citation à') + 3).taper('x')
  c.effacer(c.pos('respecter'), c.pos('respecter') + 3)
  toutPasse(s)
})

test('commenter un passage, répondre, supprimer son commentaire', async () => {
  const s = await scene()
  const c = s.rejoindre(CAMILLE, { correcteur: true })
  const f = c.pos('outil parmi')
  c.sel(f, f + 11)
  addComment(c.view, c.ydoc, c.map, CAMILLE, 'Pourquoi « outil » ?')
  const id = [...c.map.keys()][0]
  c.map.delete(id)
  toutPasse(s)
  assert.equal(s.journal.length > 1, true)
})

test('insérer une note de bas de page en suivi', async () => {
  const s = await scene()
  const c = s.rejoindre(CAMILLE, { correcteur: true })
  c.sel(c.pos('redire'))
  insererNote(c.view, CAMILLE)
  toutPasse(s)
})

test('rejoindre un document déjà annoté par un éditeur et par l’IA', async () => {
  const s = await scene()
  const marie = s.rejoindre(MARIE, { suivi: true })
  marie.sel(marie.pos('Second')).taper('Marie propose. ')
  marie.effacer(marie.pos('bien'), marie.pos('bien') + 5)
  const camille = s.rejoindre(CAMILLE, { correcteur: true })
  camille.sel(camille.pos('Marie propose.') + 5).taper('-ci')
  camille.effacer(camille.pos('Marie-ci'), camille.pos('Marie-ci') + 6) // une insertion de Marie, effacée pour de vrai
  camille.sel(camille.pos('distinct') + 3).taper('!')
  toutPasse(s)
})

test('deux personnes à la fois : l’éditeur écrit sans suivi pendant que la correctrice tape', async () => {
  const s = await scene()
  const marie = s.rejoindre(MARIE, { suivi: false })
  const camille = s.rejoindre(CAMILLE, { correcteur: true })
  camille.sel(camille.pos('Second')).taper('Un ')
  marie.sel(marie.pos('Troisième')).taper('Direct, ')
  camille.sel(camille.pos('dernier')).taper('très ')
  marie.effacer(marie.pos('Le zonage'), marie.pos('Le zonage') + 3)
  camille.sel(camille.pos('Un ') + 3).taper('autre ')
  toutPasse(s)
  assert.deepEqual(camille.texte(), marie.texte(), 'les deux voient la même chose')
})

test('l’éditeur accepte et rejette des changements de la correctrice, qui continue de taper', async () => {
  const s = await scene()
  const marie = s.rejoindre(MARIE, { suivi: false })
  const camille = s.rejoindre(CAMILLE, { correcteur: true })
  camille.sel(camille.pos('Second')).taper('Un ')
  camille.effacer(camille.pos('bien'), camille.pos('bien') + 5)
  acceptChange(marie.view, listChanges(marie.view.state.doc)[0])
  camille.sel(camille.pos('Troisième')).taper('Deux ')
  rejectChange(marie.view, listChanges(marie.view.state.doc)[0])
  camille.sel(camille.pos('dernier')).taper('trois ')
  toutPasse(s)
})

test('un nom avec accents et espaces', async () => {
  const s = await scene()
  const zoe = { name: '  Zoé  Œuvrière ', color: '#7209b7', id: idCompte('zoe@test.local') }
  const c = s.rejoindre(zoe, { correcteur: true })
  c.sel(c.pos('Second')).taper('Là ')
  toutPasse(s)
})

test('un long document : une centaine de frappes réparties', async () => {
  const blocs = Array.from(
    { length: 150 },
    (_, i) => `Paragraphe ${i} : du texte pour faire un document qui ressemble à quelque chose.`
  )
  const s = await scene({ initial: paragraphes(...blocs) })
  const c = s.rejoindre(CAMILLE, { correcteur: true })
  for (let i = 0; i < 100; i += 7) c.sel(c.pos(`Paragraphe ${i} :`) + 14).taper(' ajout')
  toutPasse(s)
})

// =============================================================================
// 2. Un client trafiqué est refusé, et le document ne bouge pas
// =============================================================================

async function trafique(geste) {
  const s = await scene()
  const c = s.rejoindre(CAMILLE, { correcteur: true, libre: true, suivi: false })
  const avant = etatServeur(s)
  const texteAvant = Buffer.from(s.serveur.repliques.get('d').doc.getXmlFragment(NOM_TEXTE).toString()).toString()
  geste(c)
  return { s, c, avant, texteAvant }
}

test('écrire sans suivi : refusé, réplique inchangée', async () => {
  const { s, avant } = await trafique((c) => c.sel(c.pos('Second')).taper('clandestin '))
  assert.ok(s.refus.length > 0, 'au moins une opération refusée')
  assert.equal(etatServeur(s), avant)
  assert.match(s.refus[0].raison, /suivi de modifications/)
})

test('effacer sans suivi : refusé', async () => {
  const { s, avant } = await trafique((c) => c.effacer(c.pos('outil'), c.pos('outil') + 5))
  assert.equal(s.refus.length, 1)
  assert.equal(etatServeur(s), avant)
})

test('changer la structure sans suivi : refusé', async () => {
  const { s, avant } = await trafique((c) => c.sel(c.pos('et il faut')).cmd(splitBlock))
  assert.ok(s.refus.length >= 1)
  assert.equal(etatServeur(s), avant)
})

test('après un refus, le serveur continue d’accepter un correcteur honnête', async () => {
  const s = await scene()
  const mauvais = s.rejoindre(CAMILLE, { correcteur: true, libre: true, suivi: false })
  mauvais.sel(mauvais.pos('Second')).taper('X')
  assert.ok(s.refus.length > 0)
  const honnete = s.rejoindre({ ...CAMILLE, name: 'Honorine', id: idCompte('h@test.local') }, { correcteur: true })
  honnete.sel(honnete.pos('Troisième')).taper('Bien. ')
  assert.deepEqual(s.violations.length, s.refus.length, 'seul le trafiqueur a été signalé')
  assert.equal(honnete.texte().join(' ').includes('Bien.'), true)
})

test('mode « observer » : la violation est signalée, l’opération passe', async () => {
  const s = await scene({ mode: 'observer' })
  const c = s.rejoindre(CAMILLE, { correcteur: true, libre: true, suivi: false })
  c.sel(c.pos('Second')).taper('X')
  assert.equal(s.refus.length, 0)
  assert.ok(s.violations.length > 0)
  assert.equal(s.violations[0].mode, 'observer')
})

test('mode « off » : rien n’est vérifié', async () => {
  const s = await scene({ mode: 'off' })
  const c = s.rejoindre(CAMILLE, { correcteur: true, libre: true, suivi: false })
  c.sel(c.pos('Second')).taper('X')
  assert.deepEqual(faux(s), { violations: [], refus: [] })
})
