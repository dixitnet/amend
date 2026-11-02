// Service des fichiers du client (server/statique.js) : politique de cache,
// revalidation (304), 404 franc pour un fichier d'assets disparu, repli SPA
// (audit du premier chargement, 02/11/2026).

import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creerServiceStatique, politiqueDeCache } from '../statique.js'

const dist = mkdtempSync(join(tmpdir(), 'amend-statique-'))
mkdirSync(join(dist, 'assets'))
writeFileSync(join(dist, 'index.html'), '<!doctype html><script src="./assets/index-abc.js"></script>')
writeFileSync(join(dist, 'assets', 'index-abc.js'), 'console.log(1)')
writeFileSync(join(dist, 'site.webmanifest'), '{}')

const service = creerServiceStatique(dist)
const serveur = createServer((req, res) => service(req, res, new URL(req.url, 'http://x').pathname))
await new Promise((r) => serveur.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${serveur.address().port}`
test.after(() => {
  serveur.close()
  rmSync(dist, { recursive: true, force: true })
})

test('politique de cache selon le chemin', () => {
  assert.equal(politiqueDeCache('/assets/index-abc.js'), 'public, max-age=31536000, immutable')
  assert.equal(politiqueDeCache('/index.html'), 'no-cache')
  assert.equal(politiqueDeCache('/mentions-legales.html'), 'no-cache')
  assert.equal(politiqueDeCache('/favicon.ico'), 'public, max-age=3600')
})

test('assets : immuables un an, avec validateurs et taille', async () => {
  const r = await fetch(`${base}/assets/index-abc.js`)
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal(r.headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.equal(r.headers.get('content-length'), '14')
  assert.ok(r.headers.get('etag'))
  assert.ok(r.headers.get('last-modified'))
  assert.equal(await r.text(), 'console.log(1)')
})

test('index.html : revalidé, 304 quand le navigateur a déjà cette version', async () => {
  const r = await fetch(`${base}/`)
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('cache-control'), 'no-cache')
  const etag = r.headers.get('etag')
  const r2 = await fetch(`${base}/`, { headers: { 'if-none-match': etag } })
  assert.equal(r2.status, 304)
  assert.equal(await r2.text(), '')
  const r3 = await fetch(`${base}/`, { headers: { 'if-modified-since': r.headers.get('last-modified') } })
  assert.equal(r3.status, 304)
  const r4 = await fetch(`${base}/`, { headers: { 'if-none-match': 'W/"autre"' } })
  assert.equal(r4.status, 200)
})

test('route du client : repli sur index.html, revalidé', async () => {
  const r = await fetch(`${base}/une/route`)
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('cache-control'), 'no-cache')
  assert.match(await r.text(), /index-abc\.js/)
})

test('fichier d’assets disparu : 404 franc, jamais la page d’accueil', async () => {
  const r = await fetch(`${base}/assets/index-ancien.js`)
  assert.equal(r.status, 404)
  assert.equal(r.headers.get('cache-control'), 'no-store')
})

test('autres fichiers publics : une heure', async () => {
  const r = await fetch(`${base}/site.webmanifest`)
  assert.equal(r.headers.get('cache-control'), 'public, max-age=3600')
  assert.equal(r.headers.get('content-type'), 'application/manifest+json')
})

test('HEAD : en-têtes sans corps', async () => {
  const r = await fetch(`${base}/assets/index-abc.js`, { method: 'HEAD' })
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('content-length'), '14')
  assert.equal(await r.text(), '')
})
