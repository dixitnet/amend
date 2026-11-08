// T1 : la typographie française (domaine/typographie.js), règle par règle,
// puis ses principes (idempotence, ne fait que transformer, existant respecté,
// zones protégées, langue) et la frappe caractère par caractère.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { typographier, saisie, ESPACE_INSECABLE as I, ESPACE_FINE as F } from '../../domaine/index.js'

test('les cinq règles, une à une', () => {
  assert.equal(typographier("l'été"), 'l’été')
  assert.equal(typographier('Il dit "oui".'), `Il dit «${I}oui${I}».`)
  assert.equal(typographier('Fin...'), 'Fin…')
  assert.equal(typographier('Vraiment ? Oui ! Et ; puis'), `Vraiment${F}? Oui${F}! Et${F}; puis`)
  assert.equal(typographier('Note : ici'), `Note${I}: ici`)
})

test('guillemets : ouverture et fermeture selon ce qui précède', () => {
  assert.equal(typographier('"Début'), `«${I}Début`)
  assert.equal(typographier('("cité")'), `(«${I}cité${I}»)`)
  assert.equal(typographier('— "réplique"'), `— «${I}réplique${I}»`)
  assert.equal(typographier('fin"', { avant: 'x' }), `fin${I}»`)
  assert.equal(typographier('"suite', { avant: ' ' }), `«${I}suite`)
  assert.equal(typographier('"suite', { avant: 'x' }), `${I}»suite`)
  assert.equal(typographier('« mot »'), `«${I}mot${I}»`)
})

test('idempotente', () => {
  for (const x of ["l'été", '"a" ; b : c ?', 'Fin... !', '« x »', 'http://a.b/?q=1', `déjà${I}: ok`])
    assert.equal(typographier(typographier(x)), typographier(x), x)
})

test('ne fait que transformer : rien devant un signe tapé collé', () => {
  for (const x of ['mot;', 'mot:', 'mot?', 'mot!']) assert.equal(typographier(x), x)
})

test('respecte l’existant correct', () => {
  for (const x of [`a${F}?`, `a${I}?`, `a${I}:`, `a${F}:`, `«${I}x${I}»`]) assert.equal(typographier(x), x)
})

test('adresses, courriels et signes qui ne sont pas de la ponctuation : intacts', () => {
  for (const x of [
    'http://exemple.org/l\'été?x=1&y="z"',
    "www.exemple.fr/d'accord",
    'jean.dupont@exemple.fr',
    '12:30',
    'a != b',
    'voir ?param',
    'sourire :)',
    'clin ;)',
  ])
    assert.equal(typographier(x), x, x)
  assert.equal(typographier("Écrire à jean@x.fr : c'est fait"), `Écrire à jean@x.fr${I}: c’est fait`)
})

test('hors du français, rien ne change', () => {
  for (const langue of ['en', 'de', '']) assert.equal(typographier('"a" : b ?', { langue }), '"a" : b ?')
  assert.equal(saisie('a ', '?', { langue: 'en' }), null)
})

test('entrées étranges : jamais d’erreur', () => {
  for (const x of [null, undefined, 42, '', '\u0000', '"'.repeat(1000), '.'.repeat(1000)])
    assert.equal(typeof typographier(x), 'string')
  assert.equal(typographier('.'.repeat(9)), '………')
  // Le caractère qui précède sert de contexte, jamais de matière à remplacer.
  assert.equal(typographier('..', { avant: '.' }), '..')
  assert.equal(typographier(' ; x', { avant: 'a' }), `${F}; x`)
})

test('frappe : chaque règle au moment où l’on tape', () => {
  assert.deepEqual(saisie('l', "'"), { retirer: 0, ecrire: '’' })
  assert.deepEqual(saisie('il dit ', '"'), { retirer: 0, ecrire: `«${I}` })
  assert.deepEqual(saisie('oui', '"'), { retirer: 0, ecrire: `${I}»` })
  assert.deepEqual(saisie('Fin..', '.'), { retirer: 2, ecrire: '…' })
  assert.deepEqual(saisie('Quoi ', '?'), { retirer: 1, ecrire: `${F}?` })
  assert.deepEqual(saisie('Note ', ':'), { retirer: 1, ecrire: `${I}:` })
})

test('frappe : rien hors des signes concernés, ni collé, ni dans une adresse', () => {
  assert.equal(saisie('mot', ';'), null)
  assert.equal(saisie('mot', 'a'), null)
  assert.equal(saisie('mot', '..'), null)
  assert.equal(saisie('http://exemple.org/l', "'"), null)
  assert.equal(saisie('voir www.exemple.fr/d', "'"), null)
  assert.equal(saisie('12', ':'), null)
})

test('frappe : un texte ancien non typographié n’empêche pas la frappe en cours, et n’est pas réécrit', () => {
  const r = saisie('ancien "texte" ... et puis ', '?')
  assert.deepEqual(r, { retirer: 1, ecrire: `${F}?` })
})
