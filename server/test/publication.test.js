// « Publier sur le web » (17/09/2026) — la première surface d'Amend
// lisible sans session, donc celle qui mérite le plus de tests.
//
// Ce qui est vérifié ici tient en trois questions : est-ce que quelque
// chose d'arbitraire peut entrer dans une page publique, est-ce que la
// page révèle ce qu'elle ne doit pas, et est-ce que le droit de publier
// est bien celui qu'annonce le .env.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18801
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-pub-'))
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = 'admin@example.com'
process.env.PUBLICATION_WEB = 'admins'
// Sans ça, le .env de la machine de développement impose son APP_BASE_URL
// (port 8787) et les adresses publiques renvoyées pointeraient vers le
// serveur de développement, pas vers celui du test.
process.env.APP_BASE_URL = `http://localhost:${PORT}`

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { Storage } = await import('../storage.js')
const { rendre, peutPublier, nomDePage, NOM_PAGE } = await import('../publication.js')
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

async function creerDoc(c, titre = 'Doc') {
  const res = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: c },
    body: JSON.stringify({ title: titre }),
  })
  return res.json()
}

const publier = (c, id, corps) =>
  fetch(`${BASE}/api/docs/${id}/publication`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: c },
    body: JSON.stringify(corps),
  })

const texte = (blocs) => [{ type: 'paragraphe', contenu: [{ type: 'texte', texte: blocs, marques: [] }] }]

// ============================================== ce qui peut entrer dans la page

test('rien d’arbitraire ne traverse : ni balise, ni type inconnu', () => {
  const html = rendre({
    titre: '<script>alert(1)</script>',
    blocs: [
      { type: 'paragraphe', contenu: [{ type: 'texte', texte: '<img onerror=alert(1)>', marques: [] }] },
      // Un type que le serveur ne connaît pas ne produit rien — c'est ce
      // qui rend le modèle réellement fermé.
      { type: 'html', html: '<script>alert(2)</script>' },
      { type: 'paragraphe', contenu: [{ type: 'texte', texte: 'ok', marques: ['strong', 'inventee'] }] },
    ],
  })
  assert.ok(!html.includes('<script>'), 'une balise script a traversé')
  // Le texte échappé contient encore le *mot* « onerror » — c'est normal et
  // sans danger : ce qui compte est qu'il ne soit pas devenu une balise.
  assert.ok(!/<img[^>]*onerror/i.test(html), 'un attribut d’évènement a traversé')
  assert.ok(html.includes('&lt;img onerror'), 'le texte doit être échappé, pas supprimé')
  assert.ok(html.includes('&lt;script&gt;'), 'le titre doit être échappé, pas supprimé')
  assert.ok(html.includes('<strong>ok</strong>'), 'les marques prévues doivent passer')
  assert.ok(!html.includes('inventee'))
})

test('les marques de suivi ne figurent pas sur une page publiée', () => {
  // Le client ne les envoie pas ; le serveur ne saurait pas les rendre non
  // plus. Double fond volontaire : personne n'a à lire les ratures de
  // l'auteur sur une page publique.
  const html = rendre({
    titre: 'T',
    blocs: [{ type: 'paragraphe', contenu: [{ type: 'texte', texte: 'texte', marques: ['deletion', 'insertion'] }] }],
  })
  assert.ok(!/<(del|ins|s)>/.test(html))
  assert.ok(html.includes('texte'))
})

test('les notes : numérotées par le serveur, en fin de page, échappées, jamais imbriquées', () => {
  const html = rendre({
    titre: 'T',
    blocs: [
      {
        type: 'paragraphe',
        contenu: [
          { type: 'texte', texte: 'Un', marques: [] },
          {
            type: 'note',
            contenu: [
              { type: 'texte', texte: 'Première <b>note</b>', marques: ['em'] },
              { type: 'note', contenu: [{ type: 'texte', texte: 'imbriquée', marques: [] }] },
            ],
          },
          { type: 'note', contenu: [{ type: 'texte', texte: 'Seconde', marques: [] }] },
        ],
      },
    ],
  })
  assert.match(html, /<sup class="note-appel" id="appel-1"><a href="#note-1">1<\/a><\/sup>/)
  assert.match(html, /id="appel-2"/)
  assert.match(html, /<li id="note-1"><em>Première &lt;b&gt;note&lt;\/b&gt;<\/em> <a href="#appel-1"/)
  assert.match(html, /<li id="note-2">Seconde /)
  assert.doesNotMatch(html, /imbriquée/)
  assert.doesNotMatch(html, /<b>/)
  // Un rendu sans note n'a pas de section Notes.
  assert.doesNotMatch(rendre({ titre: 'T', blocs: [{ type: 'paragraphe', contenu: [] }] }), /class="notes"/)
})

