// Ce qui vient du document partagé n'est pas de confiance (audit du
// 10/10/2026, C1, C2, C13, C20) : un participant peut écrire ce qu'il veut
// dans la structure Yjs sans passer par l'interface. On vérifie que ni une
// couleur, ni une adresse d'image, ni un nom ne sortent de leur case.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { DOMSerializer } from 'prosemirror-model'
import { couleurSure, imageAutorisee, echapperHtml } from '../../shared/securite.js'
import { libelleCourt } from '../../shared/liens.js'
import { schema } from '../src/schema.js'

const { window } = new JSDOM('<!doctype html><body></body>')
const serialiser = (noeud) => {
  const frag = DOMSerializer.fromSchema(schema).serializeFragment(
    schema.node('doc', null, [noeud]).content,
    { document: window.document }
  )
  const div = window.document.createElement('div')
  div.appendChild(frag)
  return div.innerHTML
}

test('couleurSure : seules les couleurs hexadécimales passent', () => {
  for (const ok of ['#e07a5f', '#abc', '#AABBCC', '#aabbccdd']) assert.equal(couleurSure(ok), ok)
  for (const mauvaise of [
    'red;background:url(https://x/t.gif)',
    'url(https://x/t.gif)',
    '#fff;position:fixed;inset:0',
    'var(--accent)',
    'red',
    '',
    null,
    undefined,
    42,
    { toString: () => '#fff' },
  ]) {
    assert.equal(couleurSure(mauvaise), '#888888', String(mauvaise))
  }
  assert.equal(couleurSure('red', '#000000'), '#000000')
})

test('imageAutorisee : seulement les images de ce serveur', () => {
  assert.equal(imageAutorisee('/api/docs/abc_DEF-1/images/Zx9-_aB.png'), true)
  assert.equal(imageAutorisee('/api/docs/abc/images/photo.jpg'), true)
  for (const mauvaise of [
    'https://tiers.example/pixel.png',
    '//tiers.example/pixel.png',
    '/api/docs/abc/images/../../secret.png',
    '/api/docs/abc/images/x.svg',
    'data:image/png;base64,AAAA',
    'javascript:alert(1)',
    '',
    null,
    undefined,
  ]) {
    assert.equal(imageAutorisee(mauvaise), false, String(mauvaise))
  }
})

test("echapperHtml accepte n'importe quelle valeur", () => {
  assert.equal(echapperHtml('<b>"a"&\'</b>'), '&lt;b&gt;&quot;a&quot;&amp;&#39;&lt;/b&gt;')
  assert.equal(echapperHtml(undefined), '')
  assert.equal(echapperHtml(null), '')
  assert.equal(echapperHtml({ x: 1 }), '[object Object]')
  assert.equal(echapperHtml(12), '12')
})

test("une marque de suivi dont la couleur est piégée n'écrit aucun CSS étranger", () => {
  const piege = 'red;background:url(https://x/t.gif);position:fixed;inset:0'
  for (const marque of ['insertion', 'deletion']) {
    const texte = schema.text('Bonjour', [schema.mark(marque, { user: 'Mallory', userColor: piege, ts: 1 })])
    const html = serialiser(schema.node('paragraph', null, [texte]))
    assert.ok(!html.includes('url('), marque)
    assert.ok(!html.includes('position'), marque)
    assert.match(html, /--user-color: ?#888888/)
  }
  const auteur = schema.text('Bonjour', [schema.mark('authorColor', { user: 'Mallory', userColor: piege })])
  const html = serialiser(schema.node('paragraph', null, [auteur]))
  assert.ok(!html.includes('url('))
  assert.match(html, /--author-color: ?#888888/)
})

test("une image dont l'adresse n'est pas celle du serveur n'est jamais chargée", () => {
  const externe = schema.node('image', { src: 'https://tiers.example/pixel.png', alt: 'x' })
  const html = serialiser(externe)
  assert.ok(!html.includes('tiers.example'))
  assert.ok(!html.includes('<img'))
  const propre = schema.node('image', { src: '/api/docs/abc/images/photo.png', alt: 'x' })
  assert.match(serialiser(propre), /<img src="\/api\/docs\/abc\/images\/photo\.png"/)
})

test('libelleCourt ne plante pas sur un mailto mal formé (C20)', () => {
  assert.doesNotThrow(() => libelleCourt('mailto:a%E0@example.com'))
})
