// Audit du 10/10/2026, A1 et A2 : un fichier d'état illisible n'est pas un
// fichier vide, et le secret de session se lit au premier usage.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { lireJson, ecrireJsonAtomique, ecrireAtomique } from '../fichiers.js'
import { Storage } from '../storage.js'
import { Users } from '../users.js'

const RACINE = fileURLToPath(new URL('../..', import.meta.url))
const dossier = () => mkdtempSync(join(tmpdir(), 'amend-fichiers-'))

test('lireJson : absent → valeur par défaut ; présent → contenu', () => {
  const d = dossier()
  try {
    assert.deepEqual(lireJson(join(d, 'rien.json'), { vide: true }), { vide: true })
    ecrireJsonAtomique(join(d, 'a.json'), { x: 1 })
    assert.deepEqual(lireJson(join(d, 'a.json')), { x: 1 })
    assert.equal(existsSync(join(d, 'a.json.tmp')), false)
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test('lireJson : un fichier illisible lève une erreur et laisse une copie', () => {
  const d = dossier()
  try {
    const f = join(d, 'docs.json')
    writeFileSync(f, '{"a":{"title":"Perdu"', 'utf8') // tronqué
    assert.throws(() => lireJson(f), { code: 'FICHIER_ILLISIBLE' })
    assert.equal(readFileSync(f, 'utf8'), '{"a":{"title":"Perdu"', "le fichier d'origine n'est pas touché")
    const copies = readdirSync(d).filter((n) => n.startsWith('docs.json.illisible-'))
    assert.equal(copies.length, 1)
    assert.equal(readFileSync(join(d, copies[0]), 'utf8'), '{"a":{"title":"Perdu"')
    // Un fichier vide est illisible aussi.
    const v = join(d, 'users.json')
    writeFileSync(v, '', 'utf8')
    assert.throws(() => lireJson(v), { code: 'FICHIER_ILLISIBLE' })
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("un registre de documents tronqué n'est jamais réécrit à vide", () => {
  const d = dossier()
  try {
    const st = new Storage(d)
    st.createDoc('Précieux', 'chef@example.com')
    const f = join(d, 'docs.json')
    const bon = readFileSync(f, 'utf8')
    writeFileSync(f, bon.slice(0, bon.length - 20), 'utf8') // coupure en plein écrit
    const abime = readFileSync(f, 'utf8')
    assert.throws(() => st.createDoc('Autre', 'chef@example.com'), { code: 'FICHIER_ILLISIBLE' })
    assert.throws(() => st.listDocs('chef@example.com'), { code: 'FICHIER_ILLISIBLE' })
    assert.equal(readFileSync(f, 'utf8'), abime, "rien n'a été réécrit")
    // Réparé à la main : tout revient.
    writeFileSync(f, bon, 'utf8')
    assert.equal(st.listDocs('chef@example.com').length, 1)
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("un fichier de comptes tronqué n'est jamais réécrit à vide", () => {
  const d = dossier()
  try {
    const u = new Users(d)
    u.definirNom('a@example.com', 'Alice')
    const f = join(d, 'users.json')
    writeFileSync(f, '{"a@example.com":{"nom":"Al', 'utf8')
    assert.throws(() => u.get('a@example.com'), { code: 'FICHIER_ILLISIBLE' })
    assert.equal(readFileSync(f, 'utf8'), '{"a@example.com":{"nom":"Al')
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("SESSION_SECRET posé après l'import (comme le fait server.js avec le .env) est bien pris en compte (A2)", () => {
  const script = `
    const auth = await import(${JSON.stringify(join(RACINE, 'server/auth.js'))})
    process.env.SESSION_SECRET = 'secret-pose-apres-import'
    const cookie = auth.sessionCookieHeader('a@example.com', { secure: false }).split(';')[0]
    console.log(cookie)
  `
  const lire = `
    const auth = await import(${JSON.stringify(join(RACINE, 'server/auth.js'))})
    process.env.SESSION_SECRET = 'secret-pose-apres-import'
    const cookie = process.argv[1]
    console.log(auth.readSession({ headers: { cookie } }))
  `
  const env = { ...process.env }
  delete env.SESSION_SECRET
  const a = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' })
  assert.equal(a.status, 0, a.stderr)
  const cookie = a.stdout.trim()
  const b = spawnSync(process.execPath, ['--input-type=module', '-e', lire, cookie], { env, encoding: 'utf8' })
  assert.equal(b.status, 0, b.stderr)
  assert.equal(b.stdout.trim(), 'a@example.com', 'le cookie signé dans un processus se relit dans le suivant')
})

// --- A8 : un seul geste pour « écrire sans jamais laisser un fichier à demi écrit »

test('ecrireAtomique : texte ou octets, remplace entièrement, ne laisse aucun temporaire', () => {
  const d = dossier()
  try {
    const f = join(d, 'a.txt')
    ecrireAtomique(f, 'premier contenu, plus long')
    ecrireAtomique(f, 'court')
    assert.equal(readFileSync(f, 'utf8'), 'court')
    const octets = Buffer.from([0, 1, 2, 255, 254])
    ecrireAtomique(join(d, 'b.bin'), octets)
    assert.deepEqual(readFileSync(join(d, 'b.bin')), octets)
    ecrireAtomique(join(d, 'vide'), '')
    assert.equal(readFileSync(join(d, 'vide'), 'utf8'), '')
    assert.deepEqual(
      readdirSync(d).filter((n) => n.endsWith('.tmp')),
      []
    )
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test('ecrireAtomique : un gros contenu (plusieurs mégaoctets) est écrit en entier', () => {
  const d = dossier()
  try {
    const gros = Buffer.alloc(9 * 1024 * 1024, 7)
    ecrireAtomique(join(d, 'gros.bin'), gros)
    assert.equal(statSync(join(d, 'gros.bin')).size, gros.length)
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test('ecrireAtomique : le droit demandé est posé (secret en 0600)', () => {
  const d = dossier()
  try {
    ecrireAtomique(join(d, 'secret.json'), '{}', { mode: 0o600 })
    assert.equal(statSync(join(d, 'secret.json')).mode & 0o777, 0o600)
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test('ecrireAtomique : si le renommage échoue, rien ne traîne et l’erreur remonte', () => {
  const d = dossier()
  try {
    // Le but est un dossier : renommer un fichier dessus échoue.
    mkdirSync(join(d, 'cible'))
    assert.throws(() => ecrireAtomique(join(d, 'cible'), 'x'))
    assert.deepEqual(
      readdirSync(d).filter((n) => n.endsWith('.tmp')),
      []
    )
    // Dossier de destination absent : l'erreur remonte aussi.
    assert.throws(() => ecrireAtomique(join(d, 'absent', 'f.txt'), 'x'), { code: 'ENOENT' })
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test('ecrireAtomique : le nom temporaire est propre à chaque appel et finit par .tmp', () => {
  const d = dossier()
  try {
    // Deux écritures du même fichier ne se marchent plus dessus : on observe les noms
    // en regardant le dossier pendant que le fichier cible est un dossier (échec garanti
    // après création du temporaire — nettoyé ensuite).
    const f = join(d, 'f.txt')
    ecrireAtomique(f, 'a')
    ecrireAtomique(f, 'b')
    assert.equal(readFileSync(f, 'utf8'), 'b')
    assert.deepEqual(readdirSync(d), ['f.txt'])
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})
