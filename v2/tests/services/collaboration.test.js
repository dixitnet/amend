// T2 : l'adaptateur y/hub et l'adaptateur Yjs, ensemble, contre Redis et
// PostgreSQL réels, sans navigateur ni serveur d'amend.ink. L'identité est
// simulée ; les droits viennent du domaine, comme dans le serveur, à partir
// d'un rôle simulé. Sans ces services, le fichier se déclare sauté, avec la raison.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import * as Y from '@y/y'
import { preparerServices, POSTGRES, REDIS } from '../../exploitation/dev/pile.mjs'
import { demarrerCollaboration } from '../../adaptateurs/yhub/index.js'
import { clientCollaboration } from '../../adaptateurs/yhub/client.js'
import { ouvrirDocument } from '../../adaptateurs/yjs/index.js'
import { lireBlocs, texteDesBlocs } from '../../adaptateurs/blocknote/serveur.js'
import { roleEffectif, capacites, accesBranche } from '../../domaine/index.js'

const PORT = 4511
const ORIGINE = 'http://127.0.0.1:4300'
const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
const joignable = (port) =>
  new Promise((r) => {
    const s = net.connect(port, '127.0.0.1')
    s.on('connect', () => (s.destroy(), r(true)))
    s.on('error', () => r(false))
  })

let collab
let raisonSaut = null
const appelsDroits = []
const modifies = []
const JETON = 'jeton-t2'
/** Rôles simulés : `<rôle>-…` en tête de l'identifiant (`editeur-1`), sauf
 * ceux fixés à la main dans `rolesFixes` ; `banni-…` n'a aucun rôle. */
const rolesFixes = new Map()
const roleSimule = (id) => (rolesFixes.has(id) ? rolesFixes.get(id) : /^(\w+)-/.exec(id)?.[1])
before(async () => {
  try {
    preparerServices()
  } catch (e) {
    raisonSaut = `services indisponibles : ${e.message.slice(0, 120)}`
    return
  }
  if (!(await joignable(6379)) || !(await joignable(5432))) {
    raisonSaut = 'Redis ou PostgreSQL injoignable'
    return
  }
  collab = await demarrerCollaboration({
    port: PORT,
    redis: REDIS,
    postgres: POSTGRES,
    origines: [ORIGINE],
    delaiPersistance: 300,
    jetonInterne: JETON,
    surModification: (id) => modifies.push(id),
    // Identité simulée : le cookie `qui=<id>` ; pas de cookie, pas d'identité.
    identifier: async (cookie) => {
      const m = /qui=([\w-]+)/.exec(cookie)
      return m ? { id: m[1] } : null
    },
    droits: async (docId, id, branche) => {
      appelsDroits.push({ docId, id, branche })
      if (id.startsWith('panne')) throw new Error('serveur des droits injoignable')
      const role = roleSimule(id)
      return accesBranche(capacites(roleEffectif(role === 'banni' ? [] : [role ?? 'editeur'])), branche)
    },
  })
})
after(async () => collab?.fermer())

const t2 = (nom, f) => test(nom, (t) => (raisonSaut ? t.skip(raisonSaut) : f(t)))
const docId = (n) => `t2-${n}-${Date.now().toString(36)}`

/** Code HTTP d'une ouverture de WebSocket vers y/hub, sans navigateur. */
function upgrade(id, entetes = {}, branche = null) {
  return new Promise((resolve, reject) => {
    const q = branche === null ? '' : `?branch=${encodeURIComponent(branche)}`
    const req = http.request(`http://127.0.0.1:${PORT}/collaboration/ws/v1/amend/${id}${q}`, {
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': Buffer.from('amend-test-t2-v2').toString('base64'),
        ...entetes,
      },
    })
    req.on('upgrade', (res, socket) => (socket.destroy(), resolve(101)))
    req.on('response', (res) => (res.resume(), resolve(res.statusCode)))
    req.on('error', reject)
    req.end()
  })
}

t2('sans identité : 401 ; personne bannie : 403 ; personne admise : 101', async () => {
  const id = docId('acces')
  assert.equal(await upgrade(id), 401)
  assert.equal(await upgrade(id, { cookie: 'qui=banni-1' }), 403)
  assert.equal(await upgrade(id, { cookie: 'qui=alice' }), 101)
  assert.ok(
    appelsDroits.some((a) => a.docId === id && a.id === 'alice'),
    'les droits sont demandés pour ce document',
  )
})

t2('origine étrangère refusée, origine admise acceptée', async () => {
  const id = docId('origine')
  assert.equal(await upgrade(id, { cookie: 'qui=alice', origin: 'https://exemple.invalid' }), 403)
  assert.equal(await upgrade(id, { cookie: 'qui=alice', origin: ORIGINE }), 101)
})

