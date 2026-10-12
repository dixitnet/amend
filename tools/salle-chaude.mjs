#!/usr/bin/env node
// C2 — « Une salle chaude » (protocole de test global, §3.4).
//
// N auteurs actifs sur le MÊME document : la moitié écrit (rafales), l'autre
// moitié relit (un geste toutes les 4–12 s). Au-delà de 8 clients, le
// générateur se répartit en plusieurs process de ≤ 8 clients (consigne du
// rapport n°3 : un process de 40 clients sature le Mac avant le serveur).
// Chaque process écrit son `tools/.banc-<pid>.json` ; la sonde
// `tools/observer.js` les additionne.
//
//   node tools/salle-chaude.mjs --auteurs 10 --doc <id> [--minutes 10]
//        [--base https://www.amend.ink] [--par-process 8] [--prefixe c2] [--simuler]
//
// Session : tools/.session-admin (ou --cookie). Les journaux de chaque
// process vont dans tests/campagne/<prefixe>-<N>-<i>.log, et un résumé agrégé
// est affiché à la fin (et écrit dans <prefixe>-<N>.json). Ctrl-C arrête tous
// les process proprement.

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = join(ICI, '..')
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const N = Number(opt('auteurs', 0))
const DOC = opt('doc', '')
const MINUTES = Number(opt('minutes', 10))
const BASE = opt('base', 'https://www.amend.ink')
const PAR = Number(opt('par-process', 8))
const PREFIXE = opt('prefixe', 'c2')
const SIMULER = args.includes('--simuler')
if (!N || !DOC) {
  console.error(
    'usage : salle-chaude.mjs --auteurs N --doc <id> [--minutes 10] [--base url] [--par-process 8] [--prefixe c2] [--simuler]'
  )
  process.exit(2)
}

let cookie = opt('cookie', process.env.AMEND_COOKIE || '')
if (!cookie) {
  const f = join(ICI, '.session-admin')
  if (existsSync(f)) cookie = readFileSync(f, 'utf8').trim()
}
if (!cookie && !SIMULER) {
  console.error('Pas de session : tools/.session-admin ou --cookie')
  process.exit(2)
}

// Répartition : k process, auteurs répartis le plus également possible, moitié/moitié.
const k = Math.ceil(N / PAR)
const parts = Array.from({ length: k }, (_, i) => Math.floor(N / k) + (i < N % k ? 1 : 0))
const lots = parts.map((n) => ({ ecrit: Math.ceil(n / 2), relit: Math.floor(n / 2) }))
console.log(
  `C2 — ${N} auteurs sur ${DOC} : ${k} process (${lots.map((l) => `${l.ecrit}+${l.relit}`).join(', ')}), ${MINUTES} min`
)

const dossier = join(RACINE, 'tests', 'campagne')
mkdirSync(dossier, { recursive: true })
const commande = (i, l, minutes, extra = []) => [
  'tools/loadtest.js',
  'mix',
  '--base',
  BASE,
  '--doc',
  DOC,
  '--cookie',
  cookie,
  '--profil',
  `ecrit:${l.ecrit},relit:${l.relit},lecteur:0`,
  '--minutes',
  String(minutes),
  '--arrivee-ms',
  '200',
  ...extra,
]

if (SIMULER) {
  lots.forEach((l, i) =>
    console.log(
      'node',
      commande(i, l, MINUTES, ['--sortie', `tests/campagne/${PREFIXE}-${N}-${i + 1}.csv`])
        .map((a) => (a === cookie ? '<cookie>' : a))
        .join(' ')
    )
  )
  process.exit(0)
}

function lancer(i, l, minutes, nom) {
  return new Promise((resolve) => {
    let sortie = ''
    const p = spawn(process.execPath, commande(i, l, minutes, ['--sortie', `tests/campagne/${nom}.csv`]), {
      cwd: RACINE,
    })
    p.stdout.on('data', (d) => {
      sortie += d
    })
    p.stderr.on('data', (d) => {
      sortie += d
    })
    p.on('close', (code) => {
      writeFileSync(join(dossier, `${nom}.log`), sortie)
      resolve({ i, code, sortie, pid: p.pid, p })
    })
    enfants.push(p)
  })
}
function extraire(texte) {
  const a = texte.indexOf('--- résultat du scénario ---')
  const b = texte.indexOf('--- observation serveur ---')
  if (a < 0) return null
  try {
    return JSON.parse(texte.slice(a + '--- résultat du scénario ---'.length, b < 0 ? undefined : b))
  } catch {
    return null
  }
}
const enfants = []
process.on('SIGINT', () => {
  console.log('\nInterruption : arrêt des process…')
  enfants.forEach((p) => {
    try {
      p.kill('SIGINT')
    } catch {
      /* parti */
    }
  })
})

// Arrivée décalée des process (une salle qui se remplit, pas k portes qui claquent).
const resultats = await Promise.all(
  lots.map(async (l, i) => {
    await new Promise((r) => setTimeout(r, i * 3000))
    return lancer(i, l, MINUTES, `${PREFIXE}-${N}-${i + 1}`)
  })
)
const parsed = resultats.map((r) => ({ ...r, res: extraire(r.sortie) }))

// Une dernière lecture, seule, pour avoir la longueur finale de référence.
await new Promise((r) => setTimeout(r, 2000))
const ref = extraire(
  (await lancer(99, { ecrit: 0, relit: 0 }, 0.05, `${PREFIXE}-${N}-ref`).then((r) => r)).sortie || ''
)
const valides = parsed.filter((r) => r.res)
const somme = (f) => valides.reduce((n, r) => n + (f(r.res) || 0), 0)
const max = (f) => Math.max(0, ...valides.map((r) => f(r.res) || 0))
const synthese = {
  auteurs: N,
  processus: k,
  minutes: MINUTES,
  resultatsLus: `${valides.length}/${k}`,
  codesSortie: parsed.map((r) => r.code),
  connectes: somme((r) => r.connectes),
  actions: somme((r) => r.actions),
  messagesRecus: somme((r) => r.messagesRecus),
  erreurs: somme((r) => r.erreurs),
  coupures: somme((r) => r.coupures),
  propagation_ms: {
    p50_max: max((r) => r.propagation_ms.p50),
    p95_max: max((r) => r.propagation_ms.p95),
    p99_max: max((r) => r.propagation_ms.p99),
    max: max((r) => r.propagation_ms.max),
    sansReponse: somme((r) => r.propagation_ms.sansReponse),
  },
  ouverture_ms_max: max((r) => Math.max(...Object.values(r.ouvertureJusquaSynced_ms).map((o) => o.max || 0))),
  convergence_par_process: valides.map((r) => r.res.convergence),
  convergence_reference: ref ? ref.convergence : 'non lue',
}
console.log('\n--- synthèse C2 ---')
console.log(JSON.stringify(synthese, null, 2))
writeFileSync(join(dossier, `${PREFIXE}-${N}.json`), JSON.stringify(synthese, null, 2))
process.exit(valides.length === k ? 0 : 1)
