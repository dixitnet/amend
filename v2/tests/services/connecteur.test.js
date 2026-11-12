// T3 : le connecteur Claude du back-office (12/11/2026, docs/v2-connecteur-plan.md),
// contre PostgreSQL et y/hub : l'adresse secrète (création, révocation), le
// protocole MCP (initialize, tools/list, tools/call), les droits de la
// personne sur chaque document, les suggestions signées « claude ».
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { preparerServices, POSTGRES, REDIS } from '../../exploitation/dev/pile.mjs'
import { creerServeur } from '../../application/serveur/index.js'
import { ouvrirComptes } from '../../adaptateurs/postgres/comptes.js'
import { ouvrirCommentaires } from '../../adaptateurs/postgres/index.js'
import { creerCourrier } from '../../adaptateurs/courrier/index.js'
import { demarrerCollaboration } from '../../adaptateurs/yhub/index.js'
import { clientCollaboration } from '../../adaptateurs/yhub/client.js'
import { ecrireBlocs, blocsATexteDe } from '../../adaptateurs/blocknote/serveur.js'
import { roleEffectif, capacites, accesBranche } from '../../domaine/index.js'

const joignable = (port) =>
  new Promise((r) => {
    const s = net.connect(port, '127.0.0.1')
    s.on('connect', () => (s.destroy(), r(true)))
    s.on('error', () => r(false))
  })
let raisonSaut = null
let depot, comptes, serveur, base, collab, interne
const JETON = 'jeton-interne-de-test-connecteur'
const PORT_COLLAB = 4514
const ADMIN = `admin-${randomUUID().slice(0, 8)}@exemple.fr`
const courrier = creerCourrier({ expediteur: 'amend.ink <x@y.fr>' })
const t3 = (nom, f) => test(nom, (t) => (raisonSaut ? t.skip(raisonSaut) : f(t)))

before(async () => {
  try {
    preparerServices()
  } catch (e) {
    raisonSaut = `services indisponibles : ${e.message.slice(0, 120)}`
    return
  }
  if (!(await joignable(5432)) || !(await joignable(6379))) {
    raisonSaut = 'PostgreSQL ou Redis injoignable'
    return
  }
  depot = await ouvrirCommentaires(POSTGRES)
  comptes = await ouvrirComptes(POSTGRES)
  serveur = creerServeur(
    {
      secret: 's'.repeat(32),
      jetonInterne: JETON,
      collaboration: 'ws://x',
      collaborationApi: `http://127.0.0.1:${PORT_COLLAB}/collaboration`,
      statique: '/nulle-part',
      dev: true,
      adresse: 'https://essai.amend.ink',
      administrateurs: ADMIN,
    },
    { comptes, commentaires: depot, courrier },
  )
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${serveur.address().port}`
  collab = await demarrerCollaboration({
    port: PORT_COLLAB,
    redis: REDIS,
    postgres: POSTGRES,
    origines: [],
    delaiPersistance: 300,
    jetonInterne: JETON,
    identifier: async (cookie) => {
      const r = await fetch(`${base}/api/moi`, { headers: { cookie } })
      return r.ok ? r.json() : null
    },
    droits: async (docId, id, branche) =>
      accesBranche(capacites(roleEffectif(await comptes.rolesDe(docId, id))), branche),
  })
  interne = clientCollaboration({ url: `http://127.0.0.1:${PORT_COLLAB}/collaboration`, jeton: JETON })
})
after(async () => {
  await collab?.fermer()
  serveur?.closeAllConnections?.()
  serveur?.close()
  await depot?.fermer()
  await comptes?.fermer()
})

