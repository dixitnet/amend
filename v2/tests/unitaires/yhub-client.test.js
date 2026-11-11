// L'adaptateur y/hub côté serveur (adaptateurs/yhub/client.js) face à des
// réponses d'erreur, contre un faux y/hub local (audit du 10/11/2026 : seuls
// les chemins heureux étaient couverts, par la pile).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { clientCollaboration } from '../../adaptateurs/yhub/client.js'

let reponses = []
const recues = []
const faux = http.createServer((req, res) => {
  recues.push({ methode: req.method, url: req.url, jeton: req.headers['x-amend-interne'] })
  res.writeHead(reponses.shift() ?? 200)
  res.end()
})
await new Promise((r) => faux.listen(0, '127.0.0.1', r))
after(() => faux.close())
const client = clientCollaboration({ url: `http://127.0.0.1:${faux.address().port}/collaboration`, jeton: 'j' })

test('supprimer : les deux branches, avec le jeton interne ; une branche jamais écrite (404) n’est pas une erreur', async () => {
  recues.length = 0
  reponses = [200, 404]
  await client.supprimerDocument('doc-a')
  assert.deepEqual(
    recues.map((r) => [r.methode, /branch=(\w+)/.exec(r.url)[1], r.url.includes('hard=true'), r.jeton]),
    [
      ['DELETE', 'main', true, 'j'],
      ['DELETE', 'suggestions', true, 'j'],
    ],
  )
})

test('supprimer : un refus de y/hub, même sur la seconde branche, remonte avec le code collaboration-indisponible', async () => {
  reponses = [200, 500]
  await assert.rejects(client.supprimerDocument('doc-b'), { code: 'collaboration-indisponible' })
  reponses = [503]
  await assert.rejects(client.supprimerDocument('doc-c'), { code: 'collaboration-indisponible' })
})

test('lire le texte : un refus de y/hub remonte avec le code collaboration-indisponible', async () => {
  reponses = [403]
  await assert.rejects(client.lireTexte('doc-d'), { code: 'collaboration-indisponible' })
})

test('corbeille : suppression douce des deux branches (sans hard), restauration par la route restore-ydoc', async () => {
  recues.length = 0
  reponses = [200, 404, 200, 200]
  await client.mettreALaCorbeille('doc-e')
  await client.restaurer('doc-e')
  assert.deepEqual(
    recues.map((r) => [r.methode, r.url.split('?')[0], /branch=(\w+)/.exec(r.url)[1], r.url.includes('hard')]),
    [
      ['DELETE', '/collaboration/ydoc/v1/amend/doc-e', 'main', false],
      ['DELETE', '/collaboration/ydoc/v1/amend/doc-e', 'suggestions', false],
      ['POST', '/collaboration/restore-ydoc/v1/amend/doc-e', 'main', false],
      ['POST', '/collaboration/restore-ydoc/v1/amend/doc-e', 'suggestions', false],
    ],
  )
  reponses = [409]
  await assert.rejects(client.restaurer('doc-f'), { code: 'collaboration-indisponible' })
})
