// T0 : cohérence entre le code et les catalogues de textes. (Le design n'a plus
// de jetons à lui : contrats/statiques/design-decide.test.js.)
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

test('chaque modèle d’amend.ink et chaque réglage ouvert aux équipes a son nom dans le catalogue', async () => {
  const { REGLAGES } = await import('../../design/reglages.js')
  const existantes = new Set(cles(CATALOGUES[LANGUE_SOURCE]))
  for (const m of REGLAGES.livre.modeles) assert.ok(existantes.has(`modeles.maison.${m.id}`), m.id)
  for (const r of REGLAGES.livre.reglables) {
    const [debut, , propriete] = r.cle.split('.')
    const nom = debut === 'styles' ? `modeles.propriete.${propriete}` : `modeles.reglage.${r.cle}`
    assert.ok(existantes.has(nom), r.cle)
    assert.ok(existantes.has(`modeles.groupes.${r.groupe}`), `groupe de ${r.cle} absent du formulaire`)
    if (debut === 'styles') assert.ok(existantes.has(`modeles.groupes.${r.cle.split('.')[1]}`), r.cle)
  }
})

test('chaque modèle d’interface et chaque couleur de l’apparence ont leurs valeurs et leur nom dans le catalogue', async () => {
  const { REGLAGES } = await import('../../design/reglages.js')
  const existantes = new Set(cles(CATALOGUES[LANGUE_SOURCE]))
  const { modeles, couleurs, parDefaut } = REGLAGES.apparence
  for (const m of modeles) assert.ok(existantes.has(`admin.interfaces.${m}`), m)
  for (const c of couleurs) assert.ok(existantes.has(`admin.couleurs.${c}`), c)
  assert.deepEqual(Object.keys(REGLAGES.couleurs).sort(), [...couleurs].sort(), 'une palette par couleur proposée')
  for (const c of couleurs) assert.equal(REGLAGES.couleurs[c].palette.length, 10, c)
  assert.ok(modeles.includes(parDefaut.modele) && couleurs.includes(parDefaut.couleur))
})
