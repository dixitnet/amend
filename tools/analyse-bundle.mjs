// Poids de chaque module dans les fichiers JavaScript du client compilé.
//
//   node tools/analyse-bundle.mjs            compile le client (avec source maps) dans un dossier temporaire, puis analyse
//   node tools/analyse-bundle.mjs <dossier>  analyse un build existant qui contient des .js.map
//   options : --top=N (40 par défaut), --fichier=<motif> (ne garder que les .js dont le nom contient ce motif)
//
// Lit la source map de chaque .js et attribue chaque octet du fichier compilé
// au module source d'où il vient. Les modules de node_modules sont regroupés
// par paquet. Aucune dépendance : Node seul. Sert à décider ce qui peut être
// chargé à la demande pour accélérer le premier chargement.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = (nom, defaut) => args.find((a) => a.startsWith(`--${nom}=`))?.split('=')[1] ?? defaut
const TOP = Number(option('top', 40))
const MOTIF = option('fichier', '')
let dossier = args.find((a) => !a.startsWith('--'))
let temporaire = null

if (!dossier) {
  temporaire = mkdtempSync(join(tmpdir(), 'amend-bundle-'))
  console.log(`→ compilation du client avec source maps dans ${temporaire}`)
  execFileSync('npx', ['vite', 'build', '--sourcemap', '--outDir', temporaire, '--emptyOutDir'], {
    cwd: join(RACINE, 'client'),
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  dossier = temporaire
}
const assets = existsSync(join(dossier, 'assets')) ? join(dossier, 'assets') : dossier

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const VAL = Object.fromEntries([...B64].map((c, i) => [c, i]))

/** Décode un segment VLQ base64 d'une source map. */
function vlq(segment) {
  const valeurs = []
  let v = 0
  let decalage = 0
  for (const c of segment) {
    const d = VAL[c]
    v += (d & 31) << decalage
    if (d & 32) decalage += 5
    else {
      valeurs.push(v & 1 ? -(v >>> 1) : v >>> 1)
      v = 0
      decalage = 0
    }
  }
  return valeurs
}

/** Octets du fichier compilé par source (index dans `map.sources`). */
function octetsParSource(code, map) {
  const lignes = code.split('\n')
  const taille = new Map()
  let source = 0
  map.mappings.split(';').forEach((ligne, i) => {
    const longueur = (lignes[i] ?? '').length
    let colonne = 0
    const points = []
    for (const seg of ligne ? ligne.split(',') : []) {
      const v = vlq(seg)
      colonne += v[0]
      if (v.length > 1) source += v[1]
      points.push([colonne, v.length > 1 ? source : -1])
    }
    points.forEach(([debut, s], j) => {
      if (s < 0) return
      const fin = j + 1 < points.length ? points[j + 1][0] : longueur
      taille.set(s, (taille.get(s) ?? 0) + fin - debut)
    })
  })
  return taille
}

/** `node_modules/prosemirror-view/dist/index.js` → `prosemirror-view` ; sinon chemin depuis client/src ou shared. */
function nomModule(chemin) {
  const paquet = chemin.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)
  if (paquet) return paquet[1]
  return chemin.replace(/^.*?\/?((client\/)?src|shared)\//, (_, d) => (d.startsWith('shared') ? 'shared/' : 'src/'))
}

const ko = (n) => `${(n / 1024).toFixed(1)} ko`.padStart(10)
const fichiers = readdirSync(assets).filter((f) => f.endsWith('.js') && f.includes(MOTIF))
fichiers.sort((a, b) => readFileSync(join(assets, b)).length - readFileSync(join(assets, a)).length)

for (const f of fichiers) {
  const code = readFileSync(join(assets, f), 'utf8')
  const cheminMap = join(assets, `${f}.map`)
  console.log(`\n${f} — ${ko(code.length).trim()} (${ko(gzipSync(code).length).trim()} compressé)`)
  if (!existsSync(cheminMap)) {
    console.log('  (pas de source map)')
    continue
  }
  const map = JSON.parse(readFileSync(cheminMap, 'utf8'))
  const groupes = new Map()
  for (const [s, n] of octetsParSource(code, map)) {
    const nom = nomModule(map.sources[s])
    groupes.set(nom, (groupes.get(nom) ?? 0) + n)
  }
  const tries = [...groupes].sort((a, b) => b[1] - a[1])
  for (const [nom, n] of tries.slice(0, TOP)) console.log(`${ko(n)}  ${nom}`)
  if (tries.length > TOP) console.log(`  … ${tries.length - TOP} autres modules`)
}

if (temporaire) rmSync(temporaire, { recursive: true, force: true })
