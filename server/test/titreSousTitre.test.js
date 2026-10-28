// Les styles « Titre » et « Sous-titre » (14/10/2026), côté serveur : la page
// publiée les rend avec deux classes fixes (jamais la valeur du client), et
// la lecture d'un agent (Margo, « Inviter Claude ») les signale.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { NOM_TEXTE } from '../../shared/protocole.js'
import { rendre } from '../publication.js'
import { blocsDuDocument } from '../agentTexte.js'

const texte = (t) => [{ type: 'texte', texte: t }]

test('page publiée : « Titre » et « Sous-titre » portent leur classe, rien d’autre', () => {
  const html = rendre({
    titre: 'Doc',
    publieLe: Date.now(),
    blocs: [
      { type: 'paragraphe', contenu: texte('Le livre'), style: 'titre' },
      { type: 'paragraphe', contenu: texte('Le sous-titre'), style: 'sous-titre' },
      { type: 'paragraphe', contenu: texte('Du texte') },
    ],
  })
  assert.match(html, /<p class="style-titre">Le livre<\/p>/)
  assert.match(html, /<p class="style-sous-titre">Le sous-titre<\/p>/)
  assert.match(html, /<p>Du texte<\/p>/)
  assert.match(html, /p\.style-titre \{/, 'la feuille de style de la page connaît la classe')
})

test('page publiée : une valeur de style inventée par le client n’entre jamais dans le HTML', () => {
  const html = rendre({
    titre: 'Doc',
    publieLe: Date.now(),
    blocs: [{ type: 'paragraphe', contenu: texte('x'), style: '"><script>alert(1)</script>' }],
  })
  assert.doesNotMatch(html, /<script>alert/)
  assert.match(html, /<p>x<\/p>/)
})

test('lecture d’un agent : un paragraphe « Titre » ou « Sous-titre » est signalé, une valeur inconnue ignorée', () => {
  const ydoc = new Y.Doc()
  const racine = ydoc.getXmlFragment(NOM_TEXTE)
  const bloc = (t, style) => {
    const el = new Y.XmlElement('paragraph')
    if (style) el.setAttribute('style', style)
    const x = new Y.XmlText()
    x.insert(0, t)
    el.insert(0, [x])
    return el
  }
  racine.insert(0, [
    bloc('Le livre', 'titre'),
    bloc('Le sous-titre', 'sous-titre'),
    bloc('Texte'),
    bloc('Étrange', 'logo'),
  ])
  const blocs = blocsDuDocument(ydoc)
  assert.deepEqual(
    blocs.map((b) => b.style),
    ['titre', 'sous-titre', null, null]
  )
})

test('page publiée : une légende porte sa classe, et « constructor » ou « __proto__ » ne passent pas', () => {
  const html = rendre({
    titre: 'Doc',
    publieLe: Date.now(),
    blocs: [
      { type: 'paragraphe', contenu: texte('Une légende'), style: 'legende' },
      { type: 'paragraphe', contenu: texte('a'), style: 'constructor' },
      { type: 'paragraphe', contenu: texte('b'), style: '__proto__' },
      { type: 'paragraphe', contenu: texte('c'), style: 'toString' },
    ],
  })
  assert.match(html, /<p class="style-legende">Une légende<\/p>/)
  assert.match(html, /p\.style-legende \{/)
  for (const t of ['a', 'b', 'c']) assert.match(html, new RegExp(`<p>${t}</p>`))
})
