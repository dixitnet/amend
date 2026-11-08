// T0 : cohérence entre le code, les catalogues de textes et les jetons de design.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CATALOGUES, LANGUE_SOURCE, cles } from '../../i18n/index.js'

const V2 = new URL('../..', import.meta.url).pathname
function fichiers(dossier, motif) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom)
    if (['node_modules', 'dist', '.mesures', 'tests', 'contrats'].includes(nom)) return []
    return statSync(chemin).isDirectory() ? fichiers(chemin, motif) : motif.test(nom) ? [chemin] : []
  })
}
const lire = (f) => readFileSync(f, 'utf8')
const code = fichiers(V2, /\.(m?js|jsx)$/).map((f) => ({ f: relative(V2, f), s: lire(f) }))

test('chaque clé de traduction utilisée existe, et chaque clé existante sert', () => {
  const existantes = new Set(cles(CATALOGUES[LANGUE_SOURCE]))
  const utilisees = new Set()
  for (const { f, s } of code)
    for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9.-]+)'/g)) {
      assert.ok(existantes.has(m[1]), `${f} utilise la clé inconnue « ${m[1]} »`)
      utilisees.add(m[1])
    }
  // Les messages d'erreur sont choisis par code (messageErreur) : chaque clé
  // `erreurs.<code>` doit correspondre à un code produit quelque part.
  const tout = code.map((c) => c.s).join('\n')
  for (const cle of existantes) {
    if (cle.startsWith('erreurs.')) {
      const c = cle.slice('erreurs.'.length)
      assert.ok(tout.includes(`'${c}'`), `le code « ${c} » n’est produit nulle part (clé ${cle} inutile)`)
    } else assert.ok(utilisees.has(cle), `clé « ${cle} » jamais utilisée`)
  }
})

test('chaque code d’erreur du domaine a son message', () => {
  const existantes = new Set(cles(CATALOGUES[LANGUE_SOURCE]))
  for (const { f, s } of code.filter((c) => c.f.startsWith('domaine/')))
    for (const m of s.matchAll(/code: '([a-z-]+)'/g))
      assert.ok(existantes.has(`erreurs.${m[1]}`), `${f} : le code « ${m[1]} » n’a pas de message`)
})

test('chaque variable CSS utilisée est définie dans les jetons ; le jeu sombre redéfinit chaque couleur', () => {
  const jetons = lire(join(V2, 'design/jetons.css'))
  const definies = new Set([...jetons.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
  const design = fichiers(join(V2, 'design'), /\.(css|js|jsx)$/)
  for (const f of design)
    for (const m of lire(f).matchAll(/var\(\s*(--[a-z0-9-]+)|v\('([a-z0-9-]+)'\)/g)) {
      const nom = m[1] || `--${m[2]}`
      if (nom.startsWith('--bn-')) continue // variables de BlockNote (thème)
      // Nom construit à l'exécution (`--auteur-${n}`) : la famille doit exister.
      if (nom.endsWith('-'))
        assert.ok(
          [...definies].some((d) => d.startsWith(nom)),
          `${relative(V2, f)} : famille ${nom}* absente`,
        )
      else assert.ok(definies.has(nom), `${relative(V2, f)} utilise ${nom}, absent de jetons.css`)
    }
  const clair = jetons.slice(0, jetons.indexOf('@media (prefers-color-scheme: dark)'))
  const sombre = jetons.slice(jetons.indexOf('@media (prefers-color-scheme: dark)'))
  for (const m of clair.matchAll(/(--(?:couleur|ombre)-[a-z0-9-]+)\s*:/g))
    assert.ok(sombre.includes(`${m[1]}:`), `${m[1]} n’a pas de valeur sombre`)
})
