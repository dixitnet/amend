// T3 : Margo (étape 8) sur le serveur, contre PostgreSQL, Redis et y/hub
// réels ; le modèle est simulé (un scénario d'appels d'outils), sauf dans le
// dernier test, qui appelle DeepSeek chez Scaleway quand la clé est là
// (MARGO_ESSAI_REEL=1). Sans services, le fichier se déclare sauté.
import { test, before, after } from 'node:test'
import postgres from 'postgres'
import assert from 'node:assert/strict'
import net from 'node:net'
import * as Y from '@y/y'
import { preparerServices, POSTGRES, REDIS } from '../../exploitation/dev/pile.mjs'
import { creerServeur } from '../../application/serveur/index.js'
import { ouvrirComptes } from '../../adaptateurs/postgres/comptes.js'
import { ouvrirCommentaires } from '../../adaptateurs/postgres/index.js'
import { demarrerCollaboration } from '../../adaptateurs/yhub/index.js'
import { clientCollaboration } from '../../adaptateurs/yhub/client.js'
import { creerIA } from '../../adaptateurs/ia/index.js'
import { ecrireBlocs, blocsATexteDe } from '../../adaptateurs/blocknote/serveur.js'
import { roleEffectif, capacites, accesBranche, ESPACE_FINE } from '../../domaine/index.js'

const joignable = (port) =>
  new Promise((r) => {
    const s = net.connect(port, '127.0.0.1')
    s.on('connect', () => (s.destroy(), r(true)))
    s.on('error', () => r(false))
  })
let raisonSaut = null
let depot, comptes, serveur, base, collab, interne
const JETON = 'jeton-interne-de-test-margo'
const PORT_COLLAB = 4513
const cookies = {}

/** Le modèle simulé : chaque conversation rejoue `scenario`, une liste de
 * tours ; un tour est une fonction (des résultats reçus) qui rend la réponse. */
let scenario = []
const requetes = []
const iaSimulee = {
  disponible: (m) => m !== 'claude-haiku-5-5',
  conversation({ modele, consigne }) {
    let i = 0
    return {
      async tour(entree) {
        requetes.push({ modele, consigne, entree })
        const f = scenario[i++]
        const r = f ? f(entree, modele) : { texte: 'Fini.', appels: [] }
        return {
          texte: r.texte ?? '',
          appels: r.appels ?? [],
          arret: r.arret ?? (r.appels?.length ? 'outils' : 'fin'),
          jetons: { entree: 10, sortie: 5, cacheLu: 0 },
        }
      },
    }
  },
}

async function demarrer(ia, modele) {
  const s = creerServeur(
    {
      secret: 's'.repeat(32),
      jetonInterne: JETON,
      collaboration: 'ws://x',
      collaborationApi: `http://127.0.0.1:${PORT_COLLAB}/collaboration`,
      statique: '/nulle-part',
      dev: true,
      margoModele: modele,
    },
    { comptes, commentaires: depot, ia },
  )
  await new Promise((r) => s.listen(0, '127.0.0.1', r))
  return s
}

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
  serveur = await demarrer(iaSimulee, 'deepseek-v4.1-flash-1017')
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
  for (const nom of ['Paule', 'Carla', 'Lucie']) {
    const r = await fetch(`${base}/api/dev/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nom }),
    })
    cookies[nom] = { id: (await r.json()).id, cookie: r.headers.get('set-cookie').split(';')[0] }
  }
})
after(async () => {
  await collab?.fermer()
  serveur?.closeAllConnections?.()
  serveur?.close()
  await depot?.fermer()
  await comptes?.fermer()
})

const t3 = (nom, f) => test(nom, (t) => (raisonSaut ? t.skip(raisonSaut) : f(t)))

let compteur = 0
async function nouveauDocument(blocs) {
  const doc = `t3-margo-${Date.now().toString(36)}-${compteur++}`
  await comptes.creerDocument(doc, cookies.Paule.id)
  await comptes.donnerAcces(doc, cookies.Carla.id, 'correcteur')
  await comptes.donnerAcces(doc, cookies.Lucie.id, 'lecteur')
  await interne.ecrireTexte(doc, ecrireBlocs(blocs), cookies.Paule.id)
  return doc
}

/** Une demande à Margo ; rend le statut et les événements du flux. */
async function demander(doc, qui, corps, adresse = base) {
  const r = await fetch(`${adresse}/api/documents/${doc}/margo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookies[qui].cookie },
    body: JSON.stringify(corps),
  })
  const texte = await r.text()
  if (!r.ok) return { statut: r.status, code: JSON.parse(texte).code }
  return {
    statut: r.status,
    evenements: texte
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l)),
  }
}

