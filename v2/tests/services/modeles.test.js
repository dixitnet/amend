// T3 : les modèles de mise en page des équipes sur le serveur (étape 7,
// ADR 0011), contre PostgreSQL : création et réglage par le gestionnaire,
// écarts contrôlés par le domaine, modèle retenu d'un document, suppression,
// sortie de l'équipe.
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
/** Suit un lien de connexion, comme la page (POST) : rend le cookie de session et le document visé. */
async function suivre(chemin) {
  const r = await appel('POST', chemin)
  return {
    statut: r.statut,
    cookie: r.entetes.get('set-cookie')?.split(';')[0] ?? null,
    document: r.json?.document ?? null,
    code: r.json?.code ?? null,
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

/** Une équipe de Gaëlle (gestionnaire) avec Marc (éditeur) et Lou (correcteur), et un document. */
async function equipeEtDocument() {
  const gaelle = await personne('Gaëlle')
  const marc = await personneAvecAdresse('Marc')
  const lou = await personneAvecAdresse('Lou')
  const g = { cookie: gaelle.cookie }
  const { json: eq } = await appel('POST', '/api/equipes', { ...g, corps: { nom: 'Éditions' } })
  await appel('POST', `/api/equipes/${eq.id}/membres`, { ...g, corps: { courriel: marc.courriel, role: 'editeur' } })
  await appel('POST', `/api/equipes/${eq.id}/membres`, { ...g, corps: { courriel: lou.courriel, role: 'correcteur' } })
  const { json: doc } = await appel('POST', '/api/documents', { ...g, corps: { titre: 'Manuscrit', equipe: eq.id } })
  return { gaelle, marc, lou, eq, doc }
}
const modelesDu = async (qui, doc) => (await appel('GET', `/api/documents/${doc}/modeles`, { cookie: qui.cookie })).json

test('modèles d’équipe : le gestionnaire crée et règle ; les écarts sont contrôlés et réduits à ce qui change', async () => {
  const { gaelle, marc, eq } = await equipeEtDocument()
  const base = `/api/equipes/${eq.id}/modeles`
  assert.equal(
    (await appel('POST', base, { cookie: marc.cookie, corps: { nom: 'Essais', base: 'tat-poche' } })).statut,
    403,
    'un éditeur de l’équipe ne crée pas de modèle',
  )
  assert.equal(
    (await appel('POST', base, { cookie: gaelle.cookie, corps: { nom: 'Essais', base: 'inconnu' } })).json.code,
    'modele-introuvable',
  )
  const { statut, json: m } = await appel('POST', base, {
    cookie: gaelle.cookie,
    corps: { nom: ' Essais ', base: 'tat-poche' },
  })
  assert.equal(statut, 201)
  const refus = await appel('PUT', `${base}/${m.id}`, {
    cookie: gaelle.cookie,
    corps: { ecarts: { 'grille.lignes': 45 } },
  })
  assert.equal(refus.statut, 400)
  assert.deepEqual(refus.json, { code: 'modele-impossible', reglage: null, raison: 'lignes' })
  const hors = await appel('PUT', `${base}/${m.id}`, { cookie: gaelle.cookie, corps: { ecarts: { 'folio.bas': 3 } } })
  assert.deepEqual(hors.json, { code: 'reglage-inconnu', reglage: 'folio.bas', raison: null })
  const bon = await appel('PUT', `${base}/${m.id}`, {
    cookie: gaelle.cookie,
    corps: { nom: 'Essais 2027', ecarts: { 'page.largeur': 135, 'page.hauteur': 180, 'chapitre.bellePage': false } },
  })
  assert.deepEqual(bon.json, { ecarts: { 'page.largeur': 135, 'chapitre.bellePage': false } })
  const vue = (await appel('GET', `/api/equipes/${eq.id}`, { cookie: marc.cookie })).json
  assert.deepEqual(
    vue.modeles.map((x) => [x.nom, x.base, x.ecarts, x.documents]),
    [['Essais 2027', 'tat-poche', { 'page.largeur': 135, 'chapitre.bellePage': false }, 0]],
  )
  assert.equal(vue.modeleDefaut, null)
})

test('modèle d’un document : défaut de l’équipe, choix par qui écrit, ce que voit un correcteur extérieur', async () => {
  const { gaelle, marc, lou, eq, doc } = await equipeEtDocument()
  const g = { cookie: gaelle.cookie }
  const { json: m } = await appel('POST', `/api/equipes/${eq.id}/modeles`, {
    ...g,
    corps: { nom: 'Collection', base: 'tat-poche' },
  })
  const { json: m2 } = await appel('POST', `/api/equipes/${eq.id}/modeles`, {
    ...g,
    corps: { nom: 'Brouillon', base: 'tat-poche' },
  })
  let v = await modelesDu(marc, doc.id)
  assert.equal(v.retenu, 'tat-poche', 'sans choix, le premier modèle d’amend.ink')
  assert.equal(v.equipe, 'Éditions')
  assert.equal(v.peutChoisir, true)
  assert.deepEqual(
    v.modeles.map((x) => x.id),
    ['tat-poche', m2.id, m.id],
  )
  assert.equal(
    (await appel('PUT', `/api/equipes/${eq.id}/modele-defaut`, { cookie: marc.cookie, corps: { modele: m.id } }))
      .statut,
    403,
  )
  assert.equal(
    (await appel('PUT', `/api/equipes/${eq.id}/modele-defaut`, { ...g, corps: { modele: 'inconnu' } })).statut,
    404,
  )
  await appel('PUT', `/api/equipes/${eq.id}/modele-defaut`, { ...g, corps: { modele: m.id } })
  assert.equal((await modelesDu(marc, doc.id)).retenu, m.id, 'le défaut de l’équipe')
  // Lou, correcteur, ne choisit pas ; Marc, éditeur, choisit.
  assert.equal(
    (await appel('PUT', `/api/documents/${doc.id}/modele`, { cookie: lou.cookie, corps: { modele: m2.id } })).statut,
    403,
  )
  assert.equal((await modelesDu(lou, doc.id)).peutChoisir, false)
  await appel('PUT', `/api/documents/${doc.id}/modele`, { cookie: marc.cookie, corps: { modele: m2.id } })
  v = await modelesDu(marc, doc.id)
  assert.equal(v.retenu, m2.id)
  assert.equal(v.choisi, m2.id)
  // Un modèle d'une autre équipe n'est pas permis.
  const { json: autre } = await appel('POST', '/api/equipes', { ...g, corps: { nom: 'Autre' } })
  const { json: ailleurs } = await appel('POST', `/api/equipes/${autre.id}/modeles`, {
    ...g,
    corps: { nom: 'Ailleurs', base: 'tat-poche' },
  })
  assert.equal(
    (await appel('PUT', `/api/documents/${doc.id}/modele`, { cookie: marc.cookie, corps: { modele: ailleurs.id } }))
      .statut,
    404,
  )
  // Une personne hors de l'équipe, à qui le document est partagé : le modèle
  // retenu, sans les autres modèles de l'équipe.
  const zoe = await personneAvecAdresse('Zoé')
  await appel('POST', `/api/documents/${doc.id}/acces`, { ...g, corps: { courriel: zoe.courriel, role: 'correcteur' } })
  v = await modelesDu(zoe, doc.id)
  assert.equal(v.retenu, m2.id)
  assert.deepEqual(
    v.modeles.map((x) => x.id),
    ['tat-poche', m2.id],
  )
  assert.deepEqual(v.modeles[1], { id: m2.id, nom: 'Brouillon', base: 'tat-poche', ecarts: {} })
  // Personne d'autre ne voit les modèles du document.
  const inconnu = await personne('Inconnu')
  assert.equal((await appel('GET', `/api/documents/${doc.id}/modeles`, { cookie: inconnu.cookie })).statut, 404)
})

test('supprimer un modèle : les documents qui l’avaient retombent sur le défaut, et le nombre est rendu', async () => {
  const { gaelle, marc, eq, doc } = await equipeEtDocument()
  const g = { cookie: gaelle.cookie }
  const { json: m } = await appel('POST', `/api/equipes/${eq.id}/modeles`, {
    ...g,
    corps: { nom: 'Collection', base: 'tat-poche' },
  })
  await appel('PUT', `/api/equipes/${eq.id}/modele-defaut`, { ...g, corps: { modele: m.id } })
  await appel('PUT', `/api/documents/${doc.id}/modele`, { ...g, corps: { modele: m.id } })
  assert.equal((await appel('GET', `/api/equipes/${eq.id}`, g)).json.modeles[0].documents, 1)
  assert.equal((await appel('DELETE', `/api/equipes/${eq.id}/modeles/${m.id}`, { cookie: marc.cookie })).statut, 403)
  const r = await appel('DELETE', `/api/equipes/${eq.id}/modeles/${m.id}`, g)
  assert.deepEqual(r.json, { documents: 1 })
  const v = await modelesDu(marc, doc.id)
  assert.equal(v.retenu, 'tat-poche')
  assert.equal(v.choisi, null)
  assert.equal((await appel('GET', `/api/equipes/${eq.id}`, g)).json.modeleDefaut, null)
})

test('un document qui sort de l’équipe perd son modèle d’équipe, garde un modèle d’amend.ink', async () => {
  const { gaelle, eq, doc } = await equipeEtDocument()
  const g = { cookie: gaelle.cookie }
  const { json: m } = await appel('POST', `/api/equipes/${eq.id}/modeles`, {
    ...g,
    corps: { nom: 'Collection', base: 'tat-poche' },
  })
  await appel('PUT', `/api/documents/${doc.id}/modele`, { ...g, corps: { modele: m.id } })
  await appel('PUT', `/api/documents/${doc.id}/dossier`, { ...g, corps: { equipe: null, dossier: null } })
  let v = await modelesDu(gaelle, doc.id)
  assert.equal(v.equipe, null)
  assert.equal(v.choisi, null)
  assert.deepEqual(
    v.modeles.map((x) => x.id),
    ['tat-poche'],
  )
  await appel('PUT', `/api/documents/${doc.id}/modele`, { ...g, corps: { modele: 'tat-poche' } })
  v = await modelesDu(gaelle, doc.id)
  assert.equal(v.choisi, 'tat-poche')
})
