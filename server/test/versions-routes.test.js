// Les versions, de bout en bout (11/10/2026) : le vrai serveur, de vraies
// sessions, de vraies connexions WebSocket. Ce qui est vérifié : nommer garde
// bien l'état du moment ; comparer dit ce qui a changé ; restaurer **propose**
// (suivi de modifications) au lieu de réécrire, garde l'état d'avant, et se
// montre d'abord sans rien toucher ; et que les droits tiennent.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { WebSocket } from 'ws'
import { lancerInstance } from '../../tools/instance-test.js'

const PROPRIO = 'proprio@test.local'
const LECTEUR = 'lecteur@test.local'
const TIERS = 'tiers@test.local'

let inst
let doc

/** Un client WebSocket qui prend la main sur le document, applique `fn`
 * (qui modifie son Y.Doc local) puis rend la main quand le serveur a tout reçu. */
async function modifier(id, cookie, fn) {
  const local = new Y.Doc()
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`${inst.base.replace(/^http/, 'ws')}/ws/${id}?user=essai`, { headers: { cookie } })
    const limite = setTimeout(() => reject(new Error('synchronisation trop longue')), 8000)
    ws.on('message', (data, binaire) => {
      if (binaire) {
        Y.applyUpdate(local, new Uint8Array(data), 'distant')
        return
      }
      const m = JSON.parse(data.toString())
      if (m.type === 'synced') {
        local.transact(() => fn(local.getXmlFragment('prosemirror-content')))
        ws.send(Y.encodeStateAsUpdate(local, m.sv ? new Uint8Array(Buffer.from(m.sv, 'base64')) : undefined))
        setTimeout(() => {
          clearTimeout(limite)
          ws.close()
          resolve()
        }, 300)
      }
    })
    ws.on('error', reject)
  })
}

const ecrire = (frag, textes) => {
  frag.delete(0, frag.length)
  for (const t of textes) {
    const el = new Y.XmlElement('paragraph')
    frag.push([el])
    const xt = new Y.XmlText()
    el.push([xt])
    xt.insert(0, t)
  }
}

const api = (chemin, qui, opts = {}) => inst.api(`/api/docs/${doc}${chemin}`, { cookie: inst.cookies[qui], ...opts })

test('démarrage', async () => {
  inst = await lancerInstance({ port: 19910, comptes: [PROPRIO, LECTEUR, TIERS] })
  const c = await inst.api('/api/docs', { cookie: inst.cookies[PROPRIO], methode: 'POST', corps: { title: 'Mémoire' } })
  assert.equal(c.status, 201)
  doc = c.json.id
  const inv = await inst.api(`/api/docs/${doc}/invitations`, { cookie: inst.cookies[PROPRIO], methode: 'POST', corps: { email: LECTEUR, role: 'lecteur' } })
  assert.equal(inv.status, 200)
  const courriers = await (await fetch(`${inst.fauxMailgun}/courriers`)).json()
  const jeton = /#\/invite\/([A-Za-z0-9_-]+)/.exec(courriers.reverse().find((x) => x.to === LECTEUR).text)[1]
  assert.equal((await inst.api(`/api/invitations/${jeton}`, { methode: 'POST', cookie: inst.cookies[LECTEUR] })).status, 200)
  await modifier(doc, inst.cookies[PROPRIO], (f) => ecrire(f, ['Introduction.', 'Le chômage augmente en 2020.', 'Un paragraphe qui disparaîtra.', 'Conclusion.']))
})

let v1

test('nommer garde l’état du moment, avec son nom', async () => {
  // Le départ de la personne qui a écrit le document a déjà gardé son état.
  const debut = (await api('/versions', PROPRIO)).json.versions
  assert.deepEqual(debut.map((v) => v.origine), ['session'])
  const sansNom = await api('/versions', PROPRIO, { methode: 'POST', corps: { nom: '   ' } })
  assert.equal(sansNom.status, 400)
  const r = await api('/versions', PROPRIO, { methode: 'POST', corps: { nom: '  Envoi au\ncomité  ' } })
  assert.equal(r.status, 201)
  assert.equal(r.json.nom, 'Envoi au comité', 'espaces et sauts de ligne nettoyés')
  assert.equal(r.json.origine, 'nommee')
  v1 = r.json.ts
  const liste = (await api('/versions', PROPRIO)).json
  assert.deepEqual(liste.versions.map((v) => v.origine), ['nommee', 'session'], 'la plus récente d’abord')
  assert.equal(liste.peutEcrire, true)
  assert.equal((await api('/versions', LECTEUR)).json.peutEcrire, false)
})

