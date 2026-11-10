// T3 : comptes et partage sur le serveur (étape 6a), contre PostgreSQL :
// connexion par lien magique, service fermé, invitations, accès, plusieurs
// propriétaires, lien de partage, suppression, contrôle d'origine. Les
// courriers sont gardés en mémoire ; y/hub est simulé (suppression notée).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { preparerServices, POSTGRES } from '../../exploitation/dev/pile.mjs'
import { creerServeur } from '../../application/serveur/index.js'
import { ouvrirComptes } from '../../adaptateurs/postgres/comptes.js'
import { ouvrirCommentaires } from '../../adaptateurs/postgres/index.js'
import { creerCourrier } from '../../adaptateurs/courrier/index.js'

let comptes, commentaires, serveur, base
const courrier = creerCourrier({ expediteur: 'amend.ink <x@y.fr>' })
const effaces = []
const ADRESSE = 'https://essai.amend.ink'

before(async () => {
  preparerServices()
  comptes = await ouvrirComptes(POSTGRES)
  commentaires = await ouvrirCommentaires(POSTGRES)
  serveur = creerServeur(
    { secret: 's'.repeat(32), jetonInterne: 'j', collaboration: 'ws://x', statique: '/x', dev: true, adresse: ADRESSE },
    { comptes, commentaires, courrier, collaboration: { supprimerDocument: async (id) => effaces.push(id) } },
  )
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${serveur.address().port}`
})
after(async () => {
  serveur?.close()
  await comptes?.fermer()
  await commentaires?.fermer()
})

const adresse = (n) => `${n}-${randomUUID().slice(0, 8)}@exemple.fr`
async function appel(methode, chemin, { cookie, corps, entetes = {} } = {}) {
  const r = await fetch(`${base}${chemin}`, {
    method: methode,
    redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...entetes },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const texte = await r.text()
  let json = null
  try {
    if (texte) json = JSON.parse(texte)
  } catch {
    // une réponse qui n'est pas du JSON (redirection) : json reste null
  }
  return { statut: r.status, json, entetes: r.headers }
}
/** Le dernier lien de connexion envoyé à une adresse, réduit à son chemin. */
const dernierLien = (a) => {
  const m = [...courrier.envoyes].reverse().find((x) => x.a === a)
  return m ? new URL(m.texte.match(/https:\/\/\S+/)[0]).pathname : null
}
/** Suit un lien de connexion : rend le cookie de session et la redirection. */
async function suivre(chemin) {
  const r = await appel('GET', chemin)
  return {
    statut: r.statut,
    cookie: r.entetes.get('set-cookie')?.split(';')[0] ?? null,
    vers: r.entetes.get('location'),
  }
}
/** Une personne connectée par la route de développement. */
async function personne(nom) {
  const r = await appel('POST', '/api/dev/session', { corps: { nom } })
  return { id: r.json.id, cookie: r.entetes.get('set-cookie').split(';')[0] }
}

test('service fermé : une adresse inconnue ne reçoit rien, mais la réponse est la même', async () => {
  const a = adresse('inconnue')
  const r = await appel('POST', '/api/connexion', { corps: { courriel: a } })
  assert.equal(r.statut, 200)
  assert.equal(dernierLien(a), null)
  assert.equal((await appel('POST', '/api/connexion', { corps: { courriel: 'pas une adresse' } })).statut, 400)
})

test('invitation d’une adresse nouvelle : courrier, un clic, accès au bon rôle ; lien à usage unique', async () => {
  const paule = await personne('Paule')
  const { json: doc } = await appel('POST', '/api/documents', { cookie: paule.cookie, corps: { titre: 'La gare' } })
  const a = adresse('carla')
  const inv = await appel('POST', `/api/documents/${doc.id}/acces`, {
    cookie: paule.cookie,
    corps: { courriel: a, role: 'correcteur' },
  })
  assert.deepEqual(inv.json, { invitation: true })
  const m = courrier.envoyes.at(-1)
  assert.match(m.sujet, /Paule/)
  assert.match(m.texte, /La gare/)
  assert.equal((m.html.match(/<a /g) || []).length, 1, 'un seul lien')
  const s = await suivre(dernierLien(a))
  assert.equal(s.statut, 303)
  assert.equal(s.vers, `/#${doc.id}`)
  const droits = await appel('GET', `/api/droits?document=${doc.id}`, { cookie: s.cookie })
  assert.equal(droits.json.role, 'correcteur')
  assert.equal((await suivre(dernierLien(a))).vers, '/#!lien-invalide', 'déjà utilisé')
  // L'adresse connue reçoit désormais un lien de connexion.
  await appel('POST', '/api/connexion', { corps: { courriel: a } })
  assert.ok(dernierLien(a))
})

