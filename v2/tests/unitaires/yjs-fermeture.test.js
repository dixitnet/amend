// T1 : la fermeture définitive d'une connexion, vue par l'application (adaptateur Yjs) : le code
// de y/hub devient `droits` (4401), `supprime` (4404) ou `erreur`, une seule fois pour les deux
// connexions (texte et suggestions). Protège la montée de `@y/websocket` (audit du 16/11/2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ouvrirDocument } from '../../adaptateurs/yjs/index.js'

/** Un document ouvert vers un port où rien n'écoute : seuls les abonnements nous intéressent. */
const ouvrir = (suggestions) =>
  ouvrirDocument({
    url: 'ws://127.0.0.1:1',
    api: 'http://127.0.0.1:1/collaboration',
    docId: 'essai',
    personne: { id: 'p', nom: 'Paule', couleur: 'red' },
    suggestions,
  })

for (const [code, attendu] of [
  [4401, 'droits'],
  [4404, 'supprime'],
  [1011, 'erreur'],
])
  test(`fermeture ${code} : l’application reçoit « ${attendu} »`, () => {
    const session = ouvrir(false)
    const recus = []
    session.surFermeture((raison) => recus.push(raison))
    session.contexte.fournisseur.emit('closed', [{ code }])
    assert.deepEqual(recus, [attendu])
    session.fermer()
  })

test('fermeture : une seule fois pour les deux connexions, et plus rien après le désabonnement', () => {
  const session = ouvrir(true)
  const recus = []
  const cesser = session.surFermeture((raison) => recus.push(raison))
  session.contexte.suggestions.fournisseur.emit('closed', [{ code: 4401 }])
  session.contexte.fournisseur.emit('closed', [{ code: 4404 }])
  assert.deepEqual(recus, ['droits'], 'la seconde fermeture ne rappelle pas')
  cesser()
  session.contexte.fournisseur.emit('closed', [{ code: 4404 }])
  assert.deepEqual(recus, ['droits'])
  session.fermer()
})
