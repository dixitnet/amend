// La page Versions, montée dans jsdom avec un faux serveur (fetch simulé) :
// la liste, la comparaison mot à mot, et le parcours « restaurer » (aperçu
// d'abord, puis seulement après confirmation l'écriture).

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const attendre = (ms = 20) => new Promise((r) => setTimeout(r, ms))
const json = (corps, status = 200) => ({ ok: status < 400, status, json: async () => corps })

async function monter({ peutEcrire = true, versions }) {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="app"></div></body>')
  globalThis.document = dom.window.document
  const appels = []
  globalThis.fetch = async (chemin, opts = {}) => {
    const methode = opts.method || 'GET'
    const corps = opts.body ? JSON.parse(opts.body) : null
    appels.push({ chemin, methode, corps })
    if (chemin === '/api/docs/d1') return json({ id: 'd1', title: 'Mémoire' })
    if (chemin === '/api/docs/d1/versions' && methode === 'GET') return json({ versions, peutEcrire })
    if (chemin.startsWith('/api/docs/d1/comparaison')) {
      return json({
        identiques: 3,
        approximatif: false,
        changements: [
          { type: 'modifie', avant: { n: 2, nom: 'paragraph', texte: 'Le chômage augmente.' }, apres: { n: 2, nom: 'paragraph', texte: 'Le chômage augmente nettement.' } },
          { type: 'supprime', avant: { n: 5, nom: 'paragraph', texte: 'Disparu.' }, apres: null },
        ],
      })
    }
    if (/\/versions\/\d+\/restauration$/.test(chemin)) {
      const simule = !!(corps && corps.simuler)
      return json({ simule, rien: false, stats: { modifies: 1, ajoutes: 0, supprimes: 1, identiques: 3 }, refuses: [], ignores: [], approximatif: false })
    }
    if (chemin.startsWith('/api/docs/d1/versions/')) return json({ ts: 1, blocs: [{ n: 1, nom: 'paragraph', texte: 'Texte de la version.' }] })
    return json({ error: 'inconnu' }, 404)
  }
  const { mountVersions } = await import('../src/versions.js')
  const racine = dom.window.document.getElementById('app')
  await mountVersions(racine, 'd1')
  await attendre()
  return { racine, appels, dom }
}

const VERSIONS = [
  { ts: 2000, origine: 'nommee', nom: 'Envoi au comité', par: 'Marie', octets: 10 },
  { ts: 1000, origine: 'session', nom: null, par: null, octets: 10 },
]

test('la page liste la version actuelle puis les versions, la plus récente d’abord', async () => {
  const { racine } = await monter({ versions: VERSIONS })
  const titres = [...racine.querySelectorAll('.vr-titre')].map((e) => e.textContent)
  assert.deepEqual(titres, ['Version actuelle', 'Envoi au comité', 'Fin d’une session de travail'])
  assert.ok(racine.querySelector('.vr-titre.nommee'), 'le nom d’une version nommée est mis en valeur')
  assert.match(racine.querySelector('h1').textContent, /Mémoire/)
})

test('la première version est comparée à l’état actuel, mot à mot', async () => {
  const { racine, appels } = await monter({ versions: VERSIONS })
  assert.ok(appels.some((a) => a.chemin === '/api/docs/d1/comparaison?de=2000&vers=courante'))
  assert.match(racine.querySelector('.vr-resume').textContent, /1 paragraphe modifié, 1 supprimé/)
  assert.match(racine.querySelector('.vr-changement.modifie ins').textContent, /nettement/)
  assert.equal(racine.querySelector('.vr-changement.supprime del').textContent, 'Disparu.')
})

test('restaurer montre d’abord ce qui sera proposé, et n’écrit qu’après confirmation', async () => {
  const { racine, appels } = await monter({ versions: VERSIONS })
  const restaurer = [...racine.querySelectorAll('button')].find((b) => b.textContent.startsWith('Restaurer'))
  restaurer.click()
  await attendre()
  const ecritures = () => appels.filter((a) => a.chemin.endsWith('/restauration'))
  assert.equal(ecritures().length, 1)
  assert.equal(ecritures()[0].corps.simuler, true, 'la première demande est une répétition')
  assert.match(racine.querySelector('.vr-phrase').textContent, /Seront proposés en suivi de modifications/)
  assert.match(racine.querySelector('.vr-dialogue').textContent, /Rien n’est effacé/)

  const confirmer = [...racine.querySelectorAll('button')].find((b) => b.textContent === 'Proposer ces changements')
  confirmer.click()
  await attendre()
  assert.equal(ecritures().length, 2)
  assert.ok(!ecritures()[1].corps.simuler, 'la seconde écrit pour de bon')
  assert.match(racine.querySelector('.style-status').textContent, /Ont été proposés/)
})

test('annuler une restauration n’écrit rien', async () => {
  const { racine, appels } = await monter({ versions: VERSIONS })
  ;[...racine.querySelectorAll('button')].find((b) => b.textContent.startsWith('Restaurer')).click()
  await attendre()
  ;[...racine.querySelectorAll('.vr-dialogue button')].find((b) => b.textContent === 'Annuler').click()
  assert.equal(racine.querySelector('.vr-dialogue').textContent, '')
  assert.equal(appels.filter((a) => a.chemin.endsWith('/restauration') && !a.corps.simuler).length, 0)
})

test('un lecteur voit les versions mais n’a ni nommer, ni restaurer, ni supprimer', async () => {
  const { racine } = await monter({ peutEcrire: false, versions: VERSIONS })
  assert.equal(racine.querySelector('.vr-nommer').children.length, 0)
  const boutons = [...racine.querySelectorAll('button')].map((b) => b.textContent)
  assert.ok(!boutons.some((t) => t.startsWith('Restaurer') || t === 'Supprimer' || t.startsWith('Renommer')))
  assert.ok(boutons.includes('Comparer'))
})

test('sans version enregistrée, la page explique quand le serveur en garde', async () => {
  const { racine } = await monter({ versions: [] })
  assert.match(racine.querySelector('.vr-vide').textContent, /Le serveur en garde une/)
})