test('invitation d’une adresse connue : accès tout de suite, et un courrier qui le dit', async () => {
  const paule = await personne('Paule')
  const a = adresse('edith')
  await comptes.personneOuNouvelle(a)
  const { json: doc } = await appel('POST', '/api/documents', { cookie: paule.cookie, corps: {} })
  const r = await appel('POST', `/api/documents/${doc.id}/acces`, {
    cookie: paule.cookie,
    corps: { courriel: a, role: 'editeur' },
  })
  assert.deepEqual(r.json, { invitation: false })
  assert.match(courrier.envoyes.at(-1).texte, /éditeur/)
  const liste = await appel('GET', `/api/documents/${doc.id}/acces`, { cookie: paule.cookie })
  assert.deepEqual(liste.json.acces.map((x) => x.role).sort(), ['editeur', 'proprietaire'])
})

test('mes documents : créés par moi et partagés avec moi, avec mon rôle', async () => {
  const paule = await personne('Paule')
  const bruno = await personne('Bruno')
  const { json: d1 } = await appel('POST', '/api/documents', { cookie: paule.cookie, corps: { titre: 'Un' } })
  await appel('POST', '/api/dev/acces', {
    cookie: paule.cookie,
    corps: { document: d1.id, personne: bruno.id, role: 'lecteur' },
  })
  const liste = await appel('GET', '/api/documents', { cookie: bruno.cookie })
  const vu = liste.json.documents.find((d) => d.id === d1.id)
  assert.deepEqual(
    { titre: vu.titre, role: vu.role, section: vu.section },
    { titre: 'Un', role: 'lecteur', section: 'partage' },
  )
  const chezPaule = (await appel('GET', '/api/documents', { cookie: paule.cookie })).json.documents
  assert.deepEqual(
    chezPaule.filter((d) => d.id === d1.id).map((d) => [d.section, d.dossier]),
    [['mes-documents', null]],
  )
  assert.equal((await appel('GET', '/api/documents')).statut, 401)
})