t2('un document jamais écrit se lit vide, sans erreur', async () => {
  assert.equal(texteDesBlocs(lireBlocs(await collab.lireEtat(docId('vide')))), '')
})

/** Un client Node.js ouvert par l'adaptateur Yjs, avec l'identité simulée
 * dans un cookie (le WebSocket de Node accepte des en-têtes). */
function client(id, personne) {
  // Le WebSocket de Node n'envoie pas de cookie : on lui en fabrique un.
  const NativeWS = globalThis.WebSocket
  globalThis.WebSocket = class extends NativeWS {
    constructor(url, protocoles) {
      super(url, { protocols: protocoles, headers: { cookie: `qui=${personne}` } })
    }
  }
  try {
    return ouvrirDocument({
      url: `ws://127.0.0.1:${PORT}/collaboration/ws/v1/amend`,
      docId: id,
      personne: { id: personne, nom: personne, couleur: 'var(--auteur-1)' },
    })
  } finally {
    globalThis.WebSocket = NativeWS
  }
}
/** Le texte d'essai d'un état Yjs encodé. */
function texteDuDoc(etat) {
  const d = new Y.Doc()
  Y.applyUpdate(d, etat)
  const t = d.get('essai-t2', Y.Text).toString()
  d.destroy()
  return t
}
async function attendreQue(predicat, delai = 8000) {
  for (const t0 = Date.now(); Date.now() - t0 < delai; await attendre(50)) if (predicat()) return true
  return false
}

t2('deux clients de l’adaptateur Yjs convergent ; l’état et la présence se suivent', async () => {
  const id = docId('convergence')
  const a = client(id, 'alice')
  const b = client(id, 'bruno')
  const etatsA = []
  a.surEtat((e) => etatsA.push(e))
  let autresVusParA = 0
  a.surParticipants((liste) => (autresVusParA = liste.length))
  try {
    assert.ok(await attendreQue(() => etatsA.includes('connecte')), `A connecté (états : ${etatsA})`)
    const texteDe = (s) => s.contexte.doc.get('essai-t2', Y.Text).toString()
    a.contexte.doc.get('essai-t2', Y.Text).insert(0, 'Bonjour de A. ')
    b.contexte.doc.get('essai-t2', Y.Text).insert(0, 'Salut de B. ')
    assert.ok(await attendreQue(() => texteDe(a) === texteDe(b) && texteDe(a).length === 26), 'convergence')
    assert.ok(await attendreQue(() => autresVusParA === 1), 'A voit une autre personne')
  } finally {
    a.fermer()
    b.fermer()
  }
})

// Le cœur de l'étape 2 : le rôle décidé par le domaine, appliqué par y/hub,
// quel que soit le client (ici un client Yjs qui écrit quand même).
for (const [role, ecrit] of [
  ['lecteur', false],
  ['correcteur', false],
  ['editeur', true],
  ['proprietaire', true],
])
  t2(
    `${role} : ${ecrit ? 'sa modification atteint les autres' : 'sa modification n’atteint pas les autres'}`,
    async () => {
      const id = docId(`role-${role}`)
      const temoin = client(id, 'editeur-temoin')
      const essai = client(id, `${role}-1`)
      try {
        await attendre(800)
        essai.contexte.doc.get('essai-t2', Y.Text).insert(0, 'essai ')
        temoin.contexte.doc.get('essai-t2', Y.Text).insert(0, 'témoin')
        const attendu = ecrit ? (s) => s.length === 12 : (s) => s === 'témoin'
        await attendre(1500)
        const vu = temoin.contexte.doc.get('essai-t2', Y.Text).toString()
        assert.ok(attendu(vu), `${role} : le témoin voit ${JSON.stringify(vu)}`)
        // Et l'état relu côté serveur a sa frappe, ou ne l'a pas.
        await attendre(500)
        assert.equal(/essai/.test(texteDuDoc(await collab.lireEtat(id))), ecrit, `${role} : état du serveur`)
      } finally {
        temoin.fermer()
        essai.fermer()
      }
    },
  )

t2(
  'branches : suggestions ouvertes au correcteur et à l’éditeur, fermées au lecteur ; aucune autre branche',
  async () => {
    const id = docId('branches')
    for (const [qui, attendu] of [
      ['correcteur-1', 101],
      ['editeur-1', 101],
      ['proprietaire-1', 101],
      ['lecteur-1', 403],
    ])
      assert.equal(await upgrade(id, { cookie: `qui=${qui}` }, 'suggestions'), attendu, qui)
    for (const b of ['autre', 'Main', 'suggestions/x', ''])
      assert.equal(await upgrade(id, { cookie: 'qui=proprietaire-1' }, b), b === '' ? 400 : 403, `branche « ${b} »`)
    assert.ok(
      appelsDroits.some((a) => a.docId === id && a.branche === 'suggestions'),
      'la branche est transmise',
    )
  },
)

