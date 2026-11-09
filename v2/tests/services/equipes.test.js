// T3 : les dossiers d'équipe sur le serveur (étape 6d), contre PostgreSQL :
// créer une équipe, membres et invitations, rôles hérités sur les documents,
// dossiers de l'équipe, entrer et sortir un document, partir, supprimer.
// Les courriers sont gardés en mémoire ; y/hub est simulé.
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

/** Une personne avec une vraie adresse (pour être ajoutée par courriel). */
async function personneAvecAdresse(n) {
  const a = adresse('membre')
  await comptes.personneOuNouvelle(a)
  await appel('POST', '/api/connexion', { corps: { courriel: a } })
  const s = await suivre(dernierLien(a))
  await appel('PUT', '/api/moi', { cookie: s.cookie, corps: { nom: n } })
  const moi = await appel('GET', '/api/moi', { cookie: s.cookie })
  return { id: moi.json.id, courriel: a, cookie: s.cookie }
}
const droit = async (qui, doc) => (await appel('GET', `/api/droits?document=${doc}`, { cookie: qui.cookie })).json.role

test('équipe : créer, ajouter un membre connu, rôle hérité sur les documents de l’équipe', async () => {
  const gaelle = await personne('Gaëlle')
  const marc = await personneAvecAdresse('Marc')
  const g = { cookie: gaelle.cookie }
  const { json: eq } = await appel('POST', '/api/equipes', { ...g, corps: { nom: ' Éditions ' } })
  let vue = (await appel('GET', '/api/documents', g)).json
  assert.deepEqual(
    vue.equipes.find((e) => e.id === eq.id),
    { id: eq.id, nom: 'Éditions', role: 'proprietaire' },
  )
  const ajout = await appel('POST', `/api/equipes/${eq.id}/membres`, {
    ...g,
    corps: { courriel: marc.courriel, role: 'correcteur' },
  })
  assert.deepEqual(ajout.json, { invitation: false })
  assert.match(courrier.envoyes.at(-1).sujet, /Éditions/)
  const { json: dossier } = await appel('POST', '/api/dossiers', { ...g, corps: { nom: 'Essais', equipe: eq.id } })
  const { json: doc } = await appel('POST', '/api/documents', {
    ...g,
    corps: { titre: 'Manuscrit', equipe: eq.id, dossier: dossier.id },
  })
  assert.equal(await droit(gaelle, doc.id), 'proprietaire', 'le gestionnaire a les droits du propriétaire')
  assert.equal(await droit(marc, doc.id), 'correcteur')
  const contenu = (await appel('GET', `/api/equipes/${eq.id}`, { cookie: marc.cookie })).json
  assert.deepEqual(
    contenu.documents.map((d) => [d.titre, d.role, d.dossier, d.createur]),
    [['Manuscrit', 'correcteur', dossier.id, 'Gaëlle']],
  )
  assert.equal(contenu.invitations, undefined, 'les invitations : au gestionnaire seul')
  assert.deepEqual(contenu.membres.map((m) => m.role).sort(), ['correcteur', 'proprietaire'])
  // Le document d'équipe n'apparaît ni dans Mes documents ni dans Partagé avec moi.
  vue = (await appel('GET', '/api/documents', { cookie: marc.cookie })).json
  assert.ok(!vue.documents.some((d) => d.id === doc.id))
  // Un correcteur ne crée rien dans l'équipe ; un non-membre n'y voit rien.
  assert.equal((await appel('POST', '/api/documents', { cookie: marc.cookie, corps: { equipe: eq.id } })).statut, 403)
  const autre = await personne('Autre')
  assert.equal((await appel('GET', `/api/equipes/${eq.id}`, { cookie: autre.cookie })).statut, 404)
  assert.equal(await droit(autre, doc.id), undefined)
  // Pas de propriétaire nommé sur un document d'équipe.
  const proprio = await appel('POST', `/api/documents/${doc.id}/acces`, {
    ...g,
    corps: { courriel: adresse('x'), role: 'proprietaire' },
  })
  assert.equal(proprio.statut, 400)
})

test('équipe : inviter une adresse nouvelle ; elle devient membre à la connexion', async () => {
  const gaelle = await personne('Gaëlle')
  const { json: eq } = await appel('POST', '/api/equipes', { cookie: gaelle.cookie, corps: { nom: 'Revue' } })
  const a = adresse('nina')
  const r = await appel('POST', `/api/equipes/${eq.id}/membres`, {
    cookie: gaelle.cookie,
    corps: { courriel: a, role: 'editeur' },
  })
  assert.deepEqual(r.json, { invitation: true })
  const vueG = (await appel('GET', `/api/equipes/${eq.id}`, { cookie: gaelle.cookie })).json
  assert.deepEqual(
    vueG.invitations.map((i) => [i.courriel, i.role]),
    [[a, 'editeur']],
  )
  const s = await suivre(dernierLien(a))
  const vue = (await appel('GET', '/api/documents', { cookie: s.cookie })).json
  assert.deepEqual(
    vue.equipes.map((e) => [e.nom, e.role]),
    [['Revue', 'editeur']],
  )
})

