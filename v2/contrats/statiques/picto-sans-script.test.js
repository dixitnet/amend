// Le pictogramme de référence (design/picto/amend-ink.svg) est inséré tel
// quel dans la page (design/composants/Picto.jsx, `?raw`) : il ne doit jamais
// contenir de code exécutable (balise script, attribut d'événement `on…=`,
// lien `javascript:`, objet étranger, référence externe).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

const DOSSIER = new URL('../../design/picto/', import.meta.url)
const svgs = readdirSync(DOSSIER).filter((nom) => nom.endsWith('.svg'))

test('le dossier des pictos contient bien le pictogramme de référence', () => {
  assert.ok(svgs.includes('amend-ink.svg'), svgs.join(', '))
})

for (const nom of svgs)
  test(`${nom} : aucune balise script, aucun attribut on…=, aucun lien exécutable ou externe`, () => {
    const source = readFileSync(new URL(nom, DOSSIER), 'utf8')
    assert.doesNotMatch(source, /<\s*script\b/i, 'balise script')
    assert.doesNotMatch(source, /\son[a-z]+\s*=/i, 'attribut d’événement')
    assert.doesNotMatch(source, /javascript\s*:/i, 'lien javascript:')
    assert.doesNotMatch(source, /<\s*(foreignObject|iframe|embed|object)\b/i, 'contenu étranger')
    assert.doesNotMatch(source, /(?:href|src)\s*=\s*["']?\s*(?:https?:)?\/\//i, 'référence externe')
    assert.match(source, /<svg\b/i, 'est bien un SVG')
  })
