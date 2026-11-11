// L'historique (adaptateurs/blocknote/historique.js) : qui ne peut pas
// restaurer n'a, dans le stockage donné à l'extension de versions, aucune des
// actions retirées (créer, renommer, restaurer, supprimer une version) ; le
// reste du stockage est gardé. Mesuré par ce que l'extension en déduit
// (`canCreate`, `canRename`, `canRestore`, `canRemove`, `historyIncludesBeginning`),
// avec un faux éditeur qui ne fournit que la collaboration.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from '@y/y'
import { createYHubVersionStorage } from '@blocknote/core/y'
import { extensionHistorique } from '../../adaptateurs/blocknote/historique.js'

const contexte = () => ({ api: 'http://y-hub.invalide', docId: 'doc-1', fragment: new Y.Doc().get('f') })

function monter(peutRestaurer) {
  const ctx = contexte()
  const editor = {
    on: (evenement, f) => evenement === 'create' && f(),
    getExtension: () => ({ fragment: ctx.fragment, userStore: async () => [] }),
  }
  return extensionHistorique(ctx, peutRestaurer, 'Avant le retour')({ editor })
}

test('historique : qui peut restaurer garde toutes les actions', () => {
  const ext = monter(true)
  assert.deepEqual([ext.canCreate, ext.canRename, ext.canRestore, ext.canRemove], [true, true, true, true])
})

test('historique : qui ne peut pas restaurer n’a aucune des quatre actions, mais garde le reste du stockage', () => {
  const ext = monter(false)
  assert.deepEqual([ext.canCreate, ext.canRename, ext.canRestore, ext.canRemove], [false, false, false, false])
  // Les autres clés de l'objet de BlockNote sont conservées (liste, contenu,
  // attributions, début de l'historique) : tout le monde voit tout l'historique.
  assert.equal(ext.historyIncludesBeginning, true)
  assert.equal(typeof ext.list, 'function')
})

test('historique : les quatre actions retirées existent bien dans le stockage de BlockNote (un renommage amont casserait le retrait)', () => {
  const complet = createYHubVersionStorage({
    baseUrl: 'http://y-hub.invalide',
    org: 'amend',
    docId: 'doc-1',
    fragment: new Y.Doc().get('f'),
    beforeRestoreName: 'x',
  })
  for (const action of ['create', 'rename', 'restore', 'remove'])
    assert.equal(typeof complet[action], 'function', action)
  for (const gardee of ['list', 'getContent', 'getAttributions', 'historyIncludesBeginning'])
    assert.ok(gardee in complet, gardee)
})
