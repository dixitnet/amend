// Contrat 1 : la v2 n'importe que Yjs 14 (`@y/*`), jamais Yjs 13 ni la
// collaboration historique de BlockNote, même si npm les installe.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const V2 = new URL('../..', import.meta.url).pathname
// Statiques (`from '…'`) et dynamiques (`import('…')`) : audit du 10/11/2026.
const INTERDITS =
  /(?:from\s*|\bimport\s*\(\s*)['"]((?:yjs|y-prosemirror|y-protocols|y-websocket)(?:\/[^'"]*)?|@blocknote\/core\/yjs)['"]/

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    if (['node_modules', 'dist', 'dist.neuf', '.mesures', '.captures'].includes(nom)) return []
    const chemin = join(dossier, nom)
    return statSync(chemin).isDirectory() ? fichiers(chemin) : /\.(m?js|jsx)$/.test(nom) ? [chemin] : []
  })
}

test('aucun import de Yjs 13 dans le code de la v2', () => {
  const fautifs = fichiers(V2)
    .filter((f) => !f.includes('/contrats/statiques/'))
    .filter((f) => INTERDITS.test(readFileSync(f, 'utf8')))
    .map((f) => relative(V2, f))
  assert.deepEqual(fautifs, [])
})

test('l’expression repère les écritures sans blanc, les sous-chemins et les imports dynamiques', () => {
  for (const code of [
    'import x from"yjs"',
    "import x from 'yjs/dist/yjs.mjs'",
    "export * from'y-protocols/awareness'",
    'const m = await import("y-websocket")',
    "import x from '@blocknote/core/yjs'",
  ])
    assert.match(code, INTERDITS, code)
  for (const code of ["import x from '@y/y'", "import x from './yjs-voisin.js'", "import x from 'yjs-autre'"])
    assert.doesNotMatch(code, INTERDITS, code)
})