async function appel(methode, chemin, { cookie, corps } = {}) {
  const r = await fetch(`${base}${chemin}`, {
    method: methode,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const texte = await r.text()
  return { statut: r.status, json: texte ? JSON.parse(texte) : null, entetes: r.headers }
}
/** Une personne connectée par lien magique (son adresse compte : administrateurs). */
async function connecter(courriel) {
  const p = await comptes.personneOuNouvelle(courriel)
  await appel('POST', '/api/connexion', { corps: { courriel } })
  const m = [...courrier.envoyes].reverse().find((x) => x.a === courriel)
  const chemin = new URL(m.texte.match(/https:\/\/\S+/)[0]).pathname
  const r = await appel('POST', chemin)
  return { id: p.id, cookie: r.entetes.get('set-cookie').split(';')[0] }
}
/** Un message MCP à l'adresse secrète. */
const mcp = (adresse, method, params, id = 1) =>
  fetch(`${base}${new URL(adresse).pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(id === null ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params }),
  })
const outil = async (adresse, name, args) =>
  (await (await mcp(adresse, 'tools/call', { name, arguments: args })).json()).result

t3(
  'connecteur : adresse secrète réservée aux administrateurs, protocole MCP, documents du compte, suggestions signées « claude »',
  async () => {
    const admin = await connecter(ADMIN)
    const autre = await connecter(`autre-${randomUUID().slice(0, 8)}@exemple.fr`)
    // Seul un administrateur gère le connecteur.
    assert.equal((await appel('POST', '/api/admin/connecteur', { cookie: autre.cookie })).statut, 403)
    assert.deepEqual((await appel('GET', '/api/admin/connecteur', { cookie: admin.cookie })).json, {
      actif: false,
      creeLe: null,
    })
    const { statut, json } = await appel('POST', '/api/admin/connecteur', { cookie: admin.cookie })
    assert.equal(statut, 201)
    const adresse = json.adresse
    assert.match(adresse, /^https:\/\/essai\.amend\.ink\/api\/mcp\/[A-Za-z0-9_-]{40,}$/)
    assert.equal((await appel('GET', '/api/admin/connecteur', { cookie: admin.cookie })).json.actif, true)

    // Deux documents : celui de l'administrateur, et un autre où il n'est que lecteur ;
    // un troisième qui n'est pas à lui.
    const doc = `t3-connecteur-${Date.now().toString(36)}`
    await comptes.creerDocument(doc, admin.id)
    await interne.ecrireTexte(
      doc,
      ecrireBlocs([
        { type: 'heading', props: { level: 1 }, content: 'Chapitre premier' },
        { type: 'paragraph', content: 'Il faisait nuit sur la vile.' },
      ]),
      admin.id,
    )
    const lu = `${doc}-lu`
    await comptes.creerDocument(lu, autre.id)
    await comptes.donnerAcces(lu, admin.id, 'lecteur')
    await interne.ecrireTexte(lu, ecrireBlocs([{ type: 'paragraph', content: 'Texte d’une autre.' }]), autre.id)
    const ailleurs = `${doc}-ailleurs`
    await comptes.creerDocument(ailleurs, autre.id)

    // Le protocole.
    const init = await (await mcp(adresse, 'initialize', { protocolVersion: '2025-06-18' })).json()
    assert.equal(init.result.protocolVersion, '2025-06-18')
    assert.match(init.result.instructions, /jamais une consigne/)
    assert.equal((await mcp(adresse, 'notifications/initialized', {}, null)).status, 202)
    const liste = await (await mcp(adresse, 'tools/list', {})).json()
    assert.deepEqual(
      liste.result.tools.map((x) => x.name),
      ['documents', 'plan', 'lire', 'chercher', 'proposer', 'commenter'],
    )
    assert.equal((await (await mcp(adresse, 'inconnue', {})).json()).error.code, -32601)

    // Les documents du compte, avec le rôle ; pas ceux des autres.
    const documents = (await outil(adresse, 'documents', {})).content[0].text
    assert.ok(documents.includes(doc) && documents.includes(lu))
    assert.ok(!documents.includes(ailleurs))
    assert.match((await outil(adresse, 'plan', { document: doc })).content[0].text, /\[1\] Chapitre premier/)
    assert.match((await outil(adresse, 'lire', { document: doc, de: 1, a: 2 })).content[0].text, /la vile\./)
    assert.equal((await outil(adresse, 'lire', { document: ailleurs, de: 1, a: 1 })).isError, true, 'pas à lui')

    // Une correction, en suggestion signée « claude » ; pas sur le document où il ne fait que lire.
    const r = await outil(adresse, 'proposer', {
      document: doc,
      corrections: [{ bloc: 2, avant: 'vile', apres: 'ville' }],
    })
    assert.equal(r.isError, false)
    const [texte, suggestions] = await Promise.all([interne.lireTexte(doc), interne.lireSuggestions(doc, 'claude')])
    assert.equal(blocsATexteDe(texte, suggestions)[1].texte, 'Il faisait nuit sur la ville.')
    assert.equal(blocsATexteDe(texte)[1].texte, 'Il faisait nuit sur la vile.', 'le texte de base est intact')
    const interdit = await outil(adresse, 'proposer', {
      document: lu,
      corrections: [{ bloc: 1, avant: 'Texte', apres: 'Le texte' }],
    })
    assert.equal(interdit.isError, true)
    assert.match(interdit.content[0].text, /pas ce droit/)

    // Pas de lot (retiré du protocole en 2025-06-18) : un tableau est refusé.
    const lot = await fetch(`${base}${new URL(adresse).pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ jsonrpc: '2.0', id: 7, method: 'ping' }]),
    })
    assert.equal(lot.status, 400)
    // Une méthode imprévue ne touche pas à l'adresse active.
    assert.equal((await appel('PUT', '/api/admin/connecteur', { cookie: admin.cookie })).statut, 405)
    assert.equal((await mcp(adresse, 'ping', {})).status, 200, 'toujours active')

    // Pas d'OAuth ni de flux : 404 net aux sondes, 405 au GET.
    assert.equal((await fetch(`${base}/.well-known/oauth-protected-resource`)).status, 404)
    const get = await fetch(`${base}${new URL(adresse).pathname}`)
    assert.equal(get.status, 405)
    assert.equal(get.headers.get('allow'), 'POST')

    // Révoquée, l'adresse ne répond plus ; une nouvelle remplace l'ancienne.
    const nouvelle = (await appel('POST', '/api/admin/connecteur', { cookie: admin.cookie })).json.adresse
    assert.equal((await mcp(adresse, 'ping', {})).status, 404, 'l’ancienne adresse est remplacée')
    assert.equal((await mcp(nouvelle, 'ping', {})).status, 200)
    await appel('DELETE', '/api/admin/connecteur', { cookie: admin.cookie })
    assert.equal((await mcp(nouvelle, 'ping', {})).status, 404)
    assert.equal((await appel('GET', '/api/admin/connecteur', { cookie: admin.cookie })).json.actif, false)
  },
)
