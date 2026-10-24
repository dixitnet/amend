// Des pages publiées propres (24/10/2026) : un accent est un seul caractère
// (NFC) dans la page, quel que soit le codage du texte reçu — filet de
// sécurité derrière le client (shared/propre.js).

import test from 'node:test'
import assert from 'node:assert/strict'

const { rendre } = await import('../publication.js')

test('la page publiée est en NFC : texte, titre et plan', () => {
  const html = rendre({
    titre: 'Aménager',
    blocs: [
      { type: 'titre', niveau: 1, contenu: [{ type: 'texte', texte: 'Cohérence', marques: [] }] },
      { type: 'paragraphe', contenu: [{ type: 'texte', texte: 'l’aménagement', marques: [] }] },
    ],
    publieLe: Date.now(),
  })
  assert.ok(html.includes('Aménager'))
  assert.ok(html.includes('l’aménagement'))
  assert.ok(html.includes('Cohérence'))
  assert.ok(!/[̀-ͯ]/.test(html))
})
