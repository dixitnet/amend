#!/usr/bin/env node
// Lanceur de tests (points 10 et 11 de la feuille de route, 11/10/2026).
//
// Pourquoi pas `node --test dossier/*.test.js` : sur ce dépôt le total
// annoncé était parfois inférieur d'un fichier, sans échec ni avertissement —
// un fichier qui ne tourne pas passait inaperçu — et un fichier qui ne se
// termine pas (un serveur resté à l'écoute) bloquait toute la suite.
//
// Ici, un processus `node --test` **par fichier**, l'un après l'autre :
//   - un délai par fichier (TEST_TIMEOUT_S, 180 s par défaut) : un fichier
//     qui pend est tué, compté en échec, et la suite continue ;
//   - un bilan par fichier (tests, réussis, échecs, durée) ;
//   - le nombre de fichiers lancés est comparé à celui du dossier, et la
//     suite échoue s'il manque quelque chose ;
//   - un fichier qui ne rapporte aucun test est signalé (import cassé).
//
//   node tools/lancer-tests.mjs server/test
//   node tools/lancer-tests.mjs test --motif commentaires     (depuis client/)
//   node tools/lancer-tests.mjs server/test --lent 20         (nomme les fichiers de plus de 20 s)
//   node tools/lancer-tests.mjs server/test --lot 2/4         (le 2e quart des fichiers : outils à durée limitée)

import { readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const dossier = resolve(args[0] || 'test')
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const motif = opt('motif', null)
const lent = Number(opt('lent', 30))
const delaiS = Number(process.env.TEST_TIMEOUT_S) || 180

const RAPPORTEUR = join(dirname(fileURLToPath(import.meta.url)), 'rapporteur-test.mjs')
const tous = readdirSync(dossier)
  .filter((f) => f.endsWith('.test.js'))
  .sort()
const lot = (opt('lot', '') || '').match(/^(\d+)\/(\d+)$/)
let fichiers = motif ? tous.filter((f) => f.includes(motif)) : tous
if (lot) {
  const [i, n] = [Number(lot[1]), Number(lot[2])]
  fichiers = fichiers.filter((_, k) => k % n === i - 1)
}
if (!tous.length) {
  console.error(`Aucun fichier *.test.js dans ${dossier}`)
  process.exit(2)
}

function lancer(fichier) {
  return new Promise((fin) => {
    const t0 = Date.now()
    const enfant = spawn(
      process.execPath,
      ['--test', '--test-force-exit', '--test-concurrency=1', `--test-reporter=${RAPPORTEUR}`, join(dossier, fichier)],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )
    let sortie = ''
    enfant.stdout.on('data', (d) => (sortie += d))
    enfant.stderr.on('data', (d) => (sortie += d))
    let tue = false
    const minuteur = setTimeout(() => {
      tue = true
      enfant.kill('SIGKILL')
    }, delaiS * 1000)
    enfant.on('close', (code) => {
      clearTimeout(minuteur)
      const m = /^@@bilan (.*)$/m.exec(sortie)
      let r = {}
      try {
        r = m ? JSON.parse(m[1]) : {}
      } catch {
        r = {}
      }
      fin({
        fichier,
        code,
        tue,
        tests: r.tests ?? NaN,
        reussis: r.reussis ?? NaN,
        echecs: r.echecs ?? NaN,
        ignores: r.ignores ?? NaN,
        annules: r.annules ?? NaN,
        noms: r.noms || [],
        ms: Date.now() - t0,
        sortie,
      })
    })
  })
}

console.log(`${fichiers.length} fichier(s) de test dans ${dossier}${motif ? ` (motif « ${motif} »)` : ''}`)
const bilans = []
for (const f of fichiers) {
  const b = await lancer(f)
  bilans.push(b)
  const mal = b.code !== 0 || b.tue || !(b.tests > 0) || b.echecs > 0 || b.annules > 0
  console.log(
    `${mal ? '✗' : '✓'} ${f.padEnd(44)} ${String(b.tests).padStart(4)} tests  ${(b.ms / 1000).toFixed(1).padStart(6)} s${b.tue ? `  — TUÉ après ${delaiS} s` : ''}${b.tests > 0 ? '' : '  — aucun test rapporté'}`
  )
  if (mal)
    console.log(
      b.noms.length
        ? b.noms.map((n) => `    ✗ ${n}`).join('\n')
        : b.sortie
            .split('\n')
            .filter((l) => !l.startsWith('@@bilan'))
            .slice(-12)
            .join('\n')
    )
}

const somme = (cle) => bilans.reduce((a, b) => a + (Number.isFinite(b[cle]) ? b[cle] : 0), 0)
const enEchec = bilans.filter((b) => b.code !== 0 || b.tue || !(b.tests > 0) || b.echecs > 0 || b.annules > 0)
const manquants = motif || lot ? [] : tous.filter((f) => !bilans.some((b) => b.fichier === f))
console.log('\n--- bilan ---')
console.log(
  `fichiers : ${bilans.length}/${tous.length}${motif || lot ? ' (filtrés)' : ''}   tests : ${somme('tests')}   réussis : ${somme('reussis')}   échecs : ${somme('echecs')}   ignorés : ${somme('ignores')}`
)
const longs = bilans.filter((b) => b.ms / 1000 >= lent).sort((a, b) => b.ms - a.ms)
if (longs.length)
  console.log(
    `fichiers de plus de ${lent} s : ${longs.map((b) => `${b.fichier} (${(b.ms / 1000).toFixed(0)} s)`).join(', ')}`
  )
if (manquants.length) console.log(`MANQUANTS : ${manquants.join(', ')}`)
console.log(`durée totale : ${(bilans.reduce((a, b) => a + b.ms, 0) / 1000).toFixed(0)} s`)
process.exit(enEchec.length || manquants.length ? 1 : 0)
