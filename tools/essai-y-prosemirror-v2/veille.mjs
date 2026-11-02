#!/usr/bin/env node
// Veille de y-prosemirror v2 (procédure : docs/ecarts-editeur.md, « Veille »).
//
//   node veille.mjs              versions publiées, comparées à celles de l'essai
//   node veille.mjs --essayer    rejoue l'essai avec les dernières pré-versions
//                                (installées sans toucher à package.json),
//                                juge les critères de passage, puis remet
//                                l'installation d'origine (npm ci)
//
// Ne touche jamais à l'application : tout se passe dans ce dossier.

import { readFileSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ICI = dirname(fileURLToPath(import.meta.url))
const ESSAYER = process.argv.includes('--essayer')
const teste = JSON.parse(readFileSync(join(ICI, 'package.json'), 'utf8')).dependencies
const verrou = JSON.parse(readFileSync(join(ICI, '../../client/package-lock.json'), 'utf8'))
const v1Installee = verrou.packages['node_modules/y-prosemirror']?.version

async function registre(nom) {
  const r = await fetch(`https://registry.npmjs.org/${nom.replace('/', '%2f')}`)
  if (!r.ok) throw new Error(`${nom} : registre ${r.status}`)
  const j = await r.json()
  const tags = j['dist-tags'] || {}
  const plusRecente = tags.beta && j.time[tags.beta] > j.time[tags.latest] ? tags.beta : tags.latest
  return { tags, plusRecente, date: (j.time[plusRecente] || '').slice(0, 10), latest: tags.latest }
}

const PAQUETS = ['@y/prosemirror', '@y/y', 'lib0', '@y/protocols']
const versions = {}
console.log('Versions publiées (la plus récente, pré-versions comprises) :')
for (const p of PAQUETS) {
  const r = await registre(p)
  versions[p] = r.plusRecente
  const nouveau = r.plusRecente !== teste[p] ? '  ← NOUVELLE depuis l’essai' : ''
  console.log(`  ${p.padEnd(16)} ${r.plusRecente.padEnd(18)} (${r.date})  essayée : ${teste[p]}${nouveau}`)
  if (p === '@y/prosemirror' || p === '@y/y')
    console.log(
      `  ${''.padEnd(16)} version stable (« latest ») : ${r.latest}${/-/.test(r.latest) ? ' — encore une pré-version' : ' — STABLE'}`
    )
}
// y-prosemirror 1.x : celle de l'application, et notre correctif local.
const v1 = await registre('y-prosemirror')
console.log(
  `\ny-prosemirror 1.x : dernière publiée ${v1.latest} (${v1.date}) ; installée dans l’application : ${v1Installee}`
)
if (v1.latest !== v1Installee)
  console.log(
    '  ← nouvelle 1.x : vérifier si client/patches/y-prosemirror+1.3.7.patch est encore utile ou s’applique encore'
  )

if (!ESSAYER) {
  console.log('\nPour rejouer l’essai avec ces versions : node veille.mjs --essayer')
  process.exit(0)
}

const lancer = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: ICI, stdio: 'inherit', ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} : code ${r.status}`)
}
const tmp = mkdtempSync(join(tmpdir(), 'veille-v2-'))
let verdict = null
try {
  console.log('\nInstallation des dernières pré-versions (sans modifier package.json)…')
  lancer('npm', ['i', '--no-save', '--no-audit', '--no-fund', ...PAQUETS.map((p) => `${p}@${versions[p]}`)])
  lancer('npm', ['run', 'build'])
  lancer('node', ['campagne.mjs', `--sortie=${join(tmp, 'campagne.json')}`])
  lancer('node', ['compo.mjs', `--sortie=${join(tmp, 'compo.json')}`])
  const campagne = JSON.parse(readFileSync(join(tmp, 'campagne.json'), 'utf8'))
  const compo = JSON.parse(readFileSync(join(tmp, 'compo.json'), 'utf8'))
  const cas = (n) => campagne.find((c) => c.nom.startsWith(`${n}.`)) || {}
  const P1 = 'Le chat noir dort sur le canapé du salon.'
  const attenduEtre = 'Le chat [-noir-]{+être+} dort sur le canapé du salon.'
  const criteres = [
    [
      'touche morte sur une sélection, en suggestion',
      (compo['touche morte sur sélection, en suggestion'] || []).every((l) => l === attenduEtre),
    ],
    [
      'Ctrl+Z après un remplacement, en suggestion',
      (compo['Ctrl+Z après un remplacement, en suggestion'] || []).every((l) => l === P1),
    ],
    ['effacer la suggestion d’un autre la laisse barrée', (cas(12).propose || '').includes('profond')],
    [
      'affichage lisible sur deux paragraphes',
      /\{\+blanc\+\}/.test(cas(4).propose || '') && (cas(4).propose || '').includes('[-salon.'),
    ],
    ['touche morte contre le curseur de l’autre', (cas(15).propose || '').split('\n')[0] === attenduEtre],
    ['non-régression : tout rejeter rend toujours le départ', campagne.every((c) => c.rejetOk !== false && !c.erreur)],
    [
      'non-régression : tout accepter donne le résultat attendu (hors touche morte)',
      campagne.filter((c) => !c.nom.startsWith('9.')).every((c) => c.accepteOk !== false),
    ],
  ]
  console.log(`\nCritères de passage (${PAQUETS.map((p) => `${p} ${versions[p]}`).join(', ')}) :`)
  for (const [nom, ok] of criteres) console.log(`  ${ok ? '✓' : '✗'} ${nom}`)
  verdict = criteres.every(([, ok]) => ok)
  console.log(
    verdict
      ? '\n→ Tous les critères passent : ouvrir un essai approfondi (notre schéma, attribution, commentaires, documents existants).'
      : '\n→ Pas encore : noter le résultat dans docs/ecarts-editeur.md (Veille) et réessayer à la prochaine version.'
  )
} finally {
  console.log('\nRetour à l’installation d’origine (npm ci)…')
  spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: ICI, stdio: 'ignore' })
}
process.exitCode = verdict === false ? 1 : 0
