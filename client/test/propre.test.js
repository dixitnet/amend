// Des exports propres (24/10/2026) : un accent est un seul caractère (NFC) dans
// tout ce qui sort d'amend.ink — Markdown, Word, PDF, page publiée, noms de
// fichier — et dans ce qu'on colle. Le texte de l'éditeur, lui, n'est pas touché.

import test from 'node:test'
import assert from 'node:assert/strict'
import { schema } from '../src/schema.js'
import { documentPourExport, FINAL } from '../src/exportVariante.js'
import { docToMarkdown } from '../src/mdExport.js'
import { docToTypst } from '../src/typstExport.js'
import { docPourPublication } from '../src/publicationExport.js'
import { nomDeFichier } from '../src/exportCommun.js'
import { typographierFragment } from '../src/typographie.js'
import { Fragment } from 'prosemirror-model'
import { nfc } from '../../shared/propre.js'

const NFD = 'cohérence de l’aménagement'
const NFC = 'cohérence de l’aménagement'

const monDoc = () =>
  schema.node('doc', null, [
    schema.node('heading', { level: 1 }, [schema.text('Aménager')]),
    schema.node('paragraph', null, [schema.text(NFD)]),
  ])

const aDesSignesCombinants = (s) => /[̀-ͯ]/.test(s)

test('nfc : accent en deux signes → un seul ; le reste est intact', () => {
  assert.notEqual(NFD, NFC)
  assert.equal(nfc(NFD), NFC)
  assert.equal(nfc(NFC), NFC)
  assert.equal(nfc(null), '')
})

test('le document exporté est en NFC, l’original n’est pas modifié', () => {
  const doc = monDoc()
  const sortie = documentPourExport(doc, FINAL)
  assert.equal(sortie.child(1).textContent, NFC)
  assert.equal(sortie.child(0).textContent, 'Aménager')
  assert.equal(doc.child(1).textContent, NFD)
})

test('Markdown : aucun signe combinant', () => {
  const md = docToMarkdown(documentPourExport(monDoc(), FINAL))
  assert.ok(md.includes(NFC))
  assert.ok(!aDesSignesCombinants(md))
})

test('PDF (source Typst) : texte et titre en NFC', () => {
  const src = docToTypst(documentPourExport(monDoc(), FINAL), null, 'Chronique de l’aménagement')
  assert.ok(src.includes(NFC))
  assert.ok(!aDesSignesCombinants(src))
})

test('page publiée : le modèle envoyé au serveur est en NFC', () => {
  const blocs = docPourPublication(monDoc())
  assert.ok(!aDesSignesCombinants(JSON.stringify(blocs)))
})

test('nom de fichier en NFC', () => {
  assert.equal(nomDeFichier('Été 2026'), 'Été 2026')
})

test('texte collé : en NFC, avant la typographie', () => {
  const frag = Fragment.from(schema.node('paragraph', null, [schema.text(NFD)]))
  const sortie = typographierFragment(frag)
  assert.equal(sortie.child(0).textContent, NFC)
})
