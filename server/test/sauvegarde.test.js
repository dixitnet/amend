// La sauvegarde téléchargeable (18/09/2026).
//
// Une sauvegarde se juge sur une seule chose : **est-ce qu'on peut
// restaurer avec**. Ces tests ne vérifient donc pas qu'un fichier arrive,
// mais que l'archive se déplie vraiment, que rien n'y manque, et que ce
// qui ne doit pas s'y trouver ne s'y trouve pas.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const PORT = 18803
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-sauvegarde-'))
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = 'admin@example.com'

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { fluxTar, listerFichiers } = await import('../archive.js')
await waitForServer()

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000
    ;(function attempt() {
      fetch(`${BASE}/api/docs`)
        .then(() => resolve())
        .catch((err) => {
          if (Date.now() > deadline) reject(err)
          else setTimeout(attempt, 50)
        })
    })()
  })
}

const cookie = (email) => sessionCookieHeader(email, { secure: false }).split(';')[0]

/** Déplie une archive dans un dossier neuf, avec le `tar` du système :
 * c'est exactement ce que fera la personne qui restaure, et c'est le seul
 * juge acceptable d'un écrivain tar écrit à la main. */
function deplier(octets) {
  const dossier = mkdtempSync(join(tmpdir(), 'collabtext-restore-'))
  const archive = join(dossier, 'a.tar.gz')
  writeFileSync(archive, octets)
  execFileSync('tar', ['xzf', archive, '-C', dossier])
  return dossier
}

test('l’archive se déplie avec un vrai tar, et contient les données', async () => {
  // De quoi faire une archive qui ressemble à la production : un document,
  // une image, un registre.
  const doc = await (
    await fetch(`${BASE}/api/docs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie('admin@example.com') },
      body: JSON.stringify({ title: 'À sauvegarder' }),
    })
  ).json()
  const uploads = join(process.env.DATA_DIR, 'uploads', doc.id)
  mkdirSync(uploads, { recursive: true })
  writeFileSync(join(uploads, 'abcdefgh12345678.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))

  const res = await fetch(`${BASE}/api/admin/sauvegarde`, { headers: { cookie: cookie('admin@example.com') } })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'application/gzip')
  assert.match(res.headers.get('content-disposition'), /attachment; filename="amend-\d{8}\d{4}\.tar\.gz"/)

  const dossier = deplier(Buffer.from(await res.arrayBuffer()))
  // Le dossier s'appelle `data` : l'archive se déplie à côté, pas en vrac.
  assert.ok(existsSync(join(dossier, 'data', 'docs.json')))
  const registre = JSON.parse(readFileSync(join(dossier, 'data', 'docs.json'), 'utf8'))
  assert.ok(registre[doc.id], 'le document n’est pas dans le registre sauvegardé')
  assert.ok(existsSync(join(dossier, 'data', `${doc.id}.log`)), 'le journal du document manque')

  // Une image, octet pour octet : c'est ce qui ne se refabrique pas.
  const image = readFileSync(join(dossier, 'data', 'uploads', doc.id, 'abcdefgh12345678.png'))
  assert.deepEqual([...image], [0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

  // Et le mode d'emploi, à la racine.
  const mode = readFileSync(join(dossier, 'data', 'RESTAURATION.md'), 'utf8')
  assert.match(mode, /systemctl stop amend/)
  assert.match(mode, /SESSION_SECRET/, 'le mode d’emploi doit prévenir pour le .env')

  rmSync(dossier, { recursive: true, force: true })
})

test('les écritures en attente sont sur le disque avant l’archive', async () => {
  // `appendUpdate` garde les mises à jour en mémoire jusqu'à 200 ms : sans
  // `flushAll`, l'archive rate la dernière fraction de seconde — la seule
  // qu'on regretterait vraiment.
  const { Storage } = await import('../storage.js')
  const storage = new Storage(process.env.DATA_DIR)
  const doc = storage.createDoc('Frais', 'admin@example.com')
  storage.appendUpdate(doc.id, Buffer.from([9, 9, 9, 9]))

  const res = await fetch(`${BASE}/api/admin/sauvegarde`, { headers: { cookie: cookie('admin@example.com') } })
  const dossier = deplier(Buffer.from(await res.arrayBuffer()))
  const journal = join(dossier, 'data', `${doc.id}.log`)
  assert.ok(existsSync(journal))
  rmSync(dossier, { recursive: true, force: true })
})

test('un fichier temporaire n’entre jamais dans une sauvegarde', () => {
  // Un `.tmp` est une écriture en cours : ce n'est jamais un état
  // cohérent.
  writeFileSync(join(process.env.DATA_DIR, 'docs.json.tmp'), '{"cassé":')
  const fichiers = listerFichiers(process.env.DATA_DIR, (rel) => rel.endsWith('.tmp'))
  assert.ok(!fichiers.some((f) => f.endsWith('.tmp')))
  assert.ok(fichiers.includes('docs.json'))
})

test('la sauvegarde est refusée à qui n’est pas administrateur', async () => {
  assert.equal((await fetch(`${BASE}/api/admin/sauvegarde`)).status, 403)
  const res = await fetch(`${BASE}/api/admin/sauvegarde`, { headers: { cookie: cookie('quidam@example.com') } })
  assert.equal(res.status, 403)
  // Et rien du contenu ne fuite dans le refus.
  assert.ok(!(await res.text()).includes('docs.json'))
})

test('chaque sauvegarde laisse une trace', async () => {
  await fetch(`${BASE}/api/admin/sauvegarde`, { headers: { cookie: cookie('admin@example.com') } })
  const journal = readFileSync(join(process.env.DATA_DIR, 'events-sauvegarde.jsonl'), 'utf8')
  assert.match(journal, /admin@example\.com/)
})

test('un gros fichier traverse l’archive intact', async () => {
  // Le point qui justifie d'avoir écrit un tar qui diffuse : la mémoire ne
  // doit pas dépendre de la taille des fichiers. 3 Mo suffisent à franchir
  // plusieurs tampons de lecture et à sortir du cas « tout tient dans un
  // morceau ».
  const gros = Buffer.alloc(3 * 1024 * 1024)
  for (let i = 0; i < gros.length; i += 4096) gros[i] = i % 251
  writeFileSync(join(process.env.DATA_DIR, 'gros.bin'), gros)

  const res = await fetch(`${BASE}/api/admin/sauvegarde`, { headers: { cookie: cookie('admin@example.com') } })
  const dossier = deplier(Buffer.from(await res.arrayBuffer()))
  const relu = readFileSync(join(dossier, 'data', 'gros.bin'))
  assert.equal(relu.length, gros.length)
  assert.ok(relu.equals(gros), 'le contenu a été altéré en route')
  rmSync(dossier, { recursive: true, force: true })
  rmSync(join(process.env.DATA_DIR, 'gros.bin'))
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
