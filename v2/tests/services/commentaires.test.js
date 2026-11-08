// T3 : les commentaires sur le serveur, contre une base PostgreSQL réelle
// (dépôt de l'adaptateur), avec les droits du domaine : le modèle de Docs
// (commenter à partir du correcteur ; modifier le sien ; l'éditeur modère).
// Sans PostgreSQL, le fichier se déclare sauté, avec la raison.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { preparerServices, POSTGRES } from '../../exploitation/dev/pile.mjs'
import { creerServeur } from '../../application/serveur/index.js'
import { creerTableAcces } from '../../application/serveur/acces.js'
import { ouvrirCommentaires } from '../../adaptateurs/postgres/index.js'

const joignable = (port) =>
  new Promise((r) => {
    const s = net.connect(port, '127.0.0.1')
    s.on('connect', () => (s.destroy(), r(true)))
    s.on('error', () => r(false))
  })
let raisonSaut = null
let depot, serveur, base
const table = creerTableAcces()
const DOC = `t3-comm-${Date.now().toString(36)}`
const cookies = {}

before(async () => {
  try {
    preparerServices()
  } catch (e) {
    raisonSaut = `services indisponibles : ${e.message.slice(0, 120)}`
    return
  }
  if (!(await joignable(5432))) {
    raisonSaut = 'PostgreSQL injoignable'
    return
  }
  depot = await ouvrirCommentaires(POSTGRES)
  serveur = creerServeur(
    { secret: 's'.repeat(32), jetonInterne: 'j', collaboration: 'ws://x', statique: '/nulle-part', dev: true },
    table,
    depot,
  )
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${serveur.address().port}`
  for (const nom of ['Paule', 'Edith', 'Carla', 'Cyril', 'Lucie', 'Xavier']) {
    const r = await fetch(`${base}/api/dev/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nom }),
    })
    cookies[nom] = { id: (await r.json()).id, cookie: r.headers.get('set-cookie').split(';')[0] }
  }
  table.creer(DOC, cookies.Paule.id)
  table.donner(DOC, cookies.Edith.id, 'editeur')
  table.donner(DOC, cookies.Carla.id, 'correcteur')
  table.donner(DOC, cookies.Cyril.id, 'correcteur')
  table.donner(DOC, cookies.Lucie.id, 'lecteur')
})
after(async () => {
  serveur?.closeAllConnections?.()
  serveur?.close()
  await depot?.fermer()
})

const t3 = (nom, f) => test(nom, (t) => (raisonSaut ? t.skip(raisonSaut) : f(t)))
const corps = (texte) => [{ type: 'paragraph', content: texte }]
async function appel(qui, methode, chemin, donnees, doc = DOC) {
  const r = await fetch(`${base}/api/documents/${doc}/fils${chemin}`, {
    method: methode,
    headers: { 'content-type': 'application/json', ...(qui ? { cookie: cookies[qui].cookie } : {}) },
    body: donnees === undefined ? undefined : JSON.stringify(donnees),
  })
  const texte = await r.text()
  return { statut: r.status, corps: texte ? JSON.parse(texte) : null }
}

t3('le correcteur ouvre un fil ; tous ceux qui commentent le voient, avec son auteur', async () => {
  const r = await appel('Carla', 'POST', '', { corps: corps('Une remarque.') })
  assert.equal(r.statut, 201)
  assert.equal(r.corps.comments[0].userId, cookies.Carla.id)
  for (const qui of ['Paule', 'Edith', 'Cyril']) {
    const l = await appel(qui, 'GET', '')
    assert.equal(l.statut, 200, qui)
    assert.ok(
      l.corps.some((f) => f.id === r.corps.id),
      qui,
    )
  }
})

t3('le lecteur ne voit ni n’écrit de commentaire ; sans accès ni session : refus', async () => {
  assert.equal((await appel('Lucie', 'GET', '')).statut, 403)
  assert.equal((await appel('Lucie', 'POST', '', { corps: corps('x') })).statut, 403)
  assert.equal((await appel('Xavier', 'GET', '')).statut, 404, 'sans rôle : le document n’existe pas pour lui')
  assert.equal((await appel(null, 'GET', '')).statut, 401)
  assert.equal((await appel('Paule', 'GET', '', undefined, 'jamais-cree')).statut, 404)
})

t3('répondre, modifier le sien ; ne pas modifier ni supprimer celui d’un autre (correcteur)', async () => {
  const fil = (await appel('Carla', 'POST', '', { corps: corps('Premier.') })).corps
  const rep = await appel('Cyril', 'POST', `/${fil.id}/commentaires`, { corps: corps('Réponse.') })
  assert.equal(rep.statut, 201)
  assert.equal(
    (await appel('Cyril', 'PUT', `/${fil.id}/commentaires/${rep.corps.id}`, { corps: corps('Corrigée.') })).statut,
    200,
  )
  const premier = fil.comments[0].id
  assert.equal(
    (await appel('Cyril', 'PUT', `/${fil.id}/commentaires/${premier}`, { corps: corps('Piraté.') })).statut,
    403,
  )
  assert.equal((await appel('Cyril', 'DELETE', `/${fil.id}/commentaires/${premier}`)).statut, 403)
  assert.equal(
    (await appel('Edith', 'PUT', `/${fil.id}/commentaires/${premier}`, { corps: corps('Réécrit.') })).statut,
    403,
    'personne ne réécrit le commentaire d’un autre',
  )
  const relu = (await appel('Carla', 'GET', '')).corps.find((f) => f.id === fil.id)
  assert.deepEqual(
    relu.comments.map((c) => c.body[0].content),
    ['Premier.', 'Corrigée.'],
  )
})

