#!/usr/bin/env node
// Nettoyer les images orphelines depuis la ligne de commande (23/10/2026).
// La même chose que le bloc « Images orphelines » du back-office
// (server/imagesOrphelines.js), pour un serveur qu'on ne peut pas atteindre
// par le navigateur.
//
//   node tools/nettoyer-images.mjs                 # analyse seulement (rien n'est supprimé)
//   node tools/nettoyer-images.mjs --appliquer     # supprime
//   node tools/nettoyer-images.mjs --jours 14      # délai de grâce (7 par défaut)
//   node tools/nettoyer-images.mjs --data /opt/amend/data
//
// Le dossier de données est, dans l'ordre : --data, DATA_DIR de l'environnement
// (ou du .env à la racine), puis ./data. Le serveur peut tourner pendant ce
// temps ; pour une archive propre, faire d'abord une sauvegarde.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DELAI_GRACE_JOURS, analyserImages, purgerImages } from '../server/imagesOrphelines.js'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`)
  return i === -1 ? defaut : args[i + 1]
}

function dataDepuisEnv() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR
  const chemin = join(RACINE, '.env')
  if (existsSync(chemin)) {
    for (const brut of readFileSync(chemin, 'utf8').split('\n')) {
      const m = /^\s*DATA_DIR\s*=\s*(.+?)\s*$/.exec(brut)
      if (m) return m[1].replace(/^["']|["']$/g, '')
    }
  }
  return join(RACINE, 'data')
}

const dataDir = resolve(opt('data', dataDepuisEnv()))
const delaiJours = Number(opt('jours', DELAI_GRACE_JOURS))
const octets = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.round(n / 1024)} Ko`)

if (!existsSync(join(dataDir, 'uploads'))) {
  console.error(`Pas de dossier d'images dans ${dataDir}.`)
  process.exit(1)
}

const a = analyserImages(dataDir, { delaiJours })
console.log(`Données : ${dataDir}`)
console.log(`${a.fichiers} image(s), ${octets(a.octets)} ; délai de grâce ${a.delaiJours} jour(s).`)
if (a.illisibles.length) {
  console.error(`\n${a.illisibles.length} source(s) illisible(s) — rien ne sera supprimé :`)
  for (const i of a.illisibles) console.error(`  ${i.chemin} : ${i.erreur}`)
  process.exit(2)
}
console.log(`${a.orphelines} orpheline(s), ${octets(a.octetsOrphelines)}.`)
for (const d of a.documents.filter((x) => x.orphelines.length).slice(0, 30)) {
  const poids = d.orphelines.reduce((s, o) => s + o.octets, 0)
  console.log(
    `  ${d.docId} : ${d.orphelines.length} orpheline(s), ${octets(poids)} (${d.gardees} gardée(s), ${d.recentes} récente(s))`
  )
}

if (!args.includes('--appliquer')) {
  if (a.orphelines) console.log('\nAnalyse seulement. Ajoutez --appliquer pour supprimer.')
  process.exit(0)
}
const r = purgerImages(dataDir, { delaiJours })
if (!r.ok) {
  console.error('Suppression refusée : une source est illisible.')
  process.exit(2)
}
console.log(
  `\n${r.supprimees} image(s) supprimée(s), ${octets(r.octets)} libérés${r.echecs ? `, ${r.echecs} échec(s)` : ''}.`
)
