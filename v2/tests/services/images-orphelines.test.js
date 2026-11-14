// L'analyse des images orphelines sur le serveur (14/11/2026), contre PostgreSQL :
// réservée aux administrateurs ; une image citée est utilisée, l'autre est récente
// (moins de 7 jours : pas encore jugée).
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
const octets = (t) => new TextEncoder().encode(t)
const CITEE = `${'c'.repeat(32)}.png`
const ORPHELINE = `${'d'.repeat(32)}.png`
const ADRESSE = 'https://essai.amend.ink'

before(async () => {
  preparerServices()
  comptes = await ouvrirComptes(POSTGRES)
  commentaires = await ouvrirCommentaires(POSTGRES)
  serveur = creerServeur(
    {
      secret: 's'.repeat(32),
      jetonInterne: 'j',
      collaboration: 'ws://x',
      statique: '/x',
      dev: true,
      adresse: ADRESSE,
      administrateurs: ADMIN,
    },
    {
      comptes,
      commentaires,
      courrier,
      collaboration: {
        supprimerDocument: async (id) => effaces.push(id),
        lireTexte: async () => octets(`texte /images/${CITEE}`),
        lireSuggestions: async () => new Uint8Array(),
      },
    },
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
const ADMIN = adresse('admin')
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
/** Une personne avec une vraie adresse (pour être ajoutée par courriel). */
async function personneAvecAdresse(n, a = adresse('membre')) {
  await comptes.personneOuNouvelle(a)
  await appel('POST', '/api/connexion', { corps: { courriel: a } })
  const s = await suivre(dernierLien(a))
  await appel('PUT', '/api/moi', { cookie: s.cookie, corps: { nom: n } })
  const moi = await appel('GET', '/api/moi', { cookie: s.cookie })
  return { id: moi.json.id, courriel: a, cookie: s.cookie }
}

test('analyse des images : réservée aux administrateurs ; une image citée est utilisée, une récente n’est pas jugée', async () => {
  const admin = await personneAvecAdresse('Ada', ADMIN)
  const simple = await personneAvecAdresse('Zoé')
  const { json: doc } = await appel('POST', '/api/documents', { cookie: admin.cookie, corps: { titre: 'Illustré' } })
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
  await comptes.garderImage(doc.id, CITEE, 'image/png', png, admin.id)
  await comptes.garderImage(doc.id, ORPHELINE, 'image/png', png, admin.id)
  assert.equal((await appel('GET', '/api/admin/images-orphelines', { cookie: simple.cookie })).statut, 403)
  assert.equal((await appel('GET', '/api/admin/images-orphelines')).statut, 401)
  const r = await appel('GET', '/api/admin/images-orphelines', { cookie: admin.cookie })
  assert.equal(r.statut, 200)
  // La base de développement est partagée : on ne compte que ce qui s'y ajoute au moins.
  assert.ok(r.json.utilisees.n >= 1 && r.json.recentes.n >= 1)
  assert.ok(r.json.total.n >= 2 && r.json.total.octets >= 2 * png.length)
  assert.equal(r.json.documentsIllisibles, 0)
})
