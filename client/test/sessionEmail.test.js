// Une personne invitée n'est pas connectée quand la page se charge : sa
// session naît pendant la navigation (#/invite, puis #/doc). Le bouton
// « Un retour ? » (main.js) dépend de getSessionEmail — qui ne doit donc pas
// figer « non connecté » si la réponse de /api/auth/me arrive après
// l'ouverture de la session.
import test from 'node:test'
import assert from 'node:assert/strict'
import { getSessionEmail, forgetSessionCache, acceptInvitation } from '../src/auth.js'

function reponse(corps, ok = true) {
  return { ok, json: async () => corps }
}

test('une réponse « non connecté » arrivée après l’ouverture de session n’est pas mise en cache', async () => {
  forgetSessionCache()
  let finMe
  const meTardif = new Promise((r) => (finMe = r))
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('/api/auth/me')) {
      await meTardif
      return reponse({ email: null })
    }
    return reponse({ docId: 'abc', email: 'invite@example.org', role: 'correcteur' })
  }
  const premier = getSessionEmail() // part avant l'invitation
  const res = await acceptInvitation('jeton') // la session s'ouvre pendant ce temps
  assert.equal(res.docId, 'abc')
  finMe()
  assert.equal(await premier, null) // la réponse périmée reste ce qu'elle est…

  globalThis.fetch = async () => reponse({ email: 'invite@example.org' })
  assert.equal(await getSessionEmail(), 'invite@example.org') // …mais ne fige rien
})

test('hors de ce cas, la réponse est bien mise en cache', async () => {
  forgetSessionCache()
  let appels = 0
  globalThis.fetch = async () => {
    appels++
    return reponse({ email: 'a@example.org' })
  }
  assert.equal(await getSessionEmail(), 'a@example.org')
  assert.equal(await getSessionEmail(), 'a@example.org')
  assert.equal(appels, 1)
})