test('dossiers : créer, ranger un document, renommer, déplacer sans boucle, supprimer seulement vide', async () => {
  const paule = await personne('Paule')
  const bruno = await personne('Bruno')
  const c = { cookie: paule.cookie }
  const { json: livres } = await appel('POST', '/api/dossiers', { ...c, corps: { nom: '  Livres ' } })
  const { json: essais } = await appel('POST', '/api/dossiers', { ...c, corps: { nom: 'Essais', parent: livres.id } })
  assert.equal((await appel('POST', '/api/dossiers', { ...c, corps: { nom: '' } })).json.code, 'nom-vide')
  const autre = await appel('POST', '/api/dossiers', { cookie: bruno.cookie, corps: { nom: 'X', parent: livres.id } })
  assert.equal(autre.statut, 404, 'pas dans le dossier d’un autre')
  const { json: doc } = await appel('POST', '/api/documents', { ...c, corps: { titre: 'Gare', dossier: essais.id } })
  let vue = (await appel('GET', '/api/documents', c)).json
  const miens = (l) => l.filter((d) => [livres.id, essais.id].includes(d.id))
  assert.deepEqual(
    miens(vue.dossiers).map((d) => [d.nom, d.parent]),
    [
      ['Essais', livres.id],
      ['Livres', null],
    ],
  )
  assert.equal(vue.documents.find((d) => d.id === doc.id).dossier, essais.id)
  // Ranger : le propriétaire seul ; un dossier à lui.
  await appel('PUT', `/api/documents/${doc.id}/dossier`, { ...c, corps: { dossier: livres.id } })
  vue = (await appel('GET', '/api/documents', c)).json
  assert.equal(vue.documents.find((d) => d.id === doc.id).dossier, livres.id)
  await appel('POST', '/api/dev/acces', { ...c, corps: { document: doc.id, personne: bruno.id, role: 'editeur' } })
  const range = (qui, dossier) =>
    appel('PUT', `/api/documents/${doc.id}/dossier`, { cookie: qui.cookie, corps: { dossier } })
  assert.equal((await range(bruno, null)).statut, 403)
  const { json: aBruno } = await appel('POST', '/api/dossiers', { cookie: bruno.cookie, corps: { nom: 'B' } })
  assert.equal((await range(paule, aBruno.id)).statut, 404)
  // Renommer, déplacer.
  await appel('PUT', `/api/dossiers/${essais.id}`, { ...c, corps: { nom: 'Récits' } })
  const boucle = await appel('PUT', `/api/dossiers/${livres.id}`, { ...c, corps: { parent: essais.id } })
  assert.deepEqual([boucle.statut, boucle.json.code], [409, 'deplacement-circulaire'])
  assert.equal((await appel('PUT', `/api/dossiers/${essais.id}`, { ...c, corps: { parent: null } })).statut, 200)
  vue = (await appel('GET', '/api/documents', c)).json
  assert.deepEqual(
    vue.dossiers.find((d) => d.id === essais.id),
    { id: essais.id, nom: 'Récits', parent: null },
  )
  assert.equal(
    (await appel('PUT', `/api/dossiers/${essais.id}`, { cookie: bruno.cookie, corps: { nom: 'Z' } })).statut,
    404,
  )
  // Supprimer : seulement vide.
  const plein = await appel('DELETE', `/api/dossiers/${livres.id}`, c)
  assert.deepEqual([plein.statut, plein.json.code], [409, 'dossier-non-vide'])
  await range(paule, null)
  assert.equal((await appel('DELETE', `/api/dossiers/${livres.id}`, c)).statut, 200)
  assert.equal((await appel('DELETE', `/api/dossiers/${essais.id}`, c)).statut, 200)
  assert.deepEqual(miens((await appel('GET', '/api/documents', c)).json.dossiers), [])
})

test('partagé avec moi : qui me l’a partagé ; me retirer, sauf le dernier propriétaire', async () => {
  const paule = await personne('Paule')
  const a = adresse('lea')
  const { json: doc } = await appel('POST', '/api/documents', { cookie: paule.cookie, corps: { titre: 'Note' } })
  await appel('POST', `/api/documents/${doc.id}/acces`, {
    cookie: paule.cookie,
    corps: { courriel: a, role: 'lecteur' },
  })
  const lea = { cookie: (await suivre(dernierLien(a))).cookie }
  const vu = (await appel('GET', '/api/documents', lea)).json.documents.find((d) => d.id === doc.id)
  assert.equal(vu.section, 'partage')
  assert.equal(vu.partagePar.nom, 'Paule', 'l’auteur de l’invitation, gardé à la connexion')
  assert.equal(vu.parLien, false)
  assert.ok(Number.isFinite(vu.partageLe))
  assert.equal((await appel('DELETE', `/api/documents/${doc.id}/moi`, lea)).statut, 200)
  assert.ok(!(await appel('GET', '/api/documents', lea)).json.documents.some((d) => d.id === doc.id))
  const dernier = await appel('DELETE', `/api/documents/${doc.id}/moi`, { cookie: paule.cookie })
  assert.deepEqual([dernier.statut, dernier.json.code], [409, 'dernier-proprietaire'])
})

test('un propriétaire qui part : le document passe dans Mes documents d’un autre propriétaire', async () => {
  const paule = await personne('Paule')
  const edith = await personne('Edith')
  const { json: dossier } = await appel('POST', '/api/dossiers', { cookie: paule.cookie, corps: { nom: 'P' } })
  const { json: doc } = await appel('POST', '/api/documents', { cookie: paule.cookie, corps: { dossier: dossier.id } })
  await appel('POST', '/api/dev/acces', {
    cookie: paule.cookie,
    corps: { document: doc.id, personne: edith.id, role: 'proprietaire' },
  })
  const vu = async (qui) =>
    (await appel('GET', '/api/documents', { cookie: qui.cookie })).json.documents.find((d) => d.id === doc.id)
  assert.equal((await vu(edith)).section, 'partage')
  assert.equal((await vu(edith)).partagePar.nom, 'Paule')
  assert.equal((await appel('DELETE', `/api/documents/${doc.id}/moi`, { cookie: paule.cookie })).statut, 200)
  assert.deepEqual([(await vu(edith)).section, (await vu(edith)).dossier], ['mes-documents', null])
  assert.equal(await vu(paule), undefined)
  // Le dossier de Paule est vide : il se supprime.
  assert.equal((await appel('DELETE', `/api/dossiers/${dossier.id}`, { cookie: paule.cookie })).statut, 200)
})