const fin = (evenements) => evenements.find((e) => e.type === 'fin')

const LIVRE = [
  { id: 'b1', type: 'heading', props: { level: 1 }, content: 'Chapitre premier' },
  { id: 'b2', type: 'paragraph', content: 'Les enfant jouent dans la cour.' },
  { id: 'b3', type: 'paragraph', content: 'Il faisait nuit sur la ville.' },
]

t3('droits : ni le correcteur ni le lecteur ; une demande vide ou « Corriger » sans sélection refusées', async () => {
  const doc = await nouveauDocument(LIVRE)
  assert.deepEqual(await demander(doc, 'Carla', { demande: 'Corrige' }), { statut: 403, code: 'droit-insuffisant' })
  assert.deepEqual(await demander(doc, 'Lucie', { demande: 'Corrige' }), { statut: 403, code: 'droit-insuffisant' })
  assert.deepEqual(await demander(doc, 'Paule', { demande: '  ' }), { statut: 400, code: 'demande-invalide' })
  assert.deepEqual(await demander(doc, 'Paule', { corriger: true }), { statut: 400, code: 'selection-absente' })
  assert.deepEqual(await demander('t3-margo-inconnu', 'Paule', { demande: 'x' }), {
    statut: 404,
    code: 'document-introuvable',
  })
})

t3('sans le modèle configuré (clé absente) : 503 margo-indisponible', async () => {
  const s = await demarrer(iaSimulee, 'claude-haiku-5-5')
  try {
    const doc = await nouveauDocument(LIVRE)
    const r = await demander(doc, 'Paule', { demande: 'Corrige' }, `http://127.0.0.1:${s.address().port}`)
    assert.deepEqual(r, { statut: 503, code: 'margo-indisponible' })
  } finally {
    s.closeAllConnections?.()
    s.close()
  }
})

t3('une correction devient une suggestion signée margo ; le texte principal ne change pas', async () => {
  const doc = await nouveauDocument(LIVRE)
  let resultat = null
  scenario = [
    () => ({ appels: [{ id: 'a1', nom: 'lire', entree: { de: 1, a: 3 } }] }),
    (e) => {
      assert.match(e.resultats[0].contenu, /\[1\] \(titre 1\) Chapitre premier\n\[2\] Les enfant jouent/)
      return {
        appels: [
          {
            id: 'a2',
            nom: 'proposer',
            entree: {
              corrections: [
                { bloc: 2, avant: 'Les enfant', apres: 'Les enfants' },
                { bloc: 3, avant: 'nuit', apres: 'nuit' },
                { bloc: 9, avant: 'x', apres: 'y' },
              ],
            },
          },
        ],
      }
    },
    (e) => ((resultat = e.resultats[0].contenu), { texte: 'J’ai corrigé [2].' }),
  ]
  const r = await demander(doc, 'Paule', { demande: 'Corrige les fautes' })
  assert.equal(r.statut, 200)
  assert.deepEqual(r.evenements[0], { type: 'debut', blocs: ['b1', 'b2', 'b3'] })
  assert.deepEqual(
    r.evenements.filter((e) => e.type === 'etape').map((e) => e.outil),
    ['lire', 'proposer'],
  )
  assert.deepEqual(
    r.evenements.find((e) => e.type === 'texte'),
    { type: 'texte', texte: 'J’ai corrigé [2].' },
  )
  assert.deepEqual(fin(r.evenements), { type: 'fin', arret: 'fin', corrections: 1, commentaires: 0, refus: 2 })
  assert.match(resultat, /^1\. posée\n2\. refusé : le nouveau texte est identique.*\n3\. refusé : ce numéro de bloc/)
  // Le texte principal est intact ; les suggestions portent la correction.
  const principal = await interne.lireTexte(doc)
  const suggestions = await interne.lireSuggestions(doc)
  assert.equal(blocsATexteDe(principal)[1].texte, 'Les enfant jouent dans la cour.')
  assert.equal(blocsATexteDe(principal, suggestions)[1].texte, 'Les enfants jouent dans la cour.')
  // y/hub attribue l'ajout à margo.
  const changements = await fetch(
    `http://127.0.0.1:${PORT_COLLAB}/collaboration/changeset/v1/amend/${doc}?branch=suggestions&attributions=true`,
    { headers: { cookie: cookies.Paule.cookie, accept: 'application/json' } },
  )
  assert.equal(changements.status, 200)
  const { attributions } = await changements.json()
  const carte = Y.decodeContentMap(Uint8Array.from(atob(attributions), (c) => c.charCodeAt(0)))
  assert.match(
    JSON.stringify(carte, (k, v) => (v instanceof Map ? [...v] : v)),
    /margo/,
  )
  // La consigne nomme la personne et la portée.
  assert.match(requetes.at(-1).consigne, /Tu aides Paule/)
  assert.match(requetes.at(-1).consigne, /tout le texte/)
})

