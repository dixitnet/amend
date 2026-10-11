#!/usr/bin/env node
// La sonde indépendante du banc d'essai (protocole de test global, §2.4).
//
// Elle tourne dans **son propre process**, avec son propre pool de
// connexions : la sonde intégrée au générateur « ment » (rapport n°3, §6) —
// elle mesure la saturation du banc, pas celle du serveur. Ici, un seul
// travail : regarder la machine et le service, écrire un CSV, et **couper le
// banc** si un seuil rouge est franchi ou si quelqu'un d'autre se connecte.
//
//   node tools/observer.js --base https://www.amend.ink --cookie "collabtext_session=…" \
//        --sortie tests/campagne/nuit1-C1.csv --banc-pid 12345 --controle 1
//
// Le cookie est celui d'une adresse **administratrice** (seule à lire
// /api/debug/stats). À défaut de --cookie : $AMEND_ADMIN_COOKIE, puis le
// fichier tools/.session-admin (0600, ignoré par git : `{"cookie":"…"}`).
//
// Seuils (protocole §3.3), tous réglables :
//   --lag-max 500      latence de la boucle d'événements, 3 relevés de suite
//   --rss-max 550      RSS du service en Mo (MemoryMax = 700)
//   --get-max 2000     temps d'un GET ordinaire en ms, 3 relevés de suite
//   --tolerance 1      connexions WebSocket permises en plus du banc
//
// Le banc écrit tools/.banc.json (`{"pid":…,"clients":N}`) ; --controle N
// ajoute les onglets de contrôle ouverts à la main. Toute connexion au-delà
// — donc quelqu'un d'autre — arrête le banc (SIGINT au pid du banc, et
// création du fichier tools/.arret).

import { writeFileSync, appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`)
  return i === -1 ? defaut : args[i + 1]
}
const nombre = (nom, defaut) => Number(opt(nom, defaut))

const BASE = opt('base', 'https://www.amend.ink').replace(/\/$/, '')
const SORTIE = opt('sortie', '')
const INTERVALLE_MS = nombre('intervalle', 2) * 1000
const LAG_MAX = nombre('lag-max', 500)
const RSS_MAX = nombre('rss-max', 550)
const GET_MAX = nombre('get-max', 2000)
const TOLERANCE = nombre('tolerance', 1)
const CONTROLE = nombre('controle', 1)
const BANC_PID = opt('banc-pid', '') ? Number(opt('banc-pid', '')) : null
const DOC = opt('doc', '')
const SANS_ARRET = args.includes('--sans-arret') // observation passive : jamais de coupure

function cookie() {
  const direct = opt('cookie', process.env.AMEND_ADMIN_COOKIE || '')
  if (direct) return direct
  const f = join(ICI, '.session-admin')
  if (existsSync(f)) {
    try { return JSON.parse(readFileSync(f, 'utf8')).cookie || '' } catch { /* tombe sur l'erreur claire */ }
  }
  throw new Error('Pas de session administratrice : --cookie, $AMEND_ADMIN_COOKIE ou tools/.session-admin')
}
const COOKIE = cookie()

const FICHIER_BANC = join(ICI, '.banc.json')
const FICHIER_ARRET = join(ICI, '.arret')

if (SORTIE) {
  mkdirSync(dirname(SORTIE), { recursive: true })
  writeFileSync(SORTIE, 't_iso,t_s,pid,uptime_s,rss_mo,heap_mo,lag_ms,connexions,salles,repliques,banc,get_ms,ws_ms,evenement\n')
}
const ligne = (champs) => SORTIE && appendFileSync(SORTIE, champs.join(',') + '\n')

async function http(chemin, extra = {}) {
  const t0 = performance.now()
  const res = await fetch(`${BASE}${chemin}`, { headers: { cookie: COOKIE }, signal: AbortSignal.timeout(15000), ...extra })
  const corps = await res.text()
  return { res, corps, ms: Math.round(performance.now() - t0) }
}

/** Ouverture d'une WebSocket sur le document de test, jusqu'au premier
 * message : ce que verrait quelqu'un qui ouvre ce document. */
async function sondeWs() {
  if (!DOC) return ''
  const { WebSocket } = await import('ws')
  return new Promise((resolve) => {
    const t0 = performance.now()
    const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws/${DOC}?user=sonde`, { headers: { cookie: COOKIE } })
    const fin = (v) => { try { ws.terminate() } catch { /* déjà fermée */ } resolve(v) }
    const garde = setTimeout(() => fin(-1), 10000)
    ws.once('message', () => { clearTimeout(garde); fin(Math.round(performance.now() - t0)) })
    ws.once('error', () => { clearTimeout(garde); fin(-1) })
  })
}

const debut = Date.now()
const histoire = []
let pidConnu = null
let rouge = { lag: 0, get: 0, etrangers: 0 }
let arrete = null

function arreter(raison) {
  if (arrete) return
  arrete = raison
  console.error(`\n⛔ ${new Date().toISOString().slice(11, 19)}  ${raison}`)
  if (SANS_ARRET) return
  try { writeFileSync(FICHIER_ARRET, `${raison}\n`) } catch { /* pas grave */ }
  if (BANC_PID) { try { process.kill(BANC_PID, 'SIGINT') } catch { /* déjà parti */ } }
}