test('on peut relire une version, renommer, retirer le nom', async () => {
  const lue = await api(`/versions/${v1}`, LECTEUR)
  assert.equal(lue.status, 200)
  assert.deepEqual(lue.json.blocs.map((b) => b.texte), ['Introduction.', 'Le chômage augmente en 2020.', 'Un paragraphe qui disparaîtra.', 'Conclusion.'])
  const r = await api(`/versions/${v1}`, PROPRIO, { methode: 'PATCH', corps: { nom: 'Version du comité' } })
  assert.equal(r.json.nom, 'Version du comité')
  assert.equal((await api('/versions/999', PROPRIO)).status, 404)
})

test('comparer une version à l’état actuel dit ce qui a changé', async () => {
  await modifier(doc, inst.cookies[PROPRIO], (f) => ecrire(f, ['Introduction.', 'Le chômage augmente nettement en 2020.', 'Conclusion.', 'Un ajout récent.']))
  const c = await api(`/comparaison?de=${v1}&vers=courante`, LECTEUR)
  assert.equal(c.status, 200)
  assert.equal(c.json.identiques, 2)
  assert.deepEqual(c.json.changements.map((x) => x.type), ['modifie', 'supprime', 'ajoute'])
  assert.equal((await api('/comparaison?de=abc&vers=courante', PROPRIO)).status, 400)
  assert.equal((await api('/comparaison?de=12345&vers=courante', PROPRIO)).status, 404)
})

test('restaurer : la répétition ne touche à rien', async () => {
  const avant = (await api('/versions/courante', PROPRIO)).json.blocs.map((b) => b.texte)
  const r = await api(`/versions/${v1}/restauration`, PROPRIO, { methode: 'POST', corps: { simuler: true } })
  assert.equal(r.status, 200)
  assert.equal(r.json.simule, true)
  assert.deepEqual(r.json.stats, { modifies: 1, ajoutes: 1, supprimes: 1, identiques: 2 })
  assert.deepEqual((await api('/versions/courante', PROPRIO)).json.blocs.map((b) => b.texte), avant)
  assert.equal((await api('/versions', PROPRIO)).json.versions.length, 2, 'pas de version d’avant pour une répétition')
})

test('restaurer : propose en suivi de modifications, et garde l’état d’avant', async () => {
  const lecteur = await api(`/versions/${v1}/restauration`, LECTEUR, { methode: 'POST', corps: {} })
  assert.equal(lecteur.status, 403, 'un lecteur ne restaure pas')
  const r = await api(`/versions/${v1}/restauration`, PROPRIO, { methode: 'POST', corps: {} })
  assert.equal(r.status, 200)
  assert.equal(r.json.simule, false)
  assert.deepEqual(r.json.refuses, [])
  assert.ok(r.json.versionAvant)

  const liste = (await api('/versions', PROPRIO)).json.versions
  const avantRestauration = liste.find((v) => v.origine === 'avant-restauration')
  assert.ok(avantRestauration, 'l’état d’avant est gardé')
  assert.equal(avantRestauration.ts, r.json.versionAvant)

  // Le document porte maintenant des propositions : tout accepté, c'est la version visée.
  const apres = (await api('/versions/courante', PROPRIO)).json.blocs.map((b) => b.texte)
  assert.deepEqual(apres.filter((t) => t !== ''), ['Introduction.', 'Le chômage augmente en 2020.', 'Un paragraphe qui disparaîtra.', 'Conclusion.'], 'tout accepté : exactement la version visée')
  // Un lecteur voit la même chose : l'opération est passée par le journal.
  assert.deepEqual((await api('/versions/courante', LECTEUR)).json.blocs.map((b) => b.texte), apres)

  // Une seconde restauration, juste après, n'a plus rien à proposer : le
  // texte « tout accepté » est déjà celui de la version.
  const encore = await api(`/versions/${v1}/restauration`, PROPRIO, { methode: 'POST', corps: {} })
  assert.equal(encore.json.rien, true)
  assert.equal((await api('/versions', PROPRIO)).json.versions.filter((v) => v.origine === 'avant-restauration').length, 1, 'et ne garde pas une version de plus')
})

test('les droits : un tiers n’en voit rien, un lecteur ne change rien', async () => {
  assert.equal((await api('/versions', TIERS)).status, 403)
  assert.equal((await api('/versions', undefined)).status, 403)
  assert.equal((await api('/versions', LECTEUR, { methode: 'POST', corps: { nom: 'x' } })).status, 403)
  assert.equal((await api(`/versions/${v1}`, LECTEUR, { methode: 'PATCH', corps: { nom: 'x' } })).status, 403)
  assert.equal((await api(`/versions/${v1}`, LECTEUR, { methode: 'DELETE' })).status, 403)
})

test('supprimer une version', async () => {
  const r = await api(`/versions/${v1}`, PROPRIO, { methode: 'DELETE' })
  assert.equal(r.status, 200)
  assert.equal((await api(`/versions/${v1}`, PROPRIO)).status, 404)
  assert.equal((await api(`/versions/${v1}`, PROPRIO, { methode: 'DELETE' })).status, 404)
})

test.after(async () => {
  if (inst) await inst.arreter()
})