test('déplacer un dossier : un nom valide mais un parent refusé ne change rien', async () => {
  const paule = await personne('Paule')
  const c = { cookie: paule.cookie }
  const { json: a } = await appel('POST', '/api/dossiers', { ...c, corps: { nom: 'A' } })
  const { json: b } = await appel('POST', '/api/dossiers', { ...c, corps: { nom: 'B', parent: a.id } })
  const r = await appel('PUT', `/api/dossiers/${a.id}`, { ...c, corps: { nom: 'Nouveau', parent: b.id } })
  assert.equal(r.statut, 409)
  const vue = (await appel('GET', '/api/documents', c)).json.dossiers
  assert.deepEqual(
    vue.find((d) => d.id === a.id),
    { id: a.id, nom: 'A', parent: null },
  )
})

test('plusieurs propriétaires : seul un propriétaire en nomme ; le dernier ne part pas', async () => {
  const paule = await personne('Paule')
  const edith = await personne('Edith')
  const { json: doc } = await appel('POST', '/api/documents', { cookie: paule.cookie, corps: {} })
  await appel('POST', '/api/dev/acces', {
    cookie: paule.cookie,
    corps: { document: doc.id, personne: edith.id, role: 'editeur' },
  })
  assert.equal(
    (
      await appel('PUT', `/api/documents/${doc.id}/acces/${paule.id}`, {
        cookie: edith.cookie,
        corps: { role: 'lecteur' },
      })
    ).statut,
    403,
  )
  assert.equal(
    (await appel('DELETE', `/api/documents/${doc.id}/acces/${paule.id}`, { cookie: paule.cookie })).statut,
    409,
  )
  assert.equal(
    (
      await appel('PUT', `/api/documents/${doc.id}/acces/${edith.id}`, {
        cookie: paule.cookie,
        corps: { role: 'proprietaire' },
      })
    ).statut,
    200,
  )
  assert.equal(
    (await appel('DELETE', `/api/documents/${doc.id}/acces/${paule.id}`, { cookie: paule.cookie })).statut,
    200,
  )
  assert.equal(
    (await appel('GET', `/api/droits?document=${doc.id}`, { cookie: edith.cookie })).json.role,
    'proprietaire',
  )
  assert.equal((await appel('GET', `/api/droits?document=${doc.id}`, { cookie: paule.cookie })).statut, 404)
})

test('lien de partage : une personne connectée qui a le lien gagne son rôle ; une adresse nouvelle crée son compte ; lien fermé : plus rien', async () => {
  const paule = await personne('Paule')
  const lea = await personne('Léa')
  const { json: doc } = await appel('POST', '/api/documents', { cookie: paule.cookie, corps: {} })
  assert.equal((await appel('GET', `/api/droits?document=${doc.id}`, { cookie: lea.cookie })).statut, 404)
  assert.equal(
    (await appel('PUT', `/api/documents/${doc.id}/lien`, { cookie: paule.cookie, corps: { role: 'proprietaire' } }))
      .statut,
    400,
  )
  assert.equal(
    (await appel('PUT', `/api/documents/${doc.id}/lien`, { cookie: paule.cookie, corps: { role: 'correcteur' } }))
      .statut,
    200,
  )
  assert.equal((await appel('GET', `/api/droits?document=${doc.id}`, { cookie: lea.cookie })).json.role, 'correcteur')
  // Une adresse inconnue venue par le lien reçoit un lien de connexion (compte vérifié par courriel).
  const a = adresse('nouvelle')
  await appel('POST', '/api/connexion', { corps: { courriel: a, document: doc.id } })
  const s = await suivre(dernierLien(a))
  assert.equal(s.vers, `/#${doc.id}`)
  assert.equal((await appel('GET', `/api/droits?document=${doc.id}`, { cookie: s.cookie })).json.role, 'correcteur')
  // Sans session, rien (pas de connexion anonyme).
  assert.equal((await appel('GET', `/api/droits?document=${doc.id}`)).statut, 401)
  await appel('PUT', `/api/documents/${doc.id}/lien`, { cookie: paule.cookie, corps: { role: null } })
  assert.equal((await appel('GET', `/api/droits?document=${doc.id}`, { cookie: lea.cookie })).statut, 404)
})