t3(
  '« Corriger » sur une sélection : la consigne et le passage partent dans le premier message ; typographie appliquée',
  async () => {
    const doc = await nouveauDocument(LIVRE)
    scenario = [
      (e) => {
        assert.match(e.texte, /Passage sélectionné par la personne :\n\[3\] Il faisait nuit/)
        assert.match(e.texte, /Demande de Paule : Corrige ce passage/)
        assert.doesNotMatch(e.texte, /\[2\]/)
        return {
          appels: [
            {
              id: 'p',
              nom: 'proposer',
              entree: { corrections: [{ bloc: 3, avant: 'sur la ville.', apres: 'sur la ville ; enfin.' }] },
            },
          ],
        }
      },
    ]
    const r = await demander(doc, 'Paule', { corriger: true, selection: { de: 'b3', a: 'b3' } })
    assert.equal(fin(r.evenements).corrections, 1)
    assert.match(requetes.at(-2).consigne, /les blocs 3 à 3/)
    const t = blocsATexteDe(await interne.lireTexte(doc), await interne.lireSuggestions(doc))[2].texte
    assert.equal(t, `Il faisait nuit sur la ville${ESPACE_FINE}; enfin.`)
  },
)

t3(
  'un commentaire : un fil signé margo, ancré dans le texte principal ; une citation introuvable est refusée',
  async () => {
    const doc = await nouveauDocument(LIVRE)
    scenario = [
      () => ({
        appels: [
          { id: 'c1', nom: 'commenter', entree: { bloc: 3, citation: 'nuit', texte: 'Pourquoi la nuit ?' } },
          { id: 'c2', nom: 'commenter', entree: { bloc: 3, citation: 'jour', texte: 'x' } },
        ],
      }),
    ]
    const r = await demander(doc, 'Paule', { demande: 'Commente' })
    assert.deepEqual(fin(r.evenements), { type: 'fin', arret: 'fin', corrections: 0, commentaires: 1, refus: 1 })
    const fils = await depot.fils(doc)
    assert.equal(fils.length, 1)
    assert.equal(fils[0].comments[0].userId, 'margo')
    assert.equal(fils[0].comments[0].body[0].content, `Pourquoi la nuit${ESPACE_FINE}?`)
    const d = new Y.Doc()
    Y.applyUpdate(d, await interne.lireTexte(doc))
    assert.ok(JSON.stringify(d.get('doc').toDeltaDeep()).includes(fils[0].id), 'la marque du fil est dans le texte')
    // Le nom de Margo se traduit dans l'interface : le serveur rend un code.
    const noms = await fetch(`${base}/api/personnes?id=margo`, { headers: { cookie: cookies.Paule.cookie } })
    assert.deepEqual(await noms.json(), [{ id: 'margo', nom: null, agent: 'margo' }])
  },
)

