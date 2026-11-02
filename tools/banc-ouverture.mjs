#!/usr/bin/env node
// Banc d'ouverture d'un document : combien de temps entre le clic sur un lien
// `#/doc/<id>` et un document lisible et utilisable, et où passe ce temps.
//
//   node tools/banc-ouverture.mjs                         profils par défaut, réseau local
//   node tools/banc-ouverture.mjs --reseau=4g             débit et latence d'une connexion mobile correcte
//   node tools/banc-ouverture.mjs --profils=livre,these --essais=3
//   node tools/banc-ouverture.mjs --profils=livre --cpu   profil CPU de l'ouverture (temps propre par fonction) ;
//                                                        compiler le client sans minification pour lire les noms :
//                                                        (cd client && npx vite build --minify false)
//   node tools/banc-ouverture.mjs --profils=vide --requetes   cascade des requêtes HTTP de l'ouverture
//
// Lance une instance de TEST jetable (tools/instance-test.js), y dépose des
// documents du corpus (tools/corpus.js), puis ouvre chacun dans Chromium
// (Playwright), deux fois : cache vide, puis cache du navigateur rempli
// (seconde visite). Le client doit être compilé (`npm run build:client`).
//
// Mesures (médiane des essais) :
//   - octets   : transférés sur le réseau (HTTP), WebSocket non comprise
//   - js/css   : temps jusqu'au dernier fichier statique reçu
//   - meta     : réponse de GET /api/docs/<id>
//   - synced   : le serveur a envoyé l'état du document (masque levé)
//   - calme    : plus aucune tâche longue (> 50 ms) depuis 500 ms
//   - longues  : cumul des tâches longues du fil principal jusqu'au calme

/* global window, document, MutationObserver -- fonctions exécutées dans la page (Playwright) */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { lancerInstance } from './instance-test.js'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = (nom, defaut) => args.find((a) => a.startsWith(`--${nom}=`))?.split('=')[1] ?? defaut
const PROFILS = option('profils', 'vide,suivi-dense,commentaires-denses,livre').split(',')
const ESSAIS = Number(option('essais', 3))
const RESEAU = option('reseau', 'local')
const PORT = Number(option('port', 18950))
const CPU = args.includes('--cpu')
const REQUETES = args.includes('--requetes')

// Débits en octets/s, latence en ms (valeurs de type « 4G correcte » et « ADSL »).
const RESEAUX = {
  local: null,
  '4g': { latency: 70, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8 },
  adsl: { latency: 40, downloadThroughput: (6 * 1024 * 1024) / 8, uploadThroughput: (1024 * 1024) / 8 },
}
if (!(RESEAU in RESEAUX)) throw new Error(`réseau inconnu : ${RESEAU} (${Object.keys(RESEAUX).join(', ')})`)

const { chromium } = createRequire(import.meta.url)('playwright')

function deposer(profil, inst, cookie) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [
      join(RACINE, 'tools/corpus.js'),
      'envoyer',
      profil,
      '--base',
      inst.base,
      '--cookie',
      cookie,
    ])
    let sortie = ''
    p.stdout.on('data', (d) => (sortie += d))
    p.stderr.on('data', (d) => (sortie += d))
    p.on('exit', (c) => (c === 0 ? resolve(JSON.parse(sortie.trim().split('\n').pop())) : reject(new Error(sortie))))
  })
}

// Posé avant tout script de la page : horodate la levée du masque et les tâches longues.
const SONDE = () => {
  window.__banc = { longues: [], masque: null }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__banc.longues.push([e.startTime, e.duration])
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    /* navigateur sans longtask */
  }
  new MutationObserver(() => {
    if (window.__banc.masque === null && document.querySelector('.masque-chargement.masque-parti'))
      window.__banc.masque = performance.now()
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
}

async function ouvrir(contexte, inst, id, { cpu = false } = {}) {
  const page = await contexte.newPage()
  const cdp = await contexte.newCDPSession(page)
  await cdp.send('Network.enable')
  if (cpu) {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await cdp.send('Profiler.start')
  }
  if (RESEAUX[RESEAU]) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...RESEAUX[RESEAU] })
  let octets = 0
  cdp.on('Network.loadingFinished', (e) => (octets += e.encodedDataLength))
  await page.addInitScript(SONDE)
  await page.goto(`${inst.base}/#/doc/${id}`)
  await page.waitForFunction(() => window.__banc.masque !== null, null, { timeout: 120000 })
  // Le calme : 500 ms sans tâche longue.
  await page.waitForFunction(
    () => {
      const l = window.__banc.longues
      const fin = l.length ? Math.max(...l.map(([d, t]) => d + t)) : 0
      return performance.now() - Math.max(fin, window.__banc.masque) > 500
    },
    null,
    { timeout: 120000, polling: 100 }
  )
  const m = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource')
    const statiques = res.filter((r) => /\.(js|css|woff2)(\?|$)/.test(r.name))
    const meta = res.find((r) => /\/api\/docs\/[^/]+$/.test(r.name))
    const l = window.__banc.longues
    const finLongues = l.length ? Math.max(...l.map(([d, t]) => d + t)) : 0
    return {
      statiques: Math.max(0, ...statiques.map((r) => r.responseEnd)),
      meta: meta ? meta.responseEnd : null,
      synced: window.__banc.masque,
      calme: Math.max(finLongues, window.__banc.masque),
      longues: l.reduce((s, [, t]) => s + t, 0),
      plusLongue: l.reduce((s, [, t]) => Math.max(s, t), 0),
      requetes: res.map((r) => [new URL(r.name).pathname, r.startTime, r.responseEnd]),
    }
  })
  const profil = cpu ? (await cdp.send('Profiler.stop')).profile : null
  await page.close()
  return { octets, ...m, profil }
}