test('suppression : le propriétaire seul, tout de suite ; y/hub et les commentaires suivent', async () => {
  const paule = await personne('Paule')
  const edith = await personne('Edith')
  const { json: doc } = await appel('POST', '/api/documents', { cookie: paule.cookie, corps: {} })
  await appel('POST', '/api/dev/acces', {
    cookie: paule.cookie,
    corps: { document: doc.id, personne: edith.id, role: 'editeur' },
  })
  await commentaires.creerFil(doc.id, paule.id, [{ type: 'paragraph', content: 'x' }])
  assert.equal((await appel('DELETE', `/api/documents/${doc.id}`, { cookie: edith.cookie })).statut, 403)
  assert.equal((await appel('DELETE', `/api/documents/${doc.id}`, { cookie: paule.cookie })).statut, 200)
  assert.ok(effaces.includes(doc.id), 'effacé dans y/hub')
  assert.deepEqual(await commentaires.fils(doc.id), [])
  assert.equal((await appel('GET', `/api/droits?document=${doc.id}`, { cookie: paule.cookie })).statut, 404)
})

test('liens de connexion limités par adresse', async () => {
  const a = adresse('pressee')
  await comptes.personneOuNouvelle(a)
  const statuts = []
  for (let i = 0; i < 7; i++) statuts.push((await appel('POST', '/api/connexion', { corps: { courriel: a } })).statut)
  assert.deepEqual(statuts.slice(-2), [429, 429])
})

test('origine : une requête qui modifie et vient d’ailleurs est refusée', async () => {
  const paule = await personne('Paule')
  for (const entetes of [{ origin: 'https://ailleurs.example' }, { 'sec-fetch-site': 'cross-site' }])
    assert.equal(
      (await appel('POST', '/api/documents', { cookie: paule.cookie, corps: {}, entetes })).statut,
      403,
      JSON.stringify(entetes),
    )
  assert.equal(
    (await appel('POST', '/api/documents', { cookie: paule.cookie, corps: {}, entetes: { origin: ADRESSE } })).statut,
    201,
  )
})

test('mon nom : changé, et la session le suit', async () => {
  const p = await personne('Ancien')
  const r = await appel('PUT', '/api/moi', { cookie: p.cookie, corps: { nom: 'Nouveau' } })
  assert.equal(r.statut, 200)
  const cookie = r.entetes.get('set-cookie').split(';')[0]
  assert.equal((await appel('GET', '/api/moi', { cookie })).json.nom, 'Nouveau')
  assert.equal((await appel('PUT', '/api/moi', { cookie, corps: { nom: '' } })).statut, 400)
})

test('favoris (comme Docs) : chacun les siens ; ni sans accès, ni par une autre méthode', async () => {
  const p = await personne('Paule')
  const x = await personne('Xavier')
  const doc = (await appel('POST', '/api/documents', { cookie: p.cookie, corps: {} })).json.id
  const favori = async (qui) =>
    (await appel('GET', '/api/documents', { cookie: qui.cookie })).json.documents.find((d) => d.id === doc)?.favori
  assert.equal(await favori(p), false)
  assert.equal((await appel('PUT', `/api/documents/${doc}/favori`, { cookie: p.cookie })).statut, 200)
  assert.equal(await favori(p), true)
  assert.equal(
    (await appel('PUT', `/api/documents/${doc}/favori`, { cookie: p.cookie })).statut,
    200,
    'deux fois : sans erreur',
  )
  assert.equal((await appel('PUT', `/api/documents/${doc}/favori`, { cookie: x.cookie })).statut, 404, 'sans accès')
  assert.equal((await appel('POST', `/api/documents/${doc}/favori`, { cookie: p.cookie })).statut, 405)
  assert.equal((await appel('DELETE', `/api/documents/${doc}/favori`, { cookie: p.cookie })).statut, 200)
  assert.equal(await favori(p), false)
})
