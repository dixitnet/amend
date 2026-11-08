// Les caractères invisibles (espaces insécables, fines, sans chasse, liants,
// marque d'ordre, objet de remplacement) s'écrivent en échappement (\u00A0)
// dans les sources et les données de test : écrits en clair, ils sont
// indiscernables à la relecture et se perdent au copier-coller.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const V2 = new URL('../..', import.meta.url).pathname
const IGNORES = ['node_modules', 'dist', '.mesures', '.captures']
const INVISIBLES = /[\u00A0\u2007\u2009\u200A\u200B\u200C\u202F\u2060\uFEFF\uFFFC]|\u200D/u

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    if (IGNORES.includes(nom)) return []
    const chemin = join(dossier, nom)
    return statSync(chemin).isDirectory() ? fichiers(chemin) : /\.(m?js|jsx|json|css)$/.test(nom) ? [chemin] : []
  })
}

test('aucun caractère invisible écrit en clair dans les sources de la v2', () => {
  const fautifs = []
  for (const f of fichiers(V2)) {
    const lignes = readFileSync(f, 'utf8').split('\n')
    lignes.forEach((l, i) => INVISIBLES.test(l) && fautifs.push(`${relative(V2, f)}:${i + 1}`))
  }
  assert.deepEqual(fautifs, [])
})
