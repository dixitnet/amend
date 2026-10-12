// En-têtes de sécurité (audit du 10/10/2026, point 30).
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { modeCsp, politiqueApplication, poserEnTetes } from '../enTetes.js'

// --- sur le vrai serveur ----------------------------------------------------

const PORT = 18811
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-entetes-'))
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = ''
process.env.CSP_MODE = ''
process.env.APP_BASE_URL = 'https://www.amend.ink'
const BASE = `http://localhost:${PORT}`

await import('../server.js')
await new Promise((resolve, reject) => {
  const fin = Date.now() + 5000
  ;(function essai() {
    fetch(`${BASE}/api/auth/me`).then(resolve, (err) => (Date.now() > fin ? reject(err) : setTimeout(essai, 50)))
  })()
})

function fausseReponse() {
  const h = {}
  return { h, setHeader: (k, v) => (h[k] = v) }
}

test('le mode de la CSP : inconnu ou absent retombe sur « report-only »', () => {
  assert.equal(modeCsp(undefined), 'enforce')
  assert.equal(modeCsp(''), 'enforce')
  assert.equal(modeCsp('nimporte'), 'enforce')
  assert.equal(modeCsp('ENFORCE'), 'enforce')
  assert.equal(modeCsp(' off '), 'off')
  assert.equal(modeCsp('report-only'), 'report-only')
})

test('la politique n’ouvre aucun script en ligne ni extérieur, et interdit les cadres', () => {
  const p = politiqueApplication('https://www.amend.ink')
  assert.match(p, /script-src 'self'(;|$)/)
  assert.ok(!/script-src[^;]*unsafe/.test(p), 'aucun script en ligne')
  assert.match(p, /frame-ancestors 'none'/)
  assert.match(p, /object-src 'none'/)
  assert.match(p, /connect-src 'self' wss:\/\/www\.amend\.ink/)
  assert.match(politiqueApplication('http://localhost:8787'), /ws:\/\/localhost:8787/)
  assert.doesNotMatch(politiqueApplication('pas une adresse'), /ws/)
})

test('report-only : l’en-tête de rapport, rien qui bloque', () => {
  const res = fausseReponse()
  poserEnTetes(res, { mode: 'report-only', politique: 'P', chemin: '/' })
  assert.equal(res.h['content-security-policy-report-only'], 'P')
  assert.equal('content-security-policy' in res.h, false)
  assert.equal(res.h['x-content-type-options'], 'nosniff')
  assert.equal(res.h['x-frame-options'], 'DENY')
  assert.ok(res.h['referrer-policy'])
  assert.match(res.h['permissions-policy'], /camera=\(\)/)
})

test('enforce : l’en-tête qui bloque', () => {
  const res = fausseReponse()
  poserEnTetes(res, { mode: 'enforce', politique: 'P', chemin: '/api/docs' })
  assert.equal(res.h['content-security-policy'], 'P')
  assert.equal('content-security-policy-report-only' in res.h, false)
})

test('off : pas de CSP, mais les autres en-têtes restent', () => {
  const res = fausseReponse()
  poserEnTetes(res, { mode: 'off', politique: 'P', chemin: '/' })
  assert.deepEqual(
    Object.keys(res.h).filter((k) => k.startsWith('content-security')),
    []
  )
  assert.equal(res.h['x-content-type-options'], 'nosniff')
})

test('une page publiée garde sa propre CSP : celle de l’application ne s’y ajoute pas', () => {
  const res = fausseReponse()
  poserEnTetes(res, { mode: 'enforce', politique: 'P', chemin: '/p/garrigue-optique-appuyer' })
  assert.equal('content-security-policy' in res.h, false)
  assert.equal(res.h['x-content-type-options'], 'nosniff')
})

test('le serveur pose les en-têtes sur la page, l’API et une erreur', async () => {
  for (const chemin of ['/', '/api/auth/me', '/introuvable', '/api/docs']) {
    const res = await fetch(`${BASE}${chemin}`)
    await res.arrayBuffer()
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', chemin)
    assert.equal(res.headers.get('x-frame-options'), 'DENY', chemin)
    // Sans CSP_MODE, la CSP est bloquante (défaut depuis le 10/10/2026).
    assert.match(res.headers.get('content-security-policy') || '', /default-src 'self'/, chemin)
    assert.equal(res.headers.get('content-security-policy-report-only'), null, chemin)
  }
})

test('la page publiée d’un nom inconnu n’a pas la CSP de l’application', async () => {
  const res = await fetch(`${BASE}/p/jamais-publie-ailleurs`)
  await res.arrayBuffer()
  assert.equal(res.headers.get('content-security-policy-report-only'), null)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
