// La route d'analyse des images orphelines (application/serveur/images-orphelines.js),
// avec un dépôt et un y/hub simulés.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creerImagesOrphelines } from '../../application/serveur/images-orphelines.js'
import { DELAI_GRACE_IMAGES_MS } from '../../domaine/index.js'

const nom = (c) => `${c.repeat(32)}.jpg`
const octets = (t) => new TextEncoder().encode(t)
const MAINTENANT = 1_000_000_000_000
const VIEUX = MAINTENANT - DELAI_GRACE_IMAGES_MS - 1

function monter({ admin = true, connecte = true, lecture } = {}) {
  const reponses = []
  const traiter = creerImagesOrphelines({
    personneDe: async () => (connecte ? { id: 'p' } : null),
    administrateur: async () => admin,
    depot: {
      toutesLesImages: async () => [
        { document: 'd1', nom: nom('a'), taille: 100, creeLe: VIEUX },
        { document: 'd1', nom: nom('b'), taille: 200, creeLe: VIEUX },
        { document: 'd2', nom: nom('c'), taille: 30, creeLe: VIEUX },
      ],
      tousLesDocuments: async () => ['d1', 'd2'],
    },
    collaboration: {
      lireTexte:
        lecture ??
        (async (id) =>
          id === 'd1' ? octets(`texte /api/documents/d1/images/${nom('a')}`) : octets('texte sans image')),
      // Une image citée par une suggestion est utilisée aussi.
      lireSuggestions: async (id) => (id === 'd2' ? octets(`ajout ${nom('c')}`) : new Uint8Array()),
    },
    json: (res, statut, corps) => reponses.push({ statut, corps }),
    maintenant: () => MAINTENANT,
  })
  const appeler = (methode = 'GET', chemin = '/api/admin/images-orphelines') =>
    traiter({ method: methode }, {}, { pathname: chemin })
  return { appeler, reponses }
}

test('analyse : une image citée par le texte ou par une suggestion est utilisée, l’autre orpheline', async () => {
  const { appeler, reponses } = monter()
  assert.equal(await appeler(), true)
  const { statut, corps } = reponses[0]
  assert.equal(statut, 200)
  assert.deepEqual(corps.total, { n: 3, octets: 330 })
  assert.deepEqual(corps.utilisees, { n: 2, octets: 130 })
  assert.deepEqual(corps.orphelines, { n: 1, octets: 200 })
  assert.deepEqual(corps.documents, [{ document: 'd1', n: 1, octets: 200 }])
  assert.equal(corps.documentsLus, 2)
  assert.equal(corps.documentsIllisibles, 0)
})

test('un document illisible est signalé (on ne sait pas ce qu’il cite)', async () => {
  const { appeler, reponses } = monter({
    lecture: async (id) => {
      if (id === 'd2') throw Object.assign(new Error('y/hub : 503'), { code: 'collaboration-indisponible' })
      return octets('rien')
    },
  })
  await appeler()
  assert.equal(reponses[0].corps.documentsIllisibles, 1)
  assert.equal(reponses[0].corps.documentsLus, 1)
})

test('réservée aux administrateurs, connectés, en GET ; une autre route n’est pas la sienne', async () => {
  const sansSession = monter({ connecte: false })
  await sansSession.appeler()
  assert.equal(sansSession.reponses[0].statut, 401)
  const simple = monter({ admin: false })
  await simple.appeler()
  assert.deepEqual(simple.reponses[0], { statut: 403, corps: { code: 'reserve-administrateur' } })
  const post = monter()
  await post.appeler('POST')
  assert.equal(post.reponses[0].statut, 405)
  const autre = monter()
  assert.equal(await autre.appeler('GET', '/api/admin/polices'), false)
  assert.equal(autre.reponses.length, 0)
})
