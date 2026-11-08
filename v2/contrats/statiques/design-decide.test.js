// Le design n'a pas de valeur à lui (règles 17 et 18, ADR 0008) : Mantine et
// BlockNote tels quels, et chaque réglage (design/reglages.js, et chaque règle
// des feuilles de design/feuilles/) renvoie à une décision de Sylvain notée
// dans l'ADR 0008 (« Réglages décidés »). Aucune autre feuille de style.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { REGLAGES } from '../../design/reglages.js'

const V2 = new URL('../..', import.meta.url).pathname
const IGNORES = ['node_modules', 'dist', '.mesures', '.captures']

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    if (IGNORES.includes(nom)) return []
    const chemin = join(dossier, nom)
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin]
  })
}

/** `{ a: { b: 1 } }` → ['a.b'] ; un objet vide ne donne rien. */
function chemins(objet, prefixe = '') {
  return Object.entries(objet).flatMap(([cle, valeur]) =>
    valeur && typeof valeur === 'object' && !Array.isArray(valeur)
      ? chemins(valeur, `${prefixe}${cle}.`)
      : [`${prefixe}${cle}`],
  )
}

/** Les réglages listés dans l'ADR 0008, section « Réglages décidés ». */
function reglagesDeLAdr() {
  const adr = readFileSync(join(V2, 'adr/0008-design.md'), 'utf8')
  const debut = adr.indexOf('## Réglages décidés')
  assert.ok(debut >= 0, 'ADR 0008 : section « Réglages décidés » absente')
  const section = adr.slice(debut).split(/\n## /)[0]
  return [...section.matchAll(/^\|\s*`([\w.]+)`\s*\|/gm)].map((m) => m[1])
}

const FEUILLES = 'design/feuilles/'
const feuilles = () =>
  fichiers(V2)
    .filter((f) => /\.(css|scss|less)$/.test(f))
    .map((f) => relative(V2, f))

/** Les clés de réglage d'une feuille ; aucune règle hors d'un réglage. */
function reglagesDeLaFeuille(f) {
  const morceaux = readFileSync(join(V2, f), 'utf8').split(/\/\* réglage : ([\w.]+) \*\//)
  assert.ok(!morceaux[0].includes('{'), `${f} : une règle sans réglage avant la première clé`)
  return morceaux.filter((m, i) => i % 2 === 1)
}

test('aucune feuille de style hors de design/feuilles/', () => {
  assert.deepEqual(
    feuilles().filter((f) => !f.startsWith(FEUILLES) || !/^[\w/-]+\.css$/.test(f)),
    [],
  )
})

test('chaque réglage de design est une décision notée dans l’ADR 0008, et inversement', () => {
  const dansLeCode = [...chemins(REGLAGES), ...feuilles().flatMap(reglagesDeLaFeuille)].sort()
  const dansLAdr = reglagesDeLAdr().sort()
  assert.deepEqual(dansLeCode, dansLAdr)
})
