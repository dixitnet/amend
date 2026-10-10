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

// --- C19 : ce que le navigateur garde de la personne qui part ---------------

function faux() {
  const m = new Map()
  return {
    get length() {
      return m.size
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  }
}

test('la déconnexion efface les conversations avec Margo et les anciennes clés, pas les réglages d’affichage', async () => {
  const { logout, logoutEverywhere, effacerTracesLocales } = await import('../src/auth.js')
  for (const sortir of [logout, logoutEverywhere]) {
    globalThis.sessionStorage = faux()
    globalThis.localStorage = faux()
    globalThis.fetch = async () => reponse({ ok: true })
    sessionStorage.setItem('amend.dialogue.doc1', '{"messages":[{"content":"extrait du texte"}]}')
    sessionStorage.setItem('amend.dialogue.doc2', '{}')
    sessionStorage.setItem('autre-cle', 'reste')
    localStorage.setItem('collabtext:name', 'Marie')
    localStorage.setItem('collabtext:color', '#3d5a80')
    localStorage.setItem('collabtext:zoom', '120')
    await sortir()
    assert.equal(sessionStorage.getItem('amend.dialogue.doc1'), null)
    assert.equal(sessionStorage.getItem('amend.dialogue.doc2'), null)
    assert.equal(sessionStorage.getItem('autre-cle'), 'reste')
    assert.equal(localStorage.getItem('collabtext:name'), null)
    assert.equal(localStorage.getItem('collabtext:color'), null)
    assert.equal(localStorage.getItem('collabtext:zoom'), '120', 'les réglages d’affichage restent')
  }
  // Sans stockage disponible, rien ne casse.
  delete globalThis.sessionStorage
  delete globalThis.localStorage
  assert.doesNotThrow(() => effacerTracesLocales())
})

test('C18 : un signalement n’emporte que le nom et le message des erreurs techniques', async () => {
  globalThis.window = undefined
  const { resumeErreurConsole } = await import('../src/contact.js')
  assert.equal(
    resumeErreurConsole(['Impossible de lire', 'un extrait confidentiel du texte', { texte: 'confidentiel' }, new TypeError('x est indéfini')]),
    'TypeError: x est indéfini'
  )
  assert.equal(resumeErreurConsole(['seulement', 'du texte confidentiel']), 'console.error (détail non joint)')
  assert.ok(resumeErreurConsole([new Error('a'.repeat(1000))]).length <= 200)
})