t3('refus en série : avertie au cinquième, arrêtée au dixième sur un bilan sans suite', async () => {
  const doc = await nouveauDocument(LIVRE)
  const mauvais = () => ({
    appels: [{ id: 'x', nom: 'proposer', entree: { corrections: [{ bloc: 2, avant: 'absent', apres: 'y' }] } }],
  })
  const entrees = []
  scenario = Array.from({ length: 12 }, () => (e) => (entrees.push(e), mauvais()))
  const r = await demander(doc, 'Paule', { demande: 'Corrige' })
  assert.equal(fin(r.evenements).arret, 'refus-en-serie')
  assert.equal(fin(r.evenements).refus, 10)
  assert.match(entrees[5].texte, /tes 5 dernières écritures/)
  assert.match(entrees[10].texte, /la demande s’arrête/)
  assert.equal(entrees.length, 11, 'un dernier tour pour le bilan, puis plus rien')
})

t3('le modèle choisi au back-office s’impose à celui de l’environnement', async (t) => {
  const sql = postgres(POSTGRES, { max: 1, onnotice: () => {} })
  t.after(async () => {
    await sql`delete from amend.reglages where cle = 'margo.modele'`
    await sql.end()
  })
  await comptes.definirReglage('margo.modele', 'claude-sonnet-5-5', cookies.Paule.id)
  const doc = await nouveauDocument(LIVRE)
  scenario = [() => ({ texte: 'Oui.' })]
  const avant = requetes.length
  await demander(doc, 'Paule', { demande: 'Bonjour' })
  assert.deepEqual(
    requetes.slice(avant).map((q) => q.modele),
    ['claude-sonnet-5-5'],
  )
})

t3('le modèle refuse : le modèle par défaut reprend la demande', async () => {
  const s = await demarrer(iaSimulee, 'claude-fable-5-2')
  try {
    const doc = await nouveauDocument(LIVRE)
    scenario = [(e, modele) => (modele === 'claude-fable-5-2' ? { arret: 'refus' } : { texte: 'Repris.' })]
    const avant = requetes.length
    const r = await demander(doc, 'Paule', { demande: 'Corrige' }, `http://127.0.0.1:${s.address().port}`)
    assert.ok(r.evenements.some((e) => e.type === 'repli'))
    assert.deepEqual(
      requetes.slice(avant).map((q) => q.modele),
      ['claude-fable-5-2', 'deepseek-v4.1-flash-1017'],
    )
    assert.equal(fin(r.evenements).arret, 'fin')
  } finally {
    s.closeAllConnections?.()
    s.close()
  }
})

test('essai réel avec DeepSeek (MARGO_ESSAI_REEL=1) : une faute corrigée en suggestion', async (t) => {
  if (raisonSaut) return t.skip(raisonSaut)
  if (process.env.MARGO_ESSAI_REEL !== '1') return t.skip('essai réel non demandé (MARGO_ESSAI_REEL=1)')
  const s = await demarrer(creerIA({ cleScaleway: 'injectee-par-le-proxy' }), 'deepseek-v4.1-flash-1017')
  try {
    const doc = await nouveauDocument(LIVRE)
    const r = await demander(
      doc,
      'Paule',
      { corriger: true, selection: { de: 'b2', a: 'b2' } },
      `http://127.0.0.1:${s.address().port}`,
    )
    console.log(JSON.stringify(r.evenements))
    assert.ok(fin(r.evenements).corrections >= 1)
    const t2 = blocsATexteDe(await interne.lireTexte(doc), await interne.lireSuggestions(doc))[1].texte
    assert.equal(t2, 'Les enfants jouent dans la cour.')
  } finally {
    s.closeAllConnections?.()
    s.close()
  }
})

t3('échanges précédents : bornés en signes, les plus récents gardés (audit A2)', async () => {
  const doc = await nouveauDocument(LIVRE)
  let premier = null
  scenario = [(e) => ((premier = e.texte), { texte: 'Vu.' })]
  const long = 'x'.repeat(15_000)
  const historique = [
    { auteur: 'personne', texte: `ANCIEN ${long}` },
    { auteur: 'margo', texte: `RECENT ${long}` },
    { auteur: 'personne', texte: 'DERNIER' },
    { auteur: 'pirate', texte: 'IGNORE' },
  ]
  const r = await demander(doc, 'Paule', { demande: 'Suite', historique })
  assert.equal(fin(r.evenements).arret, 'fin')
  assert.match(premier, /RECENT/)
  assert.match(premier, /DERNIER/)
  assert.doesNotMatch(premier, /ANCIEN|IGNORE/)
})
