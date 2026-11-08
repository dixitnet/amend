// T1 : règles du domaine, rejouées sur les données piégées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { identifiantDocument, nomPersonne } from '../../domaine/index.js'
import piegees from '../donnees/piegees.json' with { type: 'json' }

test('identifiant de document : cas nominaux', () => {
  assert.deepEqual(identifiantDocument('essai'), { ok: true, id: 'essai' })
  assert.deepEqual(identifiantDocument('  livre-2_a  '), { ok: true, id: 'livre-2_a' })
})

test('identifiant de document : tout ce qui est piégé est refusé avec un code', () => {
  const acceptes = new Set(['doc1'])
  for (const { texte, raison } of piegees.identifiantsDeDocument) {
    const r = identifiantDocument(texte)
    if (acceptes.has(texte)) assert.equal(r.ok, true, raison)
    else {
      assert.equal(r.ok, false, `${raison} : ${JSON.stringify(texte)} devrait être refusé`)
      assert.match(r.code, /^document-(vide|trop-long|caracteres)$/)
    }
  }
  assert.equal(identifiantDocument(null).code, 'document-vide')
  assert.equal(identifiantDocument('a'.repeat(64)).ok, true)
  assert.equal(identifiantDocument('a'.repeat(65)).code, 'document-trop-long')
})

test('nom : NFC, espaces resserrés, emojis composés permis', () => {
  assert.deepEqual(nomPersonne('  Alice   Martin '), { ok: true, nom: 'Alice Martin' })
  assert.equal(nomPersonne('e\u0301te\u0301').nom, 'été')
  assert.equal(nomPersonne('👩🏽\u200D💻').ok, true)
})

test('nom : données piégées', () => {
  const attendu = {
    Alice: 'ok',
    'e\u0301te\u0301': 'ok',
    '👩🏽\u200D💻': 'ok',
    ['A'.repeat(1000)]: 'nom-trop-long',
    'Alice<script>alert(1)</script>': 'ok', // un nom est du texte : React l'échappe (T4)
    'Alice\u0000Null': 'nom-caracteres',
    '   ': 'nom-vide',
    '\u0301': 'nom-caracteres',
    'Zoë\u200B': 'nom-caracteres',
  }
  for (const { texte, raison } of piegees.noms) {
    const r = nomPersonne(texte)
    assert.equal(r.ok ? 'ok' : r.code, attendu[texte], raison)
  }
})

test('nom : trait d’union conditionnel et opérateurs invisibles refusés, liant des emojis permis', () => {
  for (const c of ['\u00AD', '\u2061', '\u2062', '\u2063', '\u2064'])
    assert.equal(nomPersonne(`Ali${c}ce`).code, 'nom-caracteres', JSON.stringify(c))
  assert.equal(nomPersonne('👩🏽\u200D💻').ok, true)
})