t3(
  'l’éditeur modère : supprime le commentaire d’un autre, résout son fil ; le dernier commentaire emporte le fil',
  async () => {
    const fil = (await appel('Carla', 'POST', '', { corps: corps('À résoudre.') })).corps
    assert.equal((await appel('Cyril', 'POST', `/${fil.id}/resoudre`)).statut, 403)
    assert.equal((await appel('Edith', 'POST', `/${fil.id}/resoudre`)).statut, 200)
    let relu = (await appel('Carla', 'GET', '')).corps.find((f) => f.id === fil.id)
    assert.equal(relu.resolved, true)
    assert.equal(relu.resolvedBy, cookies.Edith.id)
    assert.equal((await appel('Carla', 'POST', `/${fil.id}/rouvrir`)).statut, 200, 'l’auteur du fil le rouvre')
    assert.equal((await appel('Edith', 'DELETE', `/${fil.id}/commentaires/${fil.comments[0].id}`)).statut, 200)
    relu = (await appel('Carla', 'GET', '')).corps.find((f) => f.id === fil.id)
    assert.equal(relu, undefined)
  },
)

t3('réactions : chacun les siennes, regroupées par emoji', async () => {
  const fil = (await appel('Carla', 'POST', '', { corps: corps('Bravo.') })).corps
  const c = fil.comments[0].id
  for (const qui of ['Cyril', 'Edith'])
    assert.equal((await appel(qui, 'POST', `/${fil.id}/commentaires/${c}/reactions`, { emoji: '👍' })).statut, 200)
  assert.equal(
    (await appel('Cyril', 'POST', `/${fil.id}/commentaires/${c}/reactions`, { emoji: '👍' })).statut,
    200,
    'deux fois : sans effet',
  )
  let r = (await appel('Carla', 'GET', '')).corps.find((f) => f.id === fil.id).comments[0].reactions
  assert.deepEqual(
    r.map((x) => [x.emoji, x.userIds.length]),
    [['👍', 2]],
  )
  assert.equal(
    (await appel('Cyril', 'DELETE', `/${fil.id}/commentaires/${c}/reactions/${encodeURIComponent('👍')}`)).statut,
    200,
  )
  r = (await appel('Carla', 'GET', '')).corps.find((f) => f.id === fil.id).comments[0].reactions
  assert.deepEqual(r[0].userIds, [cookies.Edith.id])
})

t3('requêtes piégées : codes, jamais d’erreur interne', async () => {
  const fil = (await appel('Carla', 'POST', '', { corps: corps('Cible.') })).corps
  for (const mauvais of [
    {},
    { corps: [] },
    { corps: 'texte' },
    { corps: corps('x'), metadonnees: [1] },
    { corps: [{ type: 'paragraph', content: 'x'.repeat(70_000) }] },
  ]) {
    const r = await appel('Carla', 'POST', '', mauvais)
    assert.ok([400, 413].includes(r.statut), JSON.stringify(mauvais).slice(0, 60))
  }
  for (const chemin of [
    '/pas-un-uuid',
    `/${fil.id}/commentaires/pas-un-uuid`,
    `/${fil.id}/inconnu`,
    `/${fil.id}/commentaires/${fil.comments[0].id}/reactions/x/y`,
    '/%E0%A4%A',
  ])
    assert.ok([400, 404, 405].includes((await appel('Carla', 'GET', chemin)).statut), chemin)
  assert.equal(
    (await appel('Carla', 'POST', `/${fil.id}/commentaires/${fil.comments[0].id}/reactions`, { emoji: '<script>' }))
      .statut,
    400,
  )
  // Un fil d'un autre document ne s'atteint pas par celui-ci.
  const autre = `t3-autre-${Date.now().toString(36)}`
  table.creer(autre, cookies.Carla.id)
  assert.equal((await appel('Carla', 'DELETE', `/${fil.id}`, undefined, autre)).statut, 404)
})

t3('flux d’événements : un navigateur abonné est prévenu de chaque changement', async () => {
  const ctrl = new AbortController()
  const r = await fetch(`${base}/api/documents/${DOC}/fils/evenements`, {
    headers: { cookie: cookies.Edith.cookie },
    signal: ctrl.signal,
  })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-type'), /text\/event-stream/)
  const lecteur = r.body.getReader()
  let recu = ''
  const attendu = (async () => {
    while (!recu.includes('changement')) recu += new TextDecoder().decode((await lecteur.read()).value)
  })()
  await appel('Carla', 'POST', '', { corps: corps('Nouveau.') })
  await Promise.race([attendu, new Promise((_, rej) => setTimeout(() => rej(new Error('aucun événement')), 3000))])
  ctrl.abort()
  assert.equal(
    (await fetch(`${base}/api/documents/${DOC}/fils/evenements`, { headers: { cookie: cookies.Lucie.cookie } })).status,
    403,
  )
})
