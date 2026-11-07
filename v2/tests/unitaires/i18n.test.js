// Traductions (règles 23 à 31, ADR 0009).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGUES, LANGUES, LANGUE_SOURCE, cles, creerTraducteur, choisirLangue } from '../../i18n/index.js'
import exceptions from '../../i18n/exceptions.json' with { type: 'json' }

const valeur = (cat, cle) => cle.split('.').reduce((v, k) => v?.[k], cat)

test('chaque langue a exactement les clés du français', () => {
  const source = cles(CATALOGUES[LANGUE_SOURCE]).sort()
  for (const l of LANGUES) assert.deepEqual(cles(CATALOGUES[l]).sort(), source, `clés de ${l}`)
})

test('aucun texte d’attente, aucune recopie du français hors exceptions', () => {
  for (const l of LANGUES.filter((x) => x !== LANGUE_SOURCE))
    for (const cle of cles(CATALOGUES[l])) {
      const texte = valeur(CATALOGUES[l], cle)
      assert.ok(texte.trim(), `${l}:${cle} vide`)
      assert.doesNotMatch(texte, /\b(TODO|FIXME|XXX)\b/, `${l}:${cle} en attente`)
      if (!exceptions.identiques.includes(cle))
        assert.notEqual(texte, valeur(CATALOGUES[LANGUE_SOURCE], cle), `${l}:${cle} recopie le français`)
    }
})

test('le pluriel et les paramètres nommés passent par ICU', () => {
  const t = creerTraducteur('fr')
  assert.equal(t('document.participants', { n: 0 }), 'Personne d’autre sur ce document')
  assert.equal(t('document.participants', { n: 1 }), '1 autre personne sur ce document')
  assert.equal(t('document.participants', { n: 2 }), '2 autres personnes sur ce document')
  assert.equal(creerTraducteur('en')('document.participants', { n: 2 }), '2 other people on this document')
})

test('langue : préférences, repli sur le français', () => {
  assert.equal(choisirLangue(['en-GB', 'fr']), 'en')
  assert.equal(choisirLangue(['de-DE']), 'fr')
  assert.equal(creerTraducteur('de').langue, 'fr')
  assert.throws(() => creerTraducteur('fr')('cle.inexistante'), /clé de traduction inconnue/)
})

test('le nom amend.ink ne se traduit pas', () => {
  for (const l of LANGUES) assert.equal(CATALOGUES[l].application.nom, 'amend.ink')
})
