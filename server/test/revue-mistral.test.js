// La revue automatique par Mistral (tools/revue-mistral.mjs) : ce qui décide de
// ce qui part, de ce qui est retenu et de ce qui est écrit — sans jamais appeler
// le vrai service.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONSIGNE,
  LOT_OCTETS,
  demander,
  fichiersASoumettre,
  fichiersAvecCle,
  lots,
  messageUtilisateur,
  rapport,
  verifier,
} from '../../tools/revue-mistral.mjs'

const TRACKES = [
  'server/auth.js',
  'server/test/auth.test.js',
  'server/routes/ia.js',
  'client/src/editor.js',
  'client/src/fonts/x.js',
  'client/src/style.css',
  'deploy/deploy.sh',
  'deploy/Caddyfile.exemple',
  'tools/loadtest.js',
  'README.md',
  'package-lock.json',
  '.env.example',
]
const gitFactice =
  (reponses) =>
  (...a) => {
    const cle = a[0] === 'log' || a[0] === 'diff' ? a[0] : a.join(' ')
    return reponses[cle] ?? ''
  }

test('la sélection : le code de l’application, jamais les tests, les polices, les données ni les secrets', () => {
  const git = gitFactice({ 'ls-files': TRACKES.join('\n') })
  const tout = fichiersASoumettre({ tout: true }, git)
  assert.deepEqual(tout, [
    'server/auth.js',
    'server/routes/ia.js',
    'client/src/editor.js',
    'deploy/deploy.sh',
    'deploy/Caddyfile.exemple',
    'tools/loadtest.js',
  ])
  assert.deepEqual(fichiersASoumettre({ tout: true, dossier: 'deploy/' }, git), [
    'deploy/deploy.sh',
    'deploy/Caddyfile.exemple',
  ])
})

test('par défaut : ce qui a changé depuis le dernier repère, plus ce qui n’est pas encore commité', () => {
  const git = gitFactice({
    'ls-files': TRACKES.join('\n'),
    diff: 'server/auth.js\nREADME.md\nserver/test/auth.test.js',
    'status --porcelain': ' M tools/loadtest.js\n?? revue-2026-10-16.md',
  })
  assert.deepEqual(fichiersASoumettre({ depuis: 'abc123' }, git), ['server/auth.js', 'tools/loadtest.js'])
  const parJours = gitFactice({ 'ls-files': TRACKES.join('\n'), log: 'deploy/deploy.sh\n\nserver/routes/ia.js' })
  assert.deepEqual(fichiersASoumettre({ jours: 7 }, parJours), ['server/routes/ia.js', 'deploy/deploy.sh'])
})

test('les requêtes se découpent par taille, dans l’ordre des dossiers', () => {
  const taille = (f) => (f === 'gros' ? LOT_OCTETS + 1 : LOT_OCTETS / 2)
  // triés par nom : a et b tiennent ensemble, c et d aussi, le fichier trop gros part seul
  assert.deepEqual(lots(['a', 'b', 'c', 'gros', 'd'], taille), [['a', 'b'], ['c', 'd'], ['gros']])
  assert.deepEqual(lots([], taille), [])
})

test('un motif de clé arrête l’envoi, sans jamais rendre la clé', () => {
  const fausseCle = `sk-ant-${'a1B2'.repeat(8)}`
  const contenus = { 'a.js': `const k = '${fausseCle}'`, 'b.js': 'export const x = 1' }
  assert.deepEqual(fichiersAvecCle(contenus), ['a.js'])
  assert.deepEqual(fichiersAvecCle({ 'b.js': 'MISTRAL_API_KEY = process.env.MISTRAL_API_KEY' }), [])
})

test('un constat dont la citation n’existe pas dans le fichier est jeté', () => {
  const contenus = { 'server/a.js': 'function lire(x) {\n  return   eval(x)\n}\n' }
  const bon = { fichier: 'server/a.js', ligne: 2, citation: 'return eval(x)' } // espaces comptés pour rien
  const invente = { fichier: 'server/a.js', ligne: 9, citation: 'db.query(sql + entree)' }
  const autreFichier = { fichier: 'server/b.js', ligne: 1, citation: 'return eval(x)' }
  const courte = { fichier: 'server/a.js', ligne: 1, citation: 'x' }
  const r = verifier([bon, invente, autreFichier, courte, null], contenus)
  assert.deepEqual(r.gardes, [bon])
  assert.equal(r.jetes, 4)
  assert.deepEqual(verifier('pas une liste', contenus), { gardes: [], jetes: 0 })
})

test('le message numérote les lignes et sépare les fichiers', () => {
  const m = messageUtilisateur({ 'a.js': 'un\ndeux', 'b.js': 'trois' })
  assert.match(m, /===== a\.js =====\n1\| un\n2\| deux\n\n===== b\.js =====\n1\| trois/)
  assert.match(CONSIGNE, /Réponds par un objet JSON/)
})

test('l’appel : clé en en-tête, réponse JSON lue, erreur du service dite sans la clé ni le code envoyé', async () => {
  let vu
  const requete = async (url, init) => {
    vu = { url, init, corps: JSON.parse(init.body) }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ constats: [{ fichier: 'a.js', citation: 'xxxxxxxx' }] }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    }
  }
  const r = await demander(
    {
      modele: 'mistral-large-4-0',
      cle: 'CLE-DE-TEST',
      url: 'http://faux/v1/chat/completions',
      contenus: { 'a.js': 'secret()' },
    },
    requete
  )
  assert.equal(r.constats.length, 1)
  assert.equal(r.usage.prompt_tokens, 10)
  assert.equal(vu.init.headers.authorization, 'Bearer CLE-DE-TEST')
  assert.equal(vu.corps.model, 'mistral-large-4-0')
  assert.deepEqual(vu.corps.response_format, { type: 'json_object' })

  const refus = async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' })
  await assert.rejects(
    demander({ modele: 'm', cle: 'CLE-DE-TEST', url: 'http://faux', contenus: { 'a.js': 'secret()' } }, refus),
    (e) => /401/.test(e.message) && !/CLE-DE-TEST/.test(e.message) && !/secret\(\)/.test(e.message)
  )

  const illisible = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'pas du json' } }] }),
  })
  const r2 = await demander({ modele: 'm', cle: 'c', url: 'http://faux', contenus: {} }, illisible)
  assert.deepEqual(verifier(r2.constats, {}), { gardes: [], jetes: 0 })
})

test('le rapport met le plus grave en tête et dit combien de constats ont été jetés', () => {
  const c = (gravite, n) => ({
    gravite,
    fichier: `f${n}.js`,
    ligne: n,
    categorie: 'securite',
    citation: 'x()',
    probleme: 'p',
    scenario: 's',
    correctif: 'c',
  })
  const md = rapport({
    date: '2026-10-16',
    modele: 'mistral-large-4-0',
    fichiers: ['f1.js', 'f2.js'],
    constats: [c('mineure', 1), c('critique', 2)],
    jetes: 3,
    jetons: { entree: 1000, sortie: 200 },
    cout: 0.0272,
  })
  assert.ok(md.indexOf('f2.js:2') < md.indexOf('f1.js:1'))
  assert.match(md, /2 fichier\(s\) relus · 2 constat\(s\) vérifié\(s\) · 3 jeté\(s\)/)
  assert.match(md, /≈ 0\.03 \$/)
})
