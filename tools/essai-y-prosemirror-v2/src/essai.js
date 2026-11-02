/* global location, document, window */
// Essai de @y/prosemirror v2 (mode suggestion natif) — une personne par onglet.
// Documents synchronisés entre onglets par BroadcastChannel ; ?u=A|B|C, ?init=1
// pour déposer le texte de départ.
import * as Y from '@y/y'
import * as awarenessProtocol from '@y/protocols/awareness'
import {
  syncPlugin,
  configureYProsemirror,
  defaultMapAttributionToMark,
  undoCommand,
  redoCommand,
  acceptAllChanges,
  rejectAllChanges,
  yCursorPlugin,
  yUndoPlugin,
  pmnodeToDelta,
} from '@y/prosemirror'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark } from 'prosemirror-commands'
import { schema } from './schema.js'

const params = new URLSearchParams(location.search)
const qui = params.get('u') || 'A'
const COULEURS = { A: '#3d5a80', B: '#e07a5f', C: '#81b29a' }

const base = new Y.Doc({ gc: false })
const sugg = new Y.Doc({ gc: false, isSuggestionDoc: true })
const renderer = Y.createDiffRenderer(base, sugg, { attributions: Y.createContentMap() })
const awareness = new awarenessProtocol.Awareness(base)
awareness.setLocalStateField('user', { name: qui, color: COULEURS[qui] })

// Réseau : un canal par document, un délai pour simuler la latence.
const DELAI = Number(params.get('delai') || 30)
const canal = new BroadcastChannel('essai-v2-' + (params.get('salle') || '0'))
const envoyer = (m) => setTimeout(() => canal.postMessage(m), DELAI)
base.on('update', (u, origine) => origine !== 'reseau' && envoyer({ doc: 'base', u }))
sugg.on('update', (u, origine) => origine !== 'reseau' && envoyer({ doc: 'sugg', u }))
awareness.on('update', ({ added, updated, removed }, origine) => {
  if (origine === 'reseau') return
  const ids = [...added, ...updated, ...removed]
  envoyer({ doc: 'aw', u: awarenessProtocol.encodeAwarenessUpdate(awareness, ids) })
})
canal.onmessage = ({ data }) => {
  if (data.doc === 'base') Y.applyUpdate(base, data.u, 'reseau')
  else if (data.doc === 'sugg') Y.applyUpdate(sugg, data.u, 'reseau')
  else if (data.doc === 'aw') awarenessProtocol.applyAwarenessUpdate(awareness, data.u, 'reseau')
  else if (data.doc === 'bonjour' && data.de !== qui) {
    canal.postMessage({ doc: 'base', u: Y.encodeStateAsUpdate(base) })
    canal.postMessage({ doc: 'sugg', u: Y.encodeStateAsUpdate(sugg) })
  }
}

if (params.get('init')) {
  const depart = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Le chat noir dort sur le canapé du salon.')]),
    schema.node('paragraph', null, [schema.text('Il fait beau ce matin, dit-elle.')]),
    schema.node('paragraph', null, [schema.text('La pluie reviendra demain soir.')]),
  ])
  base.get().applyDelta(pmnodeToDelta(depart))
}
canal.postMessage({ doc: 'bonjour', de: qui })

const view = new EditorView(document.querySelector('#editeur'), {
  state: EditorState.create({
    schema,
    plugins: [
      syncPlugin({ mapAttributionToMark: defaultMapAttributionToMark }),
      yCursorPlugin(awareness),
      yUndoPlugin(new Y.UndoManager(sugg.get(), { trackedOrigins: new Set() })),
      keymap({
        'Mod-z': undoCommand,
        'Mod-y': redoCommand,
        'Mod-Shift-z': redoCommand,
        'Mod-b': toggleMark(schema.marks.strong),
      }),
      keymap(baseKeymap),
    ],
  }),
})

function mode(m) {
  if (m === 'off') configureYProsemirror({ ytype: base.get(), renderer: null })(view.state, view.dispatch)
  else {
    renderer.suggestionMode = m === 'edit'
    configureYProsemirror({ ytype: sugg.get(), renderer })(view.state, view.dispatch)
  }
}
mode(params.get('mode') || 'edit')

/** Lecture compacte : texte, [-supprimé-], {+ajouté+}, (*mis en forme*). */
function lire() {
  const blocs = []
  view.state.doc.forEach((bloc) => {
    let s = ''
    const marqueBloc = bloc.marks.map((m) => m.type.name).join(',')
    bloc.descendants((n) => {
      if (!n.isText) return
      const noms = n.marks.map((m) => m.type.name)
      let t = n.text
      if (noms.includes('strong')) t = `**${t}**`
      if (noms.includes('y-attributed-format')) t = `(*${t}*)`
      if (noms.includes('y-attributed-delete')) t = `[-${t}-]`
      if (noms.includes('y-attributed-insert')) t = `{+${t}+}`
      s += t
    })
    blocs.push((marqueBloc ? `<${marqueBloc}>` : '') + s)
  })
  return blocs
    .join('\n')
    .replace(/\+\}\{\+/g, '')
    .replace(/-\]\[-/g, '')
}

window.essai = {
  qui,
  view,
  lire,
  mode,
  toutAccepter: () => acceptAllChanges()(view.state, view.dispatch),
  toutRejeter: () => rejectAllChanges()(view.state, view.dispatch),
  remettre: () => {
    // Retour au texte de départ : on vide les deux documents et on redépose.
    mode('off')
    const t = base.get()
    base.transact(() => {
      t.delete(0, t.length)
    })
    const depart = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('Le chat noir dort sur le canapé du salon.')]),
      schema.node('paragraph', null, [schema.text('Il fait beau ce matin, dit-elle.')]),
      schema.node('paragraph', null, [schema.text('La pluie reviendra demain soir.')]),
    ])
    t.applyDelta(pmnodeToDelta(depart))
  },
  erreurs: [],
}
window.addEventListener('error', (e) => window.essai.erreurs.push(String(e.message)))
