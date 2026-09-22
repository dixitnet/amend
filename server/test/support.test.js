// La palette de contact (17/09/2026).
//
// Ce qui compte ici n'est pas « est-ce que le formulaire part » mais les
// trois partis pris qui le rendent utile : un signalement arrive avec son
// contexte, il n'emporte jamais rien du document, et il survit à une panne
// de Mailgun — sans quoi le seul canal de retour de la phase de test
// dépendrait du seul service dont la panne serait justement à signaler.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, existsSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18799
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-support-'))
// `= ''` et non `delete` : `loadDotEnv` ne pose une variable que si elle est
// **absente** de l'environnement (`key in process.env`). Supprimer une clé
// la rend absente — et le .env de la machine de développement la remet
// aussitôt, avec sa vraie valeur. Un test « sans Mailgun » envoyait donc de
// vrais courriers, et un test « sans clé Anthropic » appelait l'API. La
// chaîne vide, elle, reste présente et vide. (Constaté le 17/09/2026.)
process.env.ANTHROPIC_API_KEY = ''
// Volontairement absent : on vérifie justement que le message est conservé
// quand le courrier ne peut pas partir.
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
// Ceinture et bretelles : même si une clé passait, rien ne sort de la machine.
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = 'admin@example.com'

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
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

const envoyer = (c, corps) =>
  fetch(`${BASE}/api/support`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) },
    body: JSON.stringify(corps),
  })

const journal = () => {
  const f = join(process.env.DATA_DIR, 'events-support.jsonl')
  if (!existsSync(f)) return []
  return readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

test('il faut une session pour écrire', async () => {
  assert.equal((await envoyer(null, { intention: 'bug', message: 'x' })).status, 401)
})

test('le message est conservé même quand le courrier ne part pas', async () => {
  // Mailgun n'est pas configuré dans ce test : l'envoi échoue. La réponse
  // reste 200 — le message n'est pas perdu — et le dit.
  const res = await envoyer(cookie('temoin@example.com'), {
    intention: 'bug',
    message: 'Le bouton ne répond pas',
    contexte: { docId: 'abc123', role: 'correcteur', navigateur: 'Firefox/142', erreurs: ['TypeError: x'] },
  })
  assert.equal(res.status, 200)
  const corps = await res.json()
  assert.equal(corps.ok, true)
  assert.equal(corps.mail, false, 'le client doit savoir que le courrier n’est pas parti')

  const dernier = journal().slice(-1)[0]
  assert.equal(dernier.email, 'temoin@example.com')
  assert.equal(dernier.message, 'Le bouton ne répond pas')
  assert.equal(dernier.docId, 'abc123')
  assert.equal(dernier.role, 'correcteur')
  assert.deepEqual(dernier.erreurs, ['TypeError: x'])
})

test('rien d’autre que les champs prévus n’est enregistré', async () => {
  // La garantie faite à l'utilisateur — « le contenu de vos documents,
  // jamais » — tient à ceci : le serveur lit une liste fermée de champs.
  await envoyer(cookie('temoin@example.com'), {
    intention: 'idee',
    message: 'Une idée',
    contexte: {
      docId: 'abc123',
      contenuDuDocument: 'texte confidentiel',
      titre: 'Mon document secret',
    },
    contenuDuDocument: 'texte confidentiel',
  })
  const dernier = journal().slice(-1)[0]
  const brut = JSON.stringify(dernier)
  assert.ok(!brut.includes('confidentiel'), 'un champ non prévu a été recopié tel quel')
  assert.ok(!brut.includes('secret'))
  assert.deepEqual(
    Object.keys(dernier).sort(),
    // `id` depuis le 22/09/2026 : c'est lui que vise le bouton « Traiter ».
    // Ce test a fait exactement son travail en le signalant — la liste des
    // champs enregistrés est fermée, et tout ajout doit être délibéré.
    ['docId', 'ecran', 'email', 'erreurs', 'id', 'intention', 'message', 'navigateur', 'role', 'ts', 'version'].sort()
  )
})

test('une intention inconnue ou un message vide sont refusés', async () => {
  const c = cookie('temoin@example.com')
  assert.equal((await envoyer(c, { intention: 'autre', message: 'x' })).status, 400)
  assert.equal((await envoyer(c, { intention: 'bug', message: '   ' })).status, 400)
})

test('un identifiant de document fantaisiste est ignoré, pas recopié', async () => {
  await envoyer(cookie('temoin@example.com'), {
    intention: 'question',
    message: 'Bonjour',
    contexte: { docId: '../../etc/passwd' },
  })
  assert.equal(journal().slice(-1)[0].docId, null)
})

test('cinq messages par heure, puis on attend', async () => {
  const c = cookie('bavard@example.com')
  for (let i = 0; i < 5; i++) {
    assert.equal((await envoyer(c, { intention: 'question', message: `message ${i}` })).status, 200)
  }
  assert.equal((await envoyer(c, { intention: 'question', message: 'de trop' })).status, 429)
  // La limite est par compte, pas globale.
  assert.equal((await envoyer(cookie('autre@example.com'), { intention: 'question', message: 'ok' })).status, 200)
})

test('le back-office voit les retours', async () => {
  const res = await fetch(`${BASE}/api/admin/overview`, { headers: { cookie: cookie('admin@example.com') } })
  const d = await res.json()
  assert.ok(d.flux.support.recus7j >= 1)
  assert.ok(d.flux.support.aTraiter.length >= 1)
  assert.equal(
    d.flux.support.aTraiter[0].ts >= d.flux.support.aTraiter.slice(-1)[0].ts,
    true,
    'le plus récent en tête'
  )
  assert.ok(d.flux.support.aTraiter[0].cle, 'chaque retour porte la clé qui permet de le traiter')
})

// ============================================ marquer un retour traité

const apercu = async (email = 'admin@example.com') =>
  (await fetch(`${BASE}/api/admin/overview`, { headers: { cookie: cookie(email) } })).json()

const traiter = (cle, traite, email = 'admin@example.com') =>
  fetch(`${BASE}/api/admin/support/${encodeURIComponent(cle)}/traite`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookie(email) },
    body: JSON.stringify({ traite }),
  })

