// Contrat : toutes les dépendances installées (directes et transitives) ont
// une licence compatible avec l'AGPL-3.0 de la v2 (ADR 0006, grille de revue
// point 8). Une licence nouvelle fait échouer ce test : on l'examine, puis on
// l'ajoute ici avec sa raison.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const COMPATIBLES = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Apache-2.0', // compatible avec la (A)GPL-3.0
  'MPL-2.0', // BlockNote ; compatible avec la (A)GPL-3.0 (section 3.3 de la MPL)
  'GPL-3.0', // paquets « xl- » de BlockNote, utilisables (ADR 0006, décision 2 de Sylvain)
  'BlueOak-1.0.0', // permissive
  'Unlicense', // domaine public (postgres)
  '(MIT OR CC0-1.0)',
  'AGPL-3.0 OR PROPRIETARY', // y/hub, utilisé sous AGPL-3.0 (ADR 0004)
])

function paquets(dossier) {
  if (!existsSync(dossier)) return []
  return readdirSync(dossier).flatMap((nom) => {
    if (nom.startsWith('.')) return []
    const chemin = join(dossier, nom)
    if (nom.startsWith('@')) return paquets(chemin)
    const pj = join(chemin, 'package.json')
    if (!existsSync(pj)) return []
    const j = JSON.parse(readFileSync(pj, 'utf8'))
    const licence = typeof j.license === 'object' ? j.license?.type : j.license
    return [{ nom: j.name, licence: licence || '(aucune)' }, ...paquets(join(chemin, 'node_modules'))]
  })
}

test('toutes les dépendances installées ont une licence compatible avec l’AGPL-3.0', () => {
  const tous = paquets(new URL('../../node_modules', import.meta.url).pathname)
  assert.ok(tous.length > 50, 'node_modules introuvable : lancer npm ci dans v2/')
  const hors = tous.filter((p) => !COMPATIBLES.has(p.licence)).map((p) => `${p.nom} : ${p.licence}`)
  assert.deepEqual(hors, [])
})