t2('présence : le correcteur se montre comme l’éditeur ; le lecteur voit sans être vu', async () => {
  const id = docId('presence')
  const e = client(id, 'editeur-p')
  let autresVusParE = -1
  e.surParticipants((liste) => (autresVusParE = liste.length))
  const c = client(id, 'correcteur-p')
  const l = client(id, 'lecteur-p')
  let autresVusParL = -1
  l.surParticipants((liste) => (autresVusParL = liste.length))
  try {
    assert.ok(
      await attendreQue(() => autresVusParL === 2),
      `le lecteur voit l’éditeur et le correcteur (${autresVusParL})`,
    )
    assert.ok(await attendreQue(() => autresVusParE === 1), `l’éditeur voit le correcteur (${autresVusParE})`)
    await attendre(1500)
    assert.equal(autresVusParE, 1, 'l’éditeur ne voit pas le lecteur')
  } finally {
    e.fermer()
    c.fermer()
    l.fermer()
  }
})

t2('rôle retiré : la connexion suivante est refusée (les droits sont redemandés)', async () => {
  const id = docId('retrait')
  rolesFixes.set('edith', 'editeur')
  assert.equal(await upgrade(id, { cookie: 'qui=edith' }), 101)
  rolesFixes.set('edith', 'banni')
  assert.equal(await upgrade(id, { cookie: 'qui=edith' }), 403)
  rolesFixes.set('edith', 'correcteur')
  assert.equal(await upgrade(id, { cookie: 'qui=edith' }), 101)
})

t2('demande de droits en échec : refus (403), jamais un accès', async () => {
  assert.equal(await upgrade(docId('panne'), { cookie: 'qui=panne-1' }), 403)
})

// Lots du 11/11/2026 : la corbeille, la copie et la date de modification,
// contre le vrai y/hub (route restore-ydoc ajoutée comme chez Docs).
t2('corbeille : la suppression douce ferme le document, la restauration le rend entier', async () => {
  const id = docId('corbeille')
  const serveur = clientCollaboration({ url: `http://127.0.0.1:${PORT}/collaboration`, jeton: JETON })
  const d = new Y.Doc()
  d.get('essai-t2', Y.Text).insert(0, 'Gardé à la corbeille')
  await serveur.ecrireTexte(id, Y.encodeStateAsUpdate(d), 'alice')
  assert.equal(await upgrade(id, { cookie: 'qui=alice' }), 101)
  await serveur.mettreALaCorbeille(id)
  // y/hub accepte la mise à niveau puis ferme aussitôt (« document deleted ») ;
  // il refuse toute écriture. Notre serveur, lui, refuse déjà les droits.
  await assert.rejects(serveur.ecrireTexte(id, Y.encodeStateAsUpdate(d), 'alice'), {
    code: 'collaboration-indisponible',
  })
  await serveur.restaurer(id)
  assert.equal(await upgrade(id, { cookie: 'qui=alice' }), 101)
  assert.equal(texteDuDoc(await serveur.lireTexte(id)), 'Gardé à la corbeille')
  // Un document jamais supprimé se « restaure » sans erreur.
  await serveur.restaurer(id)
})

t2('copie : le texte principal passe dans un nouveau document', async () => {
  const source = docId('source')
  const cible = docId('copie')
  const serveur = clientCollaboration({ url: `http://127.0.0.1:${PORT}/collaboration`, jeton: JETON })
  const d = new Y.Doc()
  d.get('essai-t2', Y.Text).insert(0, 'Texte à copier')
  await serveur.ecrireTexte(source, Y.encodeStateAsUpdate(d), 'alice')
  await serveur.copierTexte(source, cible, 'bruno')
  assert.equal(texteDuDoc(await serveur.lireTexte(cible)), 'Texte à copier')
  assert.equal(texteDuDoc(await serveur.lireTexte(source)), 'Texte à copier', 'l’original intact')
})

t2('date de modification : un compactage qui trouve du neuf prévient le serveur', async () => {
  const id = docId('modifie')
  const a = client(id, 'alice')
  try {
    assert.ok(await attendreQue(() => a.contexte.doc !== undefined))
    a.contexte.doc.get('essai-t2', Y.Text).insert(0, 'Du neuf')
    assert.ok(await attendreQue(() => modifies.includes(id), 15000), 'le serveur est prévenu')
  } finally {
    a.fermer()
  }
})