test('une image ne peut désigner qu’un fichier du document', () => {
  const html = rendre({
    titre: 'T',
    blocs: [
      { type: 'image', nom: '../../../etc/passwd' },
      { type: 'image', nom: 'https://ailleurs.example/pixel.png' },
      { type: 'image', nom: 'abcdefgh12345678.png' },
    ],
  })
  assert.ok(!html.includes('passwd'))
  assert.ok(!html.includes('ailleurs.example'))
  assert.ok(html.includes('src="images/abcdefgh12345678.png"'))
})

test('la page ne charge rien de l’extérieur et demande à ne pas être indexée', () => {
  const html = rendre({ titre: 'T', blocs: texte('bonjour') })
  assert.ok(!/<script/i.test(html), 'aucun script dans une page publiée')
  assert.ok(!/https?:\/\//.test(html.replace(/<html lang="fr">/, '')), 'aucune ressource extérieure')
  assert.ok(html.includes('name="robots" content="noindex"'))
})

// ============================================================ le plan latéral (10/10/2026)

const titre = (niveau, t) => ({
  type: 'titre',
  niveau,
  contenu: t == null ? [] : [{ type: 'texte', texte: t, marques: [] }],
})
const para = (t) => ({ type: 'paragraphe', contenu: [{ type: 'texte', texte: t, marques: [] }] })
const entreesDuPlan = (html) =>
  [...html.matchAll(/<nav class="plan-lateral"[\s\S]*?<\/nav>/g)].flatMap((nav) =>
    [...nav[0].matchAll(/<li class="niveau-(\d)"><a href="#(titre-\d+)">([^<]*)<\/a><\/li>/g)].map((m) => ({
      niveau: Number(m[1]),
      ancre: m[2],
      texte: m[3],
    }))
  )

test('le plan reprend les titres du texte, dans l’ordre, chacun lié à une ancre qui existe', () => {
  const html = rendre({
    titre: 'T',
    blocs: [titre(1, 'Premier'), para('a'), titre(2, 'Sous-partie'), para('b'), titre(3, 'Détail'), titre(1, 'Second')],
  })
  const plan = entreesDuPlan(html)
  assert.deepEqual(
    plan.map((e) => [e.niveau, e.texte]),
    [
      [1, 'Premier'],
      [2, 'Sous-partie'],
      [3, 'Détail'],
      [1, 'Second'],
    ]
  )
  for (const e of plan) assert.ok(html.includes(`id="${e.ancre}">`), `l’ancre ${e.ancre} existe dans le texte`)
  assert.ok(
    html.indexOf('id="titre-1">Premier') < html.indexOf('id="titre-4">Second'),
    'les ancres suivent l’ordre du texte'
  )
})

test('le plan suit les règles de l’éditeur : titre vide nommé, niveaux au-delà du dernier ramenés à lui', () => {
  const html = rendre({ titre: 'T', blocs: [titre(1, 'A'), titre(2, null), titre(5, 'Très profond')] })
  const plan = entreesDuPlan(html)
  assert.equal(plan[1].texte, '(sans titre)')
  assert.equal(plan[2].niveau, 3, 'un h5 d’un ancien document se range au dernier niveau du plan')
  assert.ok(html.includes('<h5 id="titre-3">'), 'le titre garde sa balise dans le texte')
})

test('un titre dans une citation compte aussi, et le texte du plan est échappé', () => {
  const html = rendre({
    titre: 'T',
    blocs: [titre(1, 'Avant'), { type: 'citation', blocs: [titre(2, '<img src=x onerror=alert(1)>')] }],
  })
  const plan = entreesDuPlan(html)
  assert.equal(plan.length, 2)
  assert.equal(plan[1].texte, '&lt;img src=x onerror=alert(1)&gt;')
  assert.ok(!/<img src=x/.test(html))
})

test('les marques et les notes d’un titre ne passent pas dans le plan', () => {
  const html = rendre({
    titre: 'T',
    blocs: [
      titre(1, 'Un'),
      {
        type: 'titre',
        niveau: 2,
        contenu: [
          { type: 'texte', texte: 'Gras', marques: ['strong'] },
          { type: 'note', contenu: [{ type: 'texte', texte: 'secrète', marques: [] }] },
        ],
      },
    ],
  })
  const plan = entreesDuPlan(html)
  assert.equal(plan[1].texte, 'Gras')
  assert.ok(!entreesDuPlan(html).some((e) => /secr/.test(e.texte)))
})

test('un seul titre, ou aucun : pas de plan', () => {
  for (const blocs of [texte('rien'), [titre(1, 'Seul'), para('x')]]) {
    const html = rendre({ titre: 'T', blocs })
    assert.ok(!html.includes('<nav class="plan-lateral"') && !html.includes('<nav class="plan-haut"'))
    assert.ok(html.includes('<div class="page">'), 'la page garde sa mise en page simple')
  }
})

test('le plan est servi deux fois, pour la colonne et pour le repli, et la page reste sans script', () => {
  const html = rendre({ titre: 'T', blocs: [titre(1, 'A'), titre(2, 'B')] })
  assert.equal((html.match(/<nav class="plan-lateral"/g) || []).length, 1)
  assert.equal((html.match(/<nav class="plan-haut"/g) || []).length, 1)
  assert.ok(html.includes('<details><summary>Plan du document</summary>'))
  assert.ok(!/<script/i.test(html) && !/https?:\/\//.test(html.replace(/<html lang="fr">/, '')))
  assert.match(html, /@media print \{ \.plan-lateral, \.plan-haut \{ display: none/)
})

test('l’éditeur et la page publiée partagent les règles du plan', async () => {
  const { niveauDuPlan, intituleDuPlan, TITRES_MIN_POUR_UN_PLAN_PUBLIE } = await import('../../shared/plan.js')
  assert.equal(niveauDuPlan(0), 1)
  assert.equal(niveauDuPlan(9), niveauDuPlan(3))
  assert.equal(intituleDuPlan('  \n '), '(sans titre)')
  assert.equal(intituleDuPlan(' Un   titre '), 'Un titre')
  assert.equal(TITRES_MIN_POUR_UN_PLAN_PUBLIE, 2)
})

// ============================================================ le droit de publier

test('la portée du .env décide, et un correcteur ne publie jamais', () => {
  process.env.PUBLICATION_WEB = 'admins'
  assert.equal(peutPublier({ admin: true }), true)
  assert.equal(peutPublier({ admin: false, proprietaire: true, role: 'editeur' }), false)

  process.env.PUBLICATION_WEB = 'proprietaires'
  assert.equal(peutPublier({ admin: false, proprietaire: true, role: 'editeur' }), true)
  assert.equal(peutPublier({ admin: false, proprietaire: false, role: 'editeur' }), false)

  process.env.PUBLICATION_WEB = 'editeurs'
  assert.equal(peutPublier({ admin: false, proprietaire: false, role: 'editeur' }), true)
  assert.equal(peutPublier({ admin: false, proprietaire: false, role: 'correcteur' }), false)

  // Une valeur inconnue retombe sur la plus restrictive, jamais l'inverse.
  process.env.PUBLICATION_WEB = 'tout-le-monde'
  assert.equal(peutPublier({ admin: false, proprietaire: true, role: 'editeur' }), false)
  process.env.PUBLICATION_WEB = 'admins'
})

test('en phase de test, seul un administrateur publie', async () => {
  const proprio = cookie('proprio@example.com')
  const doc = await creerDoc(proprio)
  assert.equal((await publier(proprio, doc.id, { titre: 'X', blocs: texte('a') })).status, 403)

  const storage = new Storage(process.env.DATA_DIR)
  storage.inviteEmail(doc.id, 'admin@example.com', 'editeur', 'proprio@example.com')
  storage.acceptInvitation(doc.id, 'admin@example.com')
  assert.equal((await publier(cookie('admin@example.com'), doc.id, { titre: 'X', blocs: texte('a') })).status, 200)
})

test('sans accès au document, on ne voit même pas son état de publication', async () => {
  const doc = await creerDoc(cookie('proprio@example.com'))
  assert.equal((await fetch(`${BASE}/api/docs/${doc.id}/publication`)).status, 403)
  const res = await fetch(`${BASE}/api/docs/${doc.id}/publication`, {
    headers: { cookie: cookie('quidam@example.com') },
  })
  assert.equal(res.status, 403)
})

// ================================================== la page, une fois publiée

test('la page se lit sans session, et son adresse ne dit pas le document', async () => {
  const admin = cookie('admin@example.com')
  const doc = await creerDoc(admin, 'Mon document')
  const r = await (await publier(admin, doc.id, { titre: 'Mon document', blocs: texte('Bonjour le web') })).json()

  assert.ok(r.url.includes('/p/'))
  assert.match(r.url.split('/p/')[1], NOM_PAGE, 'l’adresse publique doit être un nom de trois mots')
  assert.ok(!r.url.includes(doc.id), 'l’adresse publique ne doit pas révéler l’identifiant du document')

  // Sans le moindre cookie.
  const page = await fetch(r.url)
  assert.equal(page.status, 200)
  assert.match(page.headers.get('content-type'), /text\/html/)
  assert.ok(page.headers.get('content-security-policy').includes("default-src 'none'"))
  const html = await page.text()
  assert.ok(html.includes('Bonjour le web'))
  assert.ok(html.includes('Mon document'))
})

test('republier garde la même adresse', async () => {
  const admin = cookie('admin@example.com')
  const doc = await creerDoc(admin, 'Doc')
  const un = await (await publier(admin, doc.id, { titre: 'Doc', blocs: texte('version 1') })).json()
  const deux = await (await publier(admin, doc.id, { titre: 'Doc', blocs: texte('version 2') })).json()
  assert.equal(deux.url, un.url, 'un lien déjà envoyé ne doit pas cesser de marcher')
  assert.ok((await (await fetch(un.url)).text()).includes('version 2'))
})

test('retirer la page la fait disparaître pour de bon', async () => {
  const admin = cookie('admin@example.com')
  const doc = await creerDoc(admin, 'Doc')
  const r = await (await publier(admin, doc.id, { titre: 'Doc', blocs: texte('éphémère') })).json()
  assert.equal((await fetch(r.url)).status, 200)

  const retrait = await fetch(`${BASE}/api/docs/${doc.id}/publication`, {
    method: 'DELETE',
    headers: { cookie: admin },
  })
  assert.equal(retrait.status, 200)
  assert.equal((await fetch(r.url)).status, 404)
})

test('supprimer le document supprime aussi sa page publiée', async () => {
  const admin = cookie('admin@example.com')
  const doc = await creerDoc(admin, 'Doc voué à disparaître')
  const r = await (await publier(admin, doc.id, { titre: 'Doc', blocs: texte('à retirer avec lui') })).json()
  assert.equal((await fetch(r.url)).status, 200)

  const sup = await fetch(`${BASE}/api/docs/${doc.id}`, { method: 'DELETE', headers: { cookie: admin } })
  assert.equal(sup.status, 200)
  assert.equal((await fetch(r.url)).status, 404, 'l’adresse publique ne doit pas survivre au document')
})

test('le nom d’une page est fait de trois mots distincts', () => {
  const vus = new Set()
  for (let i = 0; i < 300; i++) {
    const nom = nomDePage()
    assert.match(nom, NOM_PAGE, `nom hors format : ${nom}`)
    const mots = nom.split('-')
    assert.equal(new Set(mots).size, 3, `un mot répété : ${nom}`)
    vus.add(nom)
  }
  // Trois cents tirages sur 8,4 milliards de combinaisons : deux fois le
  // même nom signalerait un générateur cassé, pas de la malchance.
  assert.equal(vus.size, 300)
})

test('une adresse de publication inventée ne révèle rien', async () => {
  const res = await fetch(`${BASE}/p/jamais-publie-ailleurs`)
  assert.equal(res.status, 404)
  const html = await res.text()
  assert.ok(!html.includes('/api/'))
})

test('deviner une adresse coûte quelque chose', async () => {
  // Trente essais infructueux par tranche de dix minutes, puis on attend.
  // Sans ça, la seule protection d'une page publique serait une question
  // de patience.
  const lettre = (n) => String.fromCharCode(97 + (n % 26))
  let dernier = 200
  for (let i = 0; i < 40; i++) {
    const mot = `zz${lettre(i)}${lettre(Math.floor(i / 26))}`
    dernier = (await fetch(`${BASE}/p/${mot}-inconnu-vraiment`)).status
    if (dernier === 429) break
  }
  assert.equal(dernier, 429, 'aucune limite sur les adresses qui ne mènent nulle part')
})

test('chaque visiteur a son compteur, derrière Caddy comme ailleurs (A9)', async () => {
  // Derrière Caddy, la connexion arrive toujours de 127.0.0.1 : sans
  // `origineDe`, un seul visiteur qui devine épuisait le compteur de tous.
  // Le test précédent a déjà saturé l'origine « locale » ; une autre origine,
  // annoncée par X-Forwarded-For, doit rester libre.
  // Trois mots, en lettres seulement : c'est le format d'un nom de page.
  const lettre = (n) => String.fromCharCode(97 + (n % 26))
  const essai = (ip, n) =>
    fetch(`${BASE}/p/yy${lettre(n)}${lettre(Math.floor(n / 26))}-inconnu-vraiment`, {
      headers: { 'x-forwarded-for': ip },
    })
  assert.equal((await essai('203.0.113.7', 0)).status, 404, 'un autre visiteur est puni pour les essais du premier')
  let dernier = 404
  for (let i = 0; i < 40; i++) {
    dernier = (await essai('203.0.113.8', i)).status
    if (dernier === 429) break
  }
  assert.equal(dernier, 429, 'ce visiteur-là, lui, est limité')
  assert.equal((await essai('203.0.113.9', 99)).status, 404, 'et son voisin ne l’est pas')
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})

// ============================================ la taille du document publié

test('un document long se publie — la limite n’est plus celle d’un formulaire', async () => {
  // Signalé en production le 23/09/2026 : « la publication a échoué (502) ».
  // La route lisait le corps avec la limite par défaut, 20 ko, c'est-à-dire
  // une dizaine de paragraphes. Un document réel la dépassait toujours.
  const admin = cookie('admin@example.com')
  const doc = await creerDoc(admin, 'Un long document')
  const blocs = []
  for (let i = 0; i < 600; i++) {
    blocs.push(...texte(`Paragraphe ${i} : le zonage a longtemps servi de boussole aux documents d’urbanisme.`))
  }
  const corps = JSON.stringify({ titre: 'Un long document', blocs })
  assert.ok(corps.length > 20_000, `le corps doit dépasser l’ancienne limite (${corps.length} octets)`)
  const r = await publier(admin, doc.id, { titre: 'Un long document', blocs })
  assert.equal(r.status, 200, 'un document de taille ordinaire se publie')
  const page = await fetch(`${BASE}/p/${(await r.json()).pubId}`)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Paragraphe 599/)
})

test('un corps vraiment démesuré reçoit un 413, et non rien du tout', async () => {
  // L'autre moitié du défaut : la socket était coupée avant que la réponse
  // ne parte. Le client ne recevait donc aucune réponse — ce qu'un reverse
  // proxy traduit par « 502 Bad Gateway ». Une limite doit se dire.
  const admin = cookie('admin@example.com')
  const doc = await creerDoc(admin, 'Démesuré')
  const bloc = texte('x'.repeat(2000))[0]
  const blocs = new Array(3000).fill(bloc)
  const r = await publier(admin, doc.id, { titre: 'Démesuré', blocs })
  assert.equal(r.status, 413, 'la réponse arrive, et elle dit pourquoi')
  assert.match(JSON.stringify(await r.json()), /large|volumineux/i)
})