test('un retour traité quitte la liste à traiter, sans quitter le fichier', async () => {
  // La garantie qui justifie « traiter » plutôt que « supprimer » : rien de
  // ce qu'une personne a signalé n'est effacé. Un bug revient parfois trois
  // semaines plus tard.
  const avant = await apercu()
  const cible = avant.flux.support.aTraiter[0]
  const lignesAvant = journal().length

  assert.equal((await traiter(cible.cle, true)).status, 200)

  const apres = await apercu()
  assert.ok(!apres.flux.support.aTraiter.some((r) => r.cle === cible.cle), 'il sort de la liste')
  const range = apres.flux.support.traites.find((r) => r.cle === cible.cle)
  assert.ok(range, 'et se retrouve parmi les traités')
  assert.equal(range.message, cible.message, 'avec son message intact')
  assert.equal(range.traite.par, 'admin@example.com', 'on sait qui l’a traité')
  assert.equal(journal().length, lignesAvant, 'le journal reste en ajout seul, rien n’y est retiré')
  assert.equal(apres.flux.support.recus30j, avant.flux.support.recus30j, 'et le compte ne bouge pas')
})

test('on peut rouvrir un retour classé trop vite', async () => {
  const cible = (await apercu()).flux.support.traites[0]
  assert.equal((await traiter(cible.cle, false)).status, 200)
  const apres = await apercu()
  assert.ok(apres.flux.support.aTraiter.some((r) => r.cle === cible.cle), 'il revient à traiter')
  assert.ok(!apres.flux.support.traites.some((r) => r.cle === cible.cle))
})

test('seul un administrateur peut traiter', async () => {
  const cible = (await apercu()).flux.support.aTraiter[0]
  const res = await fetch(`${BASE}/api/admin/support/${encodeURIComponent(cible.cle)}/traite`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookie('quidam@example.com') },
    body: JSON.stringify({ traite: true }),
  })
  assert.equal(res.status, 403)
  // Et la décision est bien côté serveur : le retour n'a pas bougé.
  assert.ok((await apercu()).flux.support.aTraiter.some((r) => r.cle === cible.cle))
})

test('sans session, c’est refusé aussi', async () => {
  const cible = (await apercu()).flux.support.aTraiter[0]
  const res = await fetch(`${BASE}/api/admin/support/${encodeURIComponent(cible.cle)}/traite`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ traite: true }),
  })
  assert.equal(res.status, 403)
})

test('une clé inventée est refusée — la table ne se remplit pas de fantômes', async () => {
  assert.equal((await traiter('s-inexistant-000000', true)).status, 404)
})

test('un retour reçu avant l’ajout des identifiants se traite par son horodatage', async () => {
  // Les entrées écrites avant le 22/09/2026 n'ont pas de champ `id`. Elles
  // doivent rester traitables, sans quoi la fonction n'arriverait que pour
  // les retours à venir.
  const f = join(process.env.DATA_DIR, 'events-support.jsonl')
  const ancien = { ts: Date.now() - 2 * 24 * 3600 * 1000, email: 'ancien@example.com', intention: 'bug', message: 'reçu avant' }
  appendFileSync(f, JSON.stringify(ancien) + '\n', 'utf8')

  const vue = await apercu()
  const cible = vue.flux.support.aTraiter.find((r) => r.message === 'reçu avant')
  assert.ok(cible, 'le retour ancien est bien listé')
  assert.equal(cible.cle, String(ancien.ts), 'son horodatage lui sert de clé')
  assert.equal((await traiter(cible.cle, true)).status, 200)
  assert.ok((await apercu()).flux.support.traites.some((r) => r.cle === String(ancien.ts)))
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
