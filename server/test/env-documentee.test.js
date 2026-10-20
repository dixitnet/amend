// Chaque variable d'environnement du serveur est décrite dans `.env.example`,
// et chaque variable décrite est lue quelque part (15/10/2026). Sans cela, le
// guide d'installation se périme en silence : on ajoute une variable au code,
// personne ne sait qu'elle existe. Même principe que la matrice des droits et
// que le test des garde-fous.
//
// Limite : seules les lectures `process.env.NOM` et `process.env['NOM']` sont
// repérées dans le sens « code → fichier ». Une variable lue par un nom
// calculé n'est vue que dans l'autre sens (« fichier → code »).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Les fichiers `.js` d'un dossier, sans les tests. */
function sources(dossier) {
  const sortie = []
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (e.name === 'test' || e.name === 'node_modules') continue
    const chemin = join(dossier, e.name)
    if (e.isDirectory()) sortie.push(...sources(chemin))
    else if (e.name.endsWith('.js')) sortie.push(chemin)
  }
  return sortie
}

const code = [...sources(join(racine, 'server')), ...sources(join(racine, 'shared'))].map((f) =>
  readFileSync(f, 'utf8')
)
const toutLeCode = code.join('\n')

/** Les noms de `.env.example`, qu'ils soient posés ou en commentaire (`# NOM=`). */
function variablesDecrites() {
  const texte = readFileSync(join(racine, '.env.example'), 'utf8')
  return new Set([...texte.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]))
}

function variablesLues() {
  const lues = new Set()
  for (const t of code) {
    for (const m of t.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) lues.add(m[1])
    for (const m of t.matchAll(/process\.env\[\s*'([A-Z][A-Z0-9_]*)'\s*\]/g)) lues.add(m[1])
  }
  return lues
}

test('chaque variable lue par le serveur est décrite dans .env.example', () => {
  const decrites = variablesDecrites()
  const manquantes = [...variablesLues()].filter((v) => !decrites.has(v)).sort()
  assert.deepEqual(manquantes, [], 'à ajouter à .env.example (avec son rôle, son défaut, l’effet de son absence)')
})

test('chaque variable décrite dans .env.example est lue quelque part (aucune variable morte)', () => {
  const mortes = [...variablesDecrites()].filter((v) => !new RegExp(`\\b${v}\\b`).test(toutLeCode)).sort()
  assert.deepEqual(mortes, [], 'à retirer de .env.example, ou à dire « n’est plus lue » dans son commentaire')
})

test('le repérage voit bien les variables (garde contre un test qui ne verrait rien)', () => {
  const lues = variablesLues()
  for (const v of ['PORT', 'DATA_DIR', 'SESSION_SECRET', 'MAILGUN_API_KEY', 'TYPST_BIN']) assert.ok(lues.has(v), v)
  assert.ok(variablesDecrites().size >= 20)
})
