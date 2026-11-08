// T2 : l'adaptateur BlockNote côté serveur, sans navigateur ni service.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from '@y/y'
import { lireBlocs, ecrireBlocs, texteDesBlocs } from '../../adaptateurs/blocknote/serveur.js'
import piegees from '../donnees/piegees.json' with { type: 'json' }

test('aller-retour : un paragraphe écrit est relu à l’identique', () => {
  const etat = ecrireBlocs([{ type: 'paragraph', content: 'Bonjour, élégance.' }])
  assert.equal(texteDesBlocs(lireBlocs(etat)), 'Bonjour, élégance.')
})

test('aller-retour des textes piégés, un par paragraphe', () => {
  for (const { texte, raison } of piegees.textes) {
    const lu = texteDesBlocs(lireBlocs(ecrireBlocs([{ type: 'paragraph', content: texte }])))
    // Le texte d'un paragraphe ne garde pas les sauts de ligne bruts : on
    // compare sans eux ; tout le reste doit être conservé tel quel.
    assert.equal(lu.replace(/\n/g, ''), texte.replace(/\n/g, ''), raison)
  }
})

test('document vide, et document jamais écrit : aucun bloc, aucune erreur', () => {
  assert.deepEqual(texteDesBlocs(lireBlocs(ecrireBlocs([]))), '')
  assert.equal(texteDesBlocs(lireBlocs(Y.encodeStateAsUpdate(new Y.Doc()))), '')
})

test('état illisible : erreur de code document-illisible', () => {
  assert.throws(() => lireBlocs(new Uint8Array([1, 2, 3, 250, 251])), { code: 'document-illisible' })
})
