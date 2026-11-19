// T1 : la décision du déploiement automatique (deploy/auto/maj.sh) : quels fichiers changés
// reconstruisent la v1, la v2, ou rien. Les motifs sont lus dans le script lui-même : un motif
// qui oublierait un dossier livrerait du code périmé sans erreur (audit du 16/11/2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const script = readFileSync(new URL('../../../deploy/auto/maj.sh', import.meta.url), 'utf8')
const motif = (cible) => {
  const m = new RegExp(`a_change '([^']+)' && ${cible}=1`).exec(script)
  assert.ok(m, `motif de ${cible} introuvable dans maj.sh`)
  return new RegExp(m[1])
}
const V1 = motif('V1')
const V2 = motif('V2')

test('déploiement : le code et les dépendances de la v1 la reconstruisent, pas le reste', () => {
  for (const f of [
    'client/src/home.js',
    'server/storage.js',
    'shared/diff.js',
    'deploy/deploy.sh',
    'package.json',
    'package-lock.json',
  ])
    assert.ok(V1.test(f), f)
  for (const f of [
    'v2/domaine/partage.js',
    'docs/journal-decisions.md',
    'CLAUDE.md',
    'tools/audit-ia.mjs',
    'deploy/auto/maj.sh',
    'v2/package.json',
  ])
    assert.ok(!V1.test(f), f)
})

test('déploiement : tout v2/ et son flux de tests reconstruisent la v2, pas le reste', () => {
  for (const f of [
    'v2/domaine/partage.js',
    'v2/package-lock.json',
    'v2/exploitation/prod/amend-v2.service',
    '.github/workflows/v2.yml',
  ])
    assert.ok(V2.test(f), f)
  for (const f of [
    'client/src/home.js',
    'docs/v2-veille.md',
    'tools/v2/x.js',
    '.github/workflows/tests.yml',
    'package.json',
  ])
    assert.ok(!V2.test(f), f)
})

test('déploiement : l’état porte l’avancement, et un déploiement interrompu est signalé sans être retenté', () => {
  for (const etat of ['encours', 'fait', 'echec']) assert.match(script, new RegExp(`\\$ENV2 ${etat}"`), etat)
  assert.match(script, /\$FAIT_ENV2 interrompu"/, 'interrompu')
  // « encours » est écrit avant les déploiements, « fait » après le dernier.
  assert.ok(script.indexOf('$ENV2 encours"') < script.indexOf('lancer v1'), 'encours avant le déploiement')
  assert.ok(script.lastIndexOf('$ENV2 fait"') > script.lastIndexOf('lancer v2'), 'fait après le déploiement')
})