async function releve() {
  let evenement = ''
  let s = null
  let getMs = -1
  try {
    const r = await http('/api/debug/stats')
    if (!r.res.ok) throw new Error(`stats ${r.res.status}`)
    s = JSON.parse(r.corps)
    const g = await http('/api/auth/me')
    getMs = g.ms
  } catch (err) {
    evenement = `injoignable:${String(err.message).slice(0, 40)}`
  }
  const wsMs = s ? await sondeWs() : ''
  let banc = 0
  try { banc = JSON.parse(readFileSync(FICHIER_BANC, 'utf8')).clients || 0 } catch { /* pas de banc en cours */ }
  const maintenant = new Date()
  if (!s) {
    ligne([maintenant.toISOString(), ((Date.now() - debut) / 1000).toFixed(1), '', '', '', '', '', '', '', '', banc, getMs, wsMs, evenement])
    histoire.push({ erreur: true })
    return
  }
  const rss = Math.round(s.memory.rss / 1048576)
  const heap = Math.round(s.memory.heapUsed / 1048576)
  if (pidConnu && s.pid !== pidConnu) {
    evenement = `redemarrage:${pidConnu}->${s.pid}`
    arreter(`le service a redémarré (pid ${pidConnu} → ${s.pid}) — OOM ?`)
  }
  pidConnu = s.pid
  // Les connexions des autres : tout ce qui dépasse le banc, les onglets de
  // contrôle, la sonde elle-même (une WebSocket, brièvement) et la tolérance.
  const etrangers = (s.connexions ?? 0) - banc - CONTROLE
  rouge.etrangers = etrangers > TOLERANCE ? rouge.etrangers + 1 : 0
  rouge.lag = s.loopLagMs > LAG_MAX ? rouge.lag + 1 : 0
  rouge.get = getMs > GET_MAX ? rouge.get + 1 : 0
  if (rss > RSS_MAX) arreter(`RSS ${rss} Mo > seuil ${RSS_MAX} Mo`)
  if (rouge.lag >= 3) arreter(`latence de boucle > ${LAG_MAX} ms sur 3 relevés`)
  if (rouge.get >= 3) arreter(`GET > ${GET_MAX} ms sur 3 relevés`)
  if (rouge.etrangers >= 2) arreter(`${etrangers} connexion(s) étrangère(s) au banc : quelqu'un d'autre est là`)
  ligne([maintenant.toISOString(), ((Date.now() - debut) / 1000).toFixed(1), s.pid, Math.round(s.uptimeSec), rss, heap, s.loopLagMs.toFixed(2), s.connexions ?? '', s.salles ?? '', s.repliques ?? '', banc, getMs, wsMs, evenement])
  histoire.push({ lag: s.loopLagMs, rss, getMs, ws: typeof wsMs === 'number' ? wsMs : null, connexions: s.connexions ?? 0 })
  process.stdout.write(`\r${maintenant.toISOString().slice(11, 19)}  RSS ${rss} Mo  boucle ${s.loopLagMs.toFixed(1)} ms  GET ${getMs} ms  connexions ${s.connexions ?? '?'} (banc ${banc})   `)
}

function resume() {
  const ok = histoire.filter((h) => !h.erreur)
  const triees = (cle) => ok.map((h) => h[cle]).filter((v) => typeof v === 'number' && v >= 0).sort((a, b) => a - b)
  const q = (v, p) => (v.length ? Math.round(v[Math.min(v.length - 1, Math.floor(v.length * p))] * 100) / 100 : null)
  const l = triees('lag'), g = triees('getMs'), w = triees('ws'), r = triees('rss')
  const bilan = {
    relevés: histoire.length,
    injoignables: histoire.length - ok.length,
    boucle_ms: { médiane: q(l, 0.5), p95: q(l, 0.95), max: l.length ? l[l.length - 1] : null },
    get_ms: { médiane: q(g, 0.5), p95: q(g, 0.95), max: g.length ? g[g.length - 1] : null },
    ws_ms: { médiane: q(w, 0.5), p95: q(w, 0.95), max: w.length ? w[w.length - 1] : null },
    rss_mo: { début: r[0] ?? null, max: r.length ? r[r.length - 1] : null },
    arrêt: arrete,
  }
  console.log('\n' + JSON.stringify(bilan, null, 2))
}

console.log(`Observation de ${BASE} toutes les ${INTERVALLE_MS / 1000} s — seuils : boucle ${LAG_MAX} ms, RSS ${RSS_MAX} Mo, GET ${GET_MAX} ms${SANS_ARRET ? ' (passive : sans coupure)' : ''}`)
try { if (existsSync(FICHIER_ARRET)) writeFileSync(FICHIER_ARRET, '') } catch { /* sans importance */ }
let enCours = false
const timer = setInterval(async () => {
  if (enCours) return // un relevé lent ne s'empile pas
  enCours = true
  try { await releve() } finally { enCours = false }
}, INTERVALLE_MS)
const sortir = () => { clearInterval(timer); resume(); process.exit(arrete ? 2 : 0) }
process.on('SIGINT', sortir)
process.on('SIGTERM', sortir)
