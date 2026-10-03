// Le surlignage d'un passage commenté (03/10/2026).
//
// Il se confondait avec une insertion : deux fonds teintés de la couleur de
// leur auteur. Le commentaire a maintenant un jaune unique, qui ne dépend
// de personne ; la couleur de l'auteur reste sur la carte.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
const regle = (sel) => {
  const i = css.indexOf(`${sel} {`)
  assert.ok(i > -1, `règle ${sel} absente`)
  return css.slice(i, css.indexOf('\n}', i))
}

test('le passage commenté est jaune, quel que soit l’auteur du commentaire', () => {
  const r = regle('.comment-highlight')
  assert.match(r, /#f5c518/)
  assert.doesNotMatch(r, /var\(--comment-color/)
  assert.doesNotMatch(r, /border-bottom/)
})

test('une insertion garde sa couleur d’auteur, un fond qui n’est pas celui du commentaire', () => {
  const r = regle('ins.tracked-insertion')
  assert.match(r, /var\(--user-color/)
  assert.doesNotMatch(r, /#f5c518/)
})