const mediane = (xs) => {
  const t = xs.filter((x) => x !== null).sort((a, b) => a - b)
  return t.length ? t[Math.floor(t.length / 2)] : null
}
const ms = (x) => (x === null ? '—' : `${Math.round(x)} ms`).padStart(9)
const ko = (x) => `${Math.round(x / 1024)} ko`.padStart(8)

/** Temps propre par fonction (ms), à partir d'un profil CDP échantillonné. */
function tempsPropres(profil, top = 30) {
  const parId = new Map(profil.nodes.map((n) => [n.id, n]))
  const temps = new Map()
  profil.samples.forEach((id, i) => {
    const n = parId.get(id)
    const f = n.callFrame
    const fichier = f.url.split('/').pop() || '(natif)'
    const cle = `${f.functionName || '(anonyme)'}  ${fichier}:${f.lineNumber + 1}`
    temps.set(cle, (temps.get(cle) ?? 0) + (profil.timeDeltas[i] ?? 0) / 1000)
  })
  return [...temps]
    .filter(([cle]) => !/^\((idle|program|garbage collector)\)/.test(cle))
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
}

const inst = await lancerInstance({ port: PORT, comptes: ['banc@test.local'] })
const cookie = inst.cookies['banc@test.local']
try {
  // Un compte sans nom ouvre la modale « Votre nom » avant l'éditeur.
  await inst.api('/api/auth/name', { cookie, methode: 'POST', corps: { nom: 'Banc' } })
  const docs = []
  for (const profil of PROFILS) {
    if (profil === 'vide') {
      const r = await inst.api('/api/docs', { cookie, methode: 'POST', corps: { title: 'BANC vide' } })
      docs.push({ profil, id: r.json.id, octetsYjs: 0, signes: 0 })
    } else {
      const d = await deposer(profil, inst, cookie)
      docs.push({ profil, id: d.id, octetsYjs: d.octets, signes: d.signes ?? null })
    }
  }
  const navigateur = await chromium.launch()
  const [nom, valeur] = cookie.split(';')[0].split(/=(.*)/s)
  if (REQUETES) {
    for (const d of docs) {
      const contexte = await navigateur.newContext()
      await contexte.addCookies([{ name: nom, value: valeur, url: inst.base }])
      const r = await ouvrir(contexte, inst, d.id)
      console.log(`\n${d.profil} — requêtes (début → fin, ms depuis la navigation) ; synced ${Math.round(r.synced)} ms`)
      for (const [chemin, debut, fin] of r.requetes.sort((a, b) => a[1] - b[1]))
        console.log(`${String(Math.round(debut)).padStart(6)} → ${String(Math.round(fin)).padStart(6)}  ${chemin}`)
      await contexte.close()
    }
    await navigateur.close()
  } else if (CPU) {
    for (const d of docs) {
      const contexte = await navigateur.newContext()
      await contexte.addCookies([{ name: nom, value: valeur, url: inst.base }])
      await ouvrir(contexte, inst, d.id) // premier passage : cache et compilation chauds
      const { profil, synced, calme } = await ouvrir(contexte, inst, d.id, { cpu: true })
      console.log(`\n${d.profil} — synced ${Math.round(synced)} ms, calme ${Math.round(calme)} ms ; temps propre :`)
      for (const [cle, t] of tempsPropres(profil)) console.log(`${t.toFixed(1).padStart(8)} ms  ${cle}`)
      await contexte.close()
    }
    await navigateur.close()
    process.exitCode = 0
  } else {
    console.log(`réseau : ${RESEAU} · ${ESSAIS} essais par cas · médianes\n`)
    console.log(
      `${'document'.padEnd(22)}${'cache'.padEnd(8)}${'octets'.padStart(8)}${'js/css'.padStart(9)}${'meta'.padStart(9)}${'synced'.padStart(9)}${'calme'.padStart(9)}${'longues'.padStart(9)}${'max'.padStart(9)}`
    )
    for (const d of docs) {
      const resultats = { vide: [], plein: [] }
      for (let i = 0; i < ESSAIS; i++) {
        const contexte = await navigateur.newContext()
        await contexte.addCookies([{ name: nom, value: valeur, url: inst.base }])
        resultats.vide.push(await ouvrir(contexte, inst, d.id))
        resultats.plein.push(await ouvrir(contexte, inst, d.id))
        await contexte.close()
      }
      for (const cache of ['vide', 'plein']) {
        const r = resultats[cache]
        const med = (k) => mediane(r.map((x) => x[k]))
        const titre = `${d.profil} (${Math.round(d.octetsYjs / 1024)} ko)`
        console.log(
          `${titre.padEnd(22)}${cache.padEnd(8)}${ko(med('octets'))}${ms(med('statiques'))}${ms(med('meta'))}${ms(med('synced'))}${ms(med('calme'))}${ms(med('longues'))}${ms(med('plusLongue'))}`
        )
      }
    }
    await navigateur.close()
  }
} finally {
  await inst.arreter()
}
