// La barre de mise en forme du téléphone (format S) s'appuie sur des noms de
// BlockNote qui ne sont pas documentés : la classe de la barre mobile et les
// variables de la zone visible (`--bn-vv-*`, design/feuilles/telephone.css ;
// Sylvain, 12/11/2026). Une montée de version qui les renommerait doit se voir.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const css = readFileSync(createRequire(import.meta.url).resolve('@blocknote/react/style.css'), 'utf8')

test('BlockNote garde la barre mobile et les variables de la zone visible', () => {
  assert.match(css, /\.bn-mobile-formatting-toolbar\{/)
  for (const v of ['--bn-vv-top', '--bn-vv-left', '--bn-vv-scale']) assert.ok(css.includes(v), v)
})
