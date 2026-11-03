// Curseurs des autres personnes masqués pendant une composition (écart 6 de la
// campagne du 02/11/2026). Le comportement réel — touche morte contre le
// curseur d'une autre personne — est vérifié dans un navigateur par
// tools/campagne/scenarios.mjs (« Touche morte contre le curseur de l'autre ») ;
// ici, la mécanique : le filtre et la demande de redessin.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { yCursorPluginKey } from 'y-prosemirror'
import { EditorState } from 'prosemirror-state'
import { schema } from '../src/schema.js'
import { curseursPendantComposition } from '../src/curseursComposition.js'

function fausseVue() {
  const envoyees = []
  const view = {
    isDestroyed: false,
    state: EditorState.create({ schema }),
    dispatch(tr) {
      envoyees.push(tr)
    },
  }
  return { view, envoyees }
}

test('hors composition : les curseurs des autres sont dessinés, pas le sien', () => {
  const { filtre } = curseursPendantComposition()
  assert.equal(filtre(1, 2), true)
  assert.equal(filtre(1, 1), false)
})

test('pendant une composition : aucun curseur distant, et un redessin est demandé', async () => {
  const { filtre, greffon, enComposition } = curseursPendantComposition()
  const { view, envoyees } = fausseVue()
  const evenements = greffon.props.handleDOMEvents
  assert.equal(evenements.compositionstart(view), false, 'ne capture pas l’évènement')
  assert.equal(enComposition(), true)
  assert.equal(filtre(1, 2), false)
  assert.equal(envoyees.length, 1)
  assert.deepEqual(envoyees[0].getMeta(yCursorPluginKey), { awarenessUpdated: true })
  // Un second compositionstart (mise à jour) ne redessine pas une seconde fois.
  evenements.compositionstart(view)
  assert.equal(envoyees.length, 1)
  // Fin : les curseurs reviennent, redessinés juste après.
  evenements.compositionend(view)
  assert.equal(filtre(1, 2), true)
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(envoyees.length, 2)
})

test('vue détruite entre-temps : pas de redessin', async () => {
  const { greffon } = curseursPendantComposition()
  const { view, envoyees } = fausseVue()
  greffon.props.handleDOMEvents.compositionend(view)
  view.isDestroyed = true
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(envoyees.length, 0)
})
