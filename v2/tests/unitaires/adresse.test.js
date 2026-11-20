// T1 : le changement d'adresse de la v2 (exploitation/prod/adresse.sh, 20/11/2026), joué en essai sur des
// copies d'un Caddyfile et d'un v2.env : ce qu'il écrit, ce qu'il garde, le retour en arrière, le retrait du renvoi.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../../exploitation/prod/adresse.sh', import.meta.url))
// Un Caddyfile de production : la v1, puis le bloc de la v2 tel que le dépôt le donnait.
const BLOC_V2 = readFileSync(new URL('./donnees/Caddyfile-v2-avant.txt', import.meta.url), 'utf8')
const CADDY = `www.amend.ink {\n    reverse_proxy localhost:3000\n}\n\n${BLOC_V2}`
const ENV = [
  'V2_PORT=4300',
  'V2_SECRET=abc',
  'V2_COLLAB_URL=wss://v2.amend.ink/collaboration/ws/v1/amend',
  'V2_SERVEUR=http://127.0.0.1:4300',
  'V2_ORIGINES=https://v2.amend.ink',
  'V2_ADRESSE=https://v2.amend.ink',
  'V2_MAILGUN_DOMAINE=mg.amend.ink',
  '',
].join('\n')

function monter(caddy = CADDY, env = ENV) {
  const dossier = mkdtempSync(join(tmpdir(), 'adresse-'))
  const f = { caddy: join(dossier, 'Caddyfile'), env: join(dossier, 'v2.env') }
  writeFileSync(f.caddy, caddy)
  writeFileSync(f.env, env)
  const lancer = (...options) => {
    try {
      return {
        code: 0,
        sortie: execFileSync('bash', [SCRIPT, '--essai', ...options], {
          env: { ...process.env, CADDYFILE: f.caddy, ENV: f.env },
          encoding: 'utf8',
        }),
      }
    } catch (e) {
      return { code: e.status, sortie: String(e.stdout) }
    }
  }
  const lire = () => ({ caddy: readFileSync(f.caddy, 'utf8'), env: readFileSync(f.env, 'utf8') })
  return { lancer, lire, fermer: () => rmSync(dossier, { recursive: true, force: true }) }
}

test('changement d’adresse : app.amend.ink sert l’application, v2.amend.ink renvoie, trois lignes de v2.env changent', () => {
  const m = monter()
  try {
    const r = m.lancer()
    assert.equal(r.code, 0, r.sortie)
    const { caddy, env } = m.lire()
    // La v1 n'est pas touchée.
    assert.ok(caddy.startsWith('www.amend.ink {\n    reverse_proxy localhost:3000\n}\n'))
    // La nouvelle adresse a le bloc de l'ancienne, tel quel.
    const bloc = (nom) => caddy.slice(caddy.indexOf(`\n${nom} {`) + 1).split('\n}\n')[0]
    assert.equal(
      bloc('app.amend.ink').replace('app.amend.ink', 'v2.amend.ink'),
      BLOC_V2.slice(BLOC_V2.indexOf('v2.amend.ink {')).split('\n}\n')[0],
    )
    assert.match(bloc('app.amend.ink'), /handle \/collaboration\/\* \{\s+reverse_proxy localhost:4400/)
    // L'ancienne n'est plus qu'un renvoi, chemin gardé, daté.
    assert.equal(caddy.match(/^v2\.amend\.ink \{/gm).length, 1)
    assert.match(bloc('v2.amend.ink'), /redir https:\/\/app\.amend\.ink\{uri\} permanent/)
    assert.doesNotMatch(bloc('v2.amend.ink'), /reverse_proxy/)
    assert.match(caddy, /jusqu'au 31\/12\/2026/)
    // Trois lignes de v2.env, et elles seules.
    assert.equal(
      env,
      ENV.replace('wss://v2.amend.ink/', 'wss://app.amend.ink/')
        .replace('V2_ORIGINES=https://v2.amend.ink', 'V2_ORIGINES=https://app.amend.ink')
        .replace('V2_ADRESSE=https://v2.amend.ink', 'V2_ADRESSE=https://app.amend.ink'),
    )
    // Relancé : rien ne change.
    const encore = m.lancer()
    assert.equal(encore.code, 0, encore.sortie)
    assert.deepEqual(m.lire(), { caddy, env })
    assert.match(encore.sortie, /1\/3 Caddy sert déjà[\s\S]*2\/3 la v2 est déjà[\s\S]*3\/3 v2\.amend\.ink renvoie déjà/)
  } finally {
    m.fermer()
  }
})

test('changement d’adresse : le retour en arrière remet les deux fichiers d’avant', () => {
  const m = monter()
  try {
    assert.equal(m.lancer('--retour').code, 1, 'rien à remettre avant le changement')
    m.lancer()
    const r = m.lancer('--retour')
    assert.equal(r.code, 0, r.sortie)
    assert.deepEqual(m.lire(), { caddy: CADDY, env: ENV })
  } finally {
    m.fermer()
  }
})

test('changement d’adresse : après le 31/12/2026, le renvoi se retire ; jamais le bloc qui sert l’application', () => {
  const m = monter()
  try {
    const avant = m.lancer('--retirer-ancienne')
    assert.equal(avant.code, 1, 'l’adresse n’a pas été changée : rien n’est retiré')
    assert.equal(m.lire().caddy, CADDY)
    m.lancer()
    const r = m.lancer('--retirer-ancienne')
    assert.equal(r.code, 0, r.sortie)
    const { caddy } = m.lire()
    assert.doesNotMatch(caddy, /^v2\.amend\.ink \{/m)
    assert.match(caddy, /^app\.amend\.ink \{/m)
    assert.match(caddy, /^www\.amend\.ink \{/m)
  } finally {
    m.fermer()
  }
})

test('changement d’adresse : un v2.env inattendu arrête tout avant de l’écrire ; une option inconnue aussi', () => {
  const m = monter(CADDY, ENV.replace('V2_ORIGINES=https://v2.amend.ink', 'V2_ORIGINES=https://autre.exemple'))
  try {
    const r = m.lancer()
    assert.equal(r.code, 1)
    assert.match(r.sortie, /V2_ORIGINES ne porte pas v2\.amend\.ink/)
    assert.match(m.lire().env, /V2_ADRESSE=https:\/\/v2\.amend\.ink/, 'v2.env n’est pas écrit')
    assert.equal(m.lancer('--nimporte').code, 1)
  } finally {
    m.fermer()
  }
})
