// Tests du registre des comptes (16/09/2026) — le nom affiché et la couleur
// quittent le localStorage du navigateur pour vivre sur le compte.
//
// Ce qui est vérifié : qu'on ne puisse pas nommer quelqu'un d'autre, que la
// couleur ne bouge plus une fois tirée (c'est elle qu'on lit d'un coup d'œil
// dans un document en suivi de modifications), et que `myName` reste à null
// tant que rien n'a été choisi — c'est la seule chose qui déclenche la
// modale côté client.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18791
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-users-'))
// `= ''` et non `delete` : `loadDotEnv` ne pose une variable que si elle est
// **absente** de l'environnement (`key in process.env`). Supprimer une clé
// la rend absente — et le .env de la machine de développement la remet
// aussitôt, avec sa vraie valeur. Un test « sans Mailgun » envoyait donc de
// vrais courriers, et un test « sans clé Anthropic » appelait l'API. La
// chaîne vide, elle, reste présente et vide. (Constaté le 17/09/2026.)
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
// Ceinture et bretelles : même si une clé passait, rien ne sort de la machine.
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = ''

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { Users, COULEURS, NOM_MAX } = await import('../users.js')
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

function cookieFor(email) {
  return sessionCookieHeader(email, { secure: false }).split(';')[0]
}

function definirNom(cookie, nom) {
  return fetch(`${BASE}/api/auth/name`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ nom }),
  })
}

async function creerDoc(cookie) {
  const res = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ title: 'Doc' }),
  })
  return res.json()
}

test('un compte sans nom renvoie null — c’est ce qui déclenche la modale', async () => {
  const cookie = cookieFor('alice@example.com')
  const doc = await creerDoc(cookie)

  const meta = await (await fetch(`${BASE}/api/docs/${doc.id}`, { headers: { cookie } })).json()
  assert.equal(meta.myName, null)
  assert.equal(meta.myColor, null)

  const moi = await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })).json()
  assert.equal(moi.nom, null)
})

test('le nom choisi revient avec le document, et une couleur avec lui', async () => {
  const cookie = cookieFor('bob@example.com')
  const doc = await creerDoc(cookie)

  const pose = await definirNom(cookie, '  Bob Dupont  ')
  assert.equal(pose.status, 200)
  const { nom, couleur } = await pose.json()
  assert.equal(nom, 'Bob Dupont') // espaces retirés
  assert.ok(COULEURS.includes(couleur))

  const meta = await (await fetch(`${BASE}/api/docs/${doc.id}`, { headers: { cookie } })).json()
  assert.equal(meta.myName, 'Bob Dupont')
  assert.equal(meta.myColor, couleur)

  const moi = await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })).json()
  assert.equal(moi.nom, 'Bob Dupont')
  assert.equal(moi.couleur, couleur)
})

test('la couleur ne bouge plus une fois tirée', async () => {
  const users = new Users(process.env.DATA_DIR)
  const premier = users.definirNom('carla@example.com', 'Carla')
  // Même après plusieurs renommages : c'est la stabilité de la couleur qui
  // rend une personne reconnaissable d'un appareil à l'autre.
  for (const nom of ['Carla B.', 'Carla Bernard', 'C. Bernard']) {
    const apres = users.definirNom('carla@example.com', nom)
    assert.equal(apres.couleur, premier.couleur)
    assert.equal(apres.createdAt, premier.createdAt)
    assert.equal(apres.nom, nom)
  }
})

test('on ne nomme que l’adresse de sa propre session', async () => {
  // Sans session : refusé.
  assert.equal((await definirNom(null, 'Intrus')).status, 401)

  // Avec une session, un « email » glissé dans le corps est ignoré : c'est
  // le cookie qui décide de qui on parle, jamais le client.
  const cookie = cookieFor('dan@example.com')
  const res = await fetch(`${BASE}/api/auth/name`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ nom: 'Dan', email: 'erin@example.com' }),
  })
  assert.equal(res.status, 200)

  const users = new Users(process.env.DATA_DIR)
  assert.equal(users.nomDe('dan@example.com'), 'Dan')
  assert.equal(users.nomDe('erin@example.com'), null)
})

test('un nom vide est refusé, un nom trop long est coupé', async () => {
  const cookie = cookieFor('fred@example.com')
  assert.equal((await definirNom(cookie, '   ')).status, 400)
  assert.equal((await definirNom(cookie, '')).status, 400)

  const long = 'x'.repeat(NOM_MAX + 50)
  const { nom } = await (await definirNom(cookie, long)).json()
  assert.equal(nom.length, NOM_MAX)
})

test('le registre est un fichier lisible — c’est là qu’on corrige une faute de frappe', () => {
  const chemin = join(process.env.DATA_DIR, 'users.json')
  assert.equal(existsSync(chemin), true)
  const registre = JSON.parse(readFileSync(chemin, 'utf8'))
  assert.equal(registre['bob@example.com'].nom, 'Bob Dupont')
  assert.ok(registre['bob@example.com'].createdAt > 0)
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
