// Seulement l'API publique des paquets (règle 2 ; R2 de la revue d'ouverture
// de l'étape 2) : un import ne vise que ce qu'un paquet déclare dans les
// `exports` de son package.json, jamais un fichier interne (`src/`, `dist/`…),
// ni un chemin dans node_modules. Sans `exports`, seul le paquet lui-même.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const V2 = new URL('../..', import.meta.url).pathname
const IGNORES = ['node_modules', 'dist', '.mesures', '.captures']

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    if (IGNORES.includes(nom)) return []
    const chemin = join(dossier, nom)
    return statSync(chemin).isDirectory() ? fichiers(chemin) : /\.(m?js|jsx)$/.test(nom) ? [chemin] : []
  })
}

/** Les chemins importés d'un source : statiques, réexports, dynamiques. */
export function importsDe(source) {
  const motifs = [/(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g, /\bimport\s*\(?\s*['"]([^'"]+)['"]/g]
  return motifs.flatMap((m) => [...source.matchAll(m)].map((r) => r[1]))
}

/** `@a/b/c/d` → ['@a/b', './c/d'] ; `a/b` → ['a', './b'] ; `a` → ['a', '.']. */
export function decouper(specifieur) {
  const morceaux = specifieur.split('/')
  const n = specifieur.startsWith('@') ? 2 : 1
  const reste = morceaux.slice(n).join('/')
  return [morceaux.slice(0, n).join('/'), reste ? `./${reste}` : '.']
}

/** Le sous-chemin est-il déclaré dans `exports` (clés exactes ou avec `*`) ? */
export function exporte(exports, sousChemin) {
  if (exports === undefined) return sousChemin === '.'
  if (typeof exports === 'string' || Array.isArray(exports)) return sousChemin === '.'
  const cles = Object.keys(exports)
  // Un objet de conditions seules (`import`, `require`…) vaut pour « . ».
  if (!cles.some((c) => c.startsWith('.'))) return sousChemin === '.'
  return cles.some((cle) => {
    if (!cle.includes('*')) return cle === sousChemin
    const [avant, apres] = cle.split('*')
    return sousChemin.startsWith(avant) && sousChemin.endsWith(apres) && sousChemin.length >= cle.length - 1
  })
}

test('le découpage des chemins et la lecture des exports', () => {
  assert.deepEqual(decouper('@y/hub'), ['@y/hub', '.'])
  assert.deepEqual(decouper('@blocknote/core/y'), ['@blocknote/core', './y'])
  assert.deepEqual(decouper('lib0/encoding'), ['lib0', './encoding'])
  const ex = { '.': {}, './style.css': {}, './styles/*': {} }
  assert.ok(exporte(ex, '.'))
  assert.ok(exporte(ex, './style.css'))
  assert.ok(exporte(ex, './styles/bouton.css'))
  assert.ok(!exporte(ex, './src/index.js'))
  assert.ok(!exporte(ex, './dist/blocknote.js'))
  assert.ok(exporte(undefined, '.'))
  assert.ok(!exporte(undefined, './lib/interne.js'))
  assert.ok(exporte({ import: './x.js', require: './x.cjs' }, '.'))
  assert.ok(!exporte({ import: './x.js' }, './x.js'))
  assert.deepEqual(importsDe("import a from '@y/y'\nexport { b } from './b.js'\nawait import('@y/hub/src/x.js')"), [
    '@y/y',
    './b.js',
    '@y/hub/src/x.js',
  ])
})

test("aucun import hors de l'API publique d'un paquet", () => {
  const fautifs = []
  for (const fichier of fichiers(V2)) {
    if (fichier.includes('/contrats/statiques/')) continue
    for (const s of importsDe(readFileSync(fichier, 'utf8'))) {
      const ou = `${relative(V2, fichier)} : ${s}`
      if (s.includes('node_modules')) fautifs.push(ou)
      if (s.startsWith('.') || s.startsWith('/') || s.startsWith('node:')) continue
      const [paquet, sousChemin] = decouper(s)
      let manifeste
      try {
        manifeste = JSON.parse(readFileSync(join(V2, 'node_modules', paquet, 'package.json'), 'utf8'))
      } catch {
        fautifs.push(`${ou} (paquet introuvable)`)
        continue
      }
      if (!exporte(manifeste.exports, sousChemin)) fautifs.push(ou)
    }
  }
  assert.deepEqual(fautifs, [])
})