test('équipe : membres gérés par le gestionnaire seul ; jamais aucun gestionnaire ; partir', async () => {
  const gaelle = await personneAvecAdresse('Gaëlle')
  const marc = await personneAvecAdresse('Marc')
  const g = { cookie: gaelle.cookie }
  const { json: eq } = await appel('POST', '/api/equipes', { ...g, corps: { nom: 'Collection' } })
  await appel('POST', `/api/equipes/${eq.id}/membres`, { ...g, corps: { courriel: marc.courriel, role: 'editeur' } })
  const parMarc = await appel('POST', `/api/equipes/${eq.id}/membres`, {
    cookie: marc.cookie,
    corps: { courriel: adresse('z'), role: 'lecteur' },
  })
  assert.equal(parMarc.statut, 403)
  const seul = await appel('PUT', `/api/equipes/${eq.id}/membres/${gaelle.id}`, { ...g, corps: { role: 'editeur' } })
  assert.deepEqual([seul.statut, seul.json.code], [409, 'dernier-gestionnaire'])
  assert.equal((await appel('DELETE', `/api/equipes/${eq.id}/moi`, g)).statut, 409)
  await appel('PUT', `/api/equipes/${eq.id}/membres/${marc.id}`, { ...g, corps: { role: 'proprietaire' } })
  assert.equal((await appel('DELETE', `/api/equipes/${eq.id}/moi`, g)).statut, 200, 'un autre gestionnaire reste')
  assert.equal((await appel('GET', `/api/equipes/${eq.id}`, g)).statut, 404)
})

test('déplacer : un document entre dans l’équipe (ses propriétaires deviennent éditeurs), puis en sort', async () => {
  const gaelle = await personneAvecAdresse('Gaëlle')
  const marc = await personneAvecAdresse('Marc')
  const lea = await personne('Léa')
  const g = { cookie: gaelle.cookie }
  const { json: eq } = await appel('POST', '/api/equipes', { cookie: marc.cookie, corps: { nom: 'Maison' } })
  await appel('POST', `/api/equipes/${eq.id}/membres`, {
    cookie: marc.cookie,
    corps: { courriel: gaelle.courriel, role: 'editeur' },
  })
  const { json: doc } = await appel('POST', '/api/documents', { ...g, corps: { titre: 'Roman' } })
  await appel('POST', '/api/dev/acces', { ...g, corps: { document: doc.id, personne: lea.id, role: 'lecteur' } })
  const entrer = await appel('PUT', `/api/documents/${doc.id}/dossier`, {
    ...g,
    corps: { equipe: eq.id, dossier: null },
  })
  assert.equal(entrer.statut, 200)
  assert.equal(await droit(gaelle, doc.id), 'editeur', 'l’ancienne propriétaire en devient éditrice')
  assert.equal(await droit(marc, doc.id), 'proprietaire', 'le gestionnaire')
  assert.equal(await droit(lea, doc.id), 'lecteur', 'la relectrice extérieure garde son accès')
  const vueLea = (await appel('GET', '/api/documents', { cookie: lea.cookie })).json
  assert.equal(vueLea.documents.find((d) => d.id === doc.id).section, 'partage')
  // Gaëlle, éditrice, ne peut pas le sortir ; Marc, gestionnaire, oui.
  const sortieG = await appel('PUT', `/api/documents/${doc.id}/dossier`, {
    ...g,
    corps: { equipe: null, dossier: null },
  })
  assert.equal(sortieG.statut, 403)
  const sortie = await appel('PUT', `/api/documents/${doc.id}/dossier`, {
    cookie: marc.cookie,
    corps: { equipe: null, dossier: null },
  })
  assert.equal(sortie.statut, 200)
  assert.equal(await droit(marc, doc.id), 'proprietaire')
  assert.equal(await droit(gaelle, doc.id), 'editeur', 'son accès propre reste')
  const vueM = (await appel('GET', '/api/documents', { cookie: marc.cookie })).json
  assert.equal(vueM.documents.find((d) => d.id === doc.id).section, 'mes-documents')
  // D'une équipe à une autre : non.
  const { json: eq2 } = await appel('POST', '/api/equipes', { cookie: marc.cookie, corps: { nom: 'Autre' } })
  await appel('PUT', `/api/documents/${doc.id}/dossier`, { cookie: marc.cookie, corps: { equipe: eq.id } })
  const saut = await appel('PUT', `/api/documents/${doc.id}/dossier`, {
    cookie: marc.cookie,
    corps: { equipe: eq2.id },
  })
  assert.deepEqual([saut.statut, saut.json.code], [409, 'deplacement-impossible'])
})

test('supprimer une équipe : seulement vide, par le gestionnaire', async () => {
  const gaelle = await personne('Gaëlle')
  const g = { cookie: gaelle.cookie }
  const { json: eq } = await appel('POST', '/api/equipes', { ...g, corps: { nom: 'Brève' } })
  const { json: d } = await appel('POST', '/api/dossiers', { ...g, corps: { nom: 'D', equipe: eq.id } })
  const plein = await appel('DELETE', `/api/equipes/${eq.id}`, g)
  assert.deepEqual([plein.statut, plein.json.code], [409, 'equipe-non-vide'])
  await appel('DELETE', `/api/dossiers/${d.id}`, g)
  await appel('PUT', `/api/equipes/${eq.id}`, { ...g, corps: { nom: 'Brève 2' } })
  assert.equal((await appel('DELETE', `/api/equipes/${eq.id}`, g)).statut, 200)
  assert.equal((await appel('GET', `/api/equipes/${eq.id}`, g)).statut, 404)
})
