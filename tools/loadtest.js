#!/usr/bin/env node
// Générateur de charge headless pour Amend — voir
// claude/protocole-test-charge-serveur.md (projet Amend, test n°3).
//
// À lancer depuis le Mac, PAS depuis le VPS (le générateur volerait le seul
// vCPU qu'on cherche à mesurer) et PAS dans un navigateur (c'est l'onglet
// qui a saturé au test n°2, bien avant le serveur).
//
//   npm install                       # ws + yjs + y-protocols (devDependencies)
//   node tools/loadtest.js s1 --invite <jeton> --clients 4 --cycles 10
//
// Session : --cookie "collabtext_session=..." (copié depuis le navigateur)
// ou --invite <jeton d'invitation>, que le script consomme pour ouvrir une
// session et découvrir le document concerné.
//
// Chaque scénario s'arrête tout seul si un seuil rouge est franchi
// (latence de boucle d'événements, RSS, redémarrage du service).

import { WebSocket } from 'ws'
import * as Y from 'yjs'
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// La session est mémorisée ici plutôt que recollée à chaque scénario.
// Volontairement PAS en dur dans ce fichier : c'est une clé de session
// valable 30 jours, elle n'a rien à faire dans un dépôt git (ce chemin est
// dans .gitignore, et le fichier est en 0600).
const FICHIER_SESSION = join(dirname(fileURLToPath(import.meta.url)), '.session')
const DOC_PAR_DEFAUT = 'NtTqgGlcpGji' // « TEST CHARGE n°3 — à supprimer » en production

const MOTS = ('urbanisme circulaire sol artificialisation friche densité foncier renouvellement ' +
  'ville transition sobriété quartier îlot parcelle').split(' ')
const FRAG = 'prosemirror-content'
const rnd = (n) => Math.floor(Math.random() * n)
const dors = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- options

const args = process.argv.slice(2)
const scenario = args[0]
const opt = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`)
  return i === -1 ? defaut : args[i + 1]
}
const nombre = (nom, defaut) => Number(opt(nom, defaut))

const BASE = opt('base', 'https://www.amend.ink').replace(/\/$/, '')
const WS_BASE = BASE.replace(/^http/, 'ws')
let COOKIE = opt('cookie', process.env.AMEND_COOKIE || '')
let DOC = opt('doc', '')

// Seuils d'arrêt (protocole §4)
const LAG_ROUGE_MS = nombre('lag-max', 500)
const RSS_ROUGE_MO = nombre('rss-max', 550)

// ------------------------------------------------------------ HTTP + session

async function api(chemin, options = {}) {
  const res = await fetch(`${BASE}${chemin}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(COOKIE ? { cookie: COOKIE } : {}), ...options.headers },
  })
  return res
}

function memoriserSession(cookie, doc) {
  try {
    writeFileSync(FICHIER_SESSION, JSON.stringify({ cookie, doc, base: BASE, date: new Date().toISOString() }, null, 2))
    chmodSync(FICHIER_SESSION, 0o600)
    console.log(`Session mémorisée dans tools/.session — les prochains scénarios n'ont plus besoin de --cookie.`)
  } catch (err) {
    console.warn(`(session non mémorisée : ${err.message})`)
  }
}

async function ouvrirSession() {
  // Session déjà en main (--cookie) : rien à faire.
  if (COOKIE) return
  const invitation = opt('invite', '')
  const magique = opt('verify', '')

  // Trois façons d'obtenir une session, par ordre de commodité :
  //   --cookie  déjà en main (réutilisable d'un scénario à l'autre)
  //   --verify  le jeton d'un lien de reconnexion reçu par email (usage
  //             unique, 20 min) — c'est la voie à privilégier pour une
  //             adresse administratrice, seule à pouvoir lire
  //             /api/debug/stats, donc seule à permettre l'observation
  //             serveur du protocole
  //   --invite  le jeton d'une invitation à un document précis
  if (magique) {
    const res = await fetch(`${BASE}/api/auth/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: magique }),
    })
    if (!res.ok) throw new Error(`Lien de reconnexion refusé (${res.status}) — expiré ou déjà utilisé ?`)
    COOKIE = (res.headers.get('set-cookie') || '').split(';')[0]
    const data = await res.json()
    console.log(`Session ouverte pour ${data.email}.`)
    memoriserSession(COOKIE, DOC)
    return
  }
  if (invitation) {
    const res = await fetch(`${BASE}/api/invitations/${invitation}`, { method: 'POST' })
    if (!res.ok) throw new Error(`Invitation refusée (${res.status}) : ${await res.text()}`)
    COOKIE = (res.headers.get('set-cookie') || '').split(';')[0]
    const data = await res.json()
    if (!DOC) DOC = data.docId
    console.log(`Session ouverte pour ${data.email} — document ${data.docId}`)
    memoriserSession(COOKIE, DOC)
    return
  }

  // Sinon : la session mémorisée par un run précédent.
  if (existsSync(FICHIER_SESSION)) {
    try {
      const memo = JSON.parse(readFileSync(FICHIER_SESSION, 'utf8'))
      if (memo.base && memo.base !== BASE) {
        console.warn(`(session mémorisée pour ${memo.base}, pas pour ${BASE} — ignorée)`)
      } else if (memo.cookie) {
        COOKIE = memo.cookie
        if (!DOC && memo.doc) DOC = memo.doc
        const res = await api('/api/auth/me')
        const qui = res.ok ? (await res.json()).email : null
        if (!qui) throw new Error('la session mémorisée a expiré ou a été invalidée')
        console.log(`Session reprise depuis tools/.session (${qui}, mémorisée le ${String(memo.date).slice(0, 16).replace('T', ' ')}).`)
        return
      }
    } catch (err) {
      throw new Error(`${err.message} — relancez avec --verify <jeton d'un nouveau lien de connexion>`)
    }
  }

  throw new Error('Pas de session : passez --verify <jeton du lien reçu par email> une première fois (elle sera mémorisée), ou --cookie "collabtext_session=…"')
}

// ------------------------------------------------------------- observation

class Observatoire {
  constructor() {
    this.echantillons = []
    this.sondes = []
    this.arret = null
    this.timer = null
    this.timerSonde = null
    this.lagsRouges = 0
  }
  demarrer(intervalleMs = 2000) {
    this.timer = setInterval(() => this._stats(), intervalleMs)
    // Sonde indépendante du générateur : ce que ressent un utilisateur
    // ordinaire pendant la charge. /api/auth/me ne touche pas au registre,
    // /api/docs le relit entièrement — l'écart entre les deux est justement
    // ce que le scénario S3 cherche à mesurer.
    this.timerSonde = setInterval(() => this._sonde(), 3000)
  }
  async _stats() {
    try {
      const r = await api('/api/debug/stats')
      if (!r.ok) return
      const s = await r.json()
      const e = { t: Date.now(), lag: s.loopLagMs, rss: Math.round(s.memory.rss / 1048576), pid: s.pid, up: s.uptimeSec }
      this.echantillons.push(e)
      if (this.pid && e.pid !== this.pid) this.stop(`le service a redémarré (pid ${this.pid} → ${e.pid}) — OOM ?`)
      this.pid = e.pid
      if (e.rss > RSS_ROUGE_MO) this.stop(`RSS ${e.rss} Mo > seuil ${RSS_ROUGE_MO} Mo`)
      this.lagsRouges = e.lag > LAG_ROUGE_MS ? this.lagsRouges + 1 : 0
      if (this.lagsRouges >= 3) this.stop(`latence de boucle > ${LAG_ROUGE_MS} ms sur 3 relevés`)
    } catch (err) {
      this.echantillons.push({ t: Date.now(), erreur: String(err).slice(0, 80) })
    }
  }
  async _sonde() {
    for (const [nom, chemin] of [['me', '/api/auth/me'], ['docs', '/api/docs']]) {
      const t0 = performance.now()
      try {
        await api(chemin)
        this.sondes.push({ nom, ms: Math.round(performance.now() - t0) })
      } catch {
        this.sondes.push({ nom, ms: -1 })
      }
    }
  }
  stop(raison) {
    if (!this.arret) {
      this.arret = raison
      console.error(`\n⛔ ARRÊT : ${raison}\n`)
    }
  }
  fin() {
    clearInterval(this.timer)
    clearInterval(this.timerSonde)
    const ok = this.echantillons.filter((e) => !e.erreur)
    const lags = ok.map((e) => e.lag).sort((a, b) => a - b)
    const p = (v, q) => (v.length ? Math.round(v[Math.floor(v.length * q)] * 100) / 100 : null)
    const parSonde = {}
    for (const s of this.sondes) (parSonde[s.nom] = parSonde[s.nom] || []).push(s.ms)
    const resume = {
      relevés: ok.length,
      lagMedianMs: p(lags, 0.5),
      lagP95Ms: p(lags, 0.95),
      lagMaxMs: lags.length ? Math.round(lags[lags.length - 1] * 100) / 100 : null,
      rssMaxMo: ok.length ? Math.max(...ok.map((e) => e.rss)) : null,
      pids: [...new Set(ok.map((e) => e.pid))],
      sondes: Object.fromEntries(
        Object.entries(parSonde).map(([n, v]) => {
          const t = v.slice().sort((a, b) => a - b)
          return [n, { medianMs: t[Math.floor(t.length / 2)], p95Ms: t[Math.floor(t.length * 0.95)], maxMs: t[t.length - 1] }]
        })
      ),
      arrêt: this.arret,
    }
    return resume
  }
}

// ------------------------------------------------------------------ client

class Redacteur {
  constructor(docId, nom) {
    this.docId = docId
    this.nom = nom
    this.doc = new Y.Doc()
    this.frag = this.doc.getXmlFragment(FRAG)
    this.stats = { actions: 0, recus: 0, octetsRecus: 0, erreurs: 0, coupures: 0 }
    this.connecte = false
    this.doc.on('update', (u, origine) => {
      if (origine === 'distant') return
      if (this.ws && this.ws.readyState === 1) this.ws.send(u)
    })
  }
  connecter() {
    return new Promise((resolve) => {
      const ws = new WebSocket(`${WS_BASE}/ws/${this.docId}?user=${encodeURIComponent(this.nom)}`, {
        headers: COOKIE ? { cookie: COOKIE } : {},
      })
      this.ws = ws
      this.dernierMessage = Date.now()
      let ouvert = false
      ws.on('open', () => { ouvert = true; this.connecte = true; resolve('ouvert') })
      ws.on('message', (data, isBinary) => {
        this.stats.recus++
        this.stats.octetsRecus += data.length
        this.dernierMessage = Date.now()
        if (!isBinary) return
        try { Y.applyUpdate(this.doc, new Uint8Array(data), 'distant') } catch { this.stats.erreurs++ }
      })
      ws.on('close', () => { this.connecte = false; if (ouvert) this.stats.coupures++; else resolve('refusé') })
      ws.on('error', () => {})
      setTimeout(() => resolve(ouvert ? 'ouvert' : 'délai'), 15000)
    })
  }
  /** Attend la fin du rejeu du journal : plus rien reçu depuis `silenceMs`. */
  async attendreRejeu(silenceMs = 800, maxMs = 120000) {
    const t0 = Date.now()
    while (Date.now() - this.dernierMessage < silenceMs && Date.now() - t0 < maxMs) await dors(100)
    return Date.now() - t0
  }
  _paragraphes() {
    const out = []
    for (let i = 0; i < this.frag.length; i++) {
      const n = this.frag.get(i)
      if (n instanceof Y.XmlElement && n.length && n.get(0) instanceof Y.XmlText) out.push(n.get(0))
    }
    return out
  }
  action() {
    let ps = this._paragraphes()
    if (!ps.length) {
      this.doc.transact(() => {
        const p = new Y.XmlElement('paragraph')
        p.insert(0, [new Y.XmlText('Charge. ')])
        this.frag.insert(this.frag.length, [p])
      }, 'charge')
      ps = this._paragraphes()
    }
    const t = ps[rnd(ps.length)]
    const d = Math.random()
    this.doc.transact(() => {
      if (d < 0.55) t.insert(rnd(t.length + 1), MOTS[rnd(MOTS.length)] + ' ')
      else if (d < 0.85 && t.length > 12) t.delete(rnd(t.length - 8), 1 + rnd(7))
      else {
        const p = new Y.XmlElement('paragraph')
        p.insert(0, [new Y.XmlText(MOTS[rnd(MOTS.length)] + ' ')])
        this.frag.insert(rnd(this.frag.length + 1), [p])
      }
    }, 'charge')
    this.stats.actions++
  }
  async taper(nb, pauseMin = 50, pauseVar = 100, obs) {
    for (let i = 0; i < nb; i++) {
      if (obs && obs.arret) return
      try { this.action() } catch { this.stats.erreurs++ }
      await dors(pauseMin + Math.random() * pauseVar)
    }
  }
  fermer() { this.ws && this.ws.close() }
  signature() {
    const s = this.frag.toString()
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return { signes: s.length, hash: h }
  }
}

function convergence(clients) {
  const sigs = clients.map((c) => c.signature())
  const uniques = [...new Set(sigs.map((s) => s.hash))]
  return uniques.length === 1 ? `IDENTIQUE (${sigs[0].signes} signes)` : `DIVERGENCE (${uniques.length} états)`
}

async function tailleJournal(docId) {
  const r = await api(`/api/docs/${docId}/history`)
  if (!r.ok) return null
  const meta = await r.json()
  return { opérations: meta.total ?? meta.count ?? null, compactionNécessaire: meta.needsCompaction, meta }
}

// --------------------------------------------------------------- scénarios

const scenarios = {
  // Construit un journal volumineux : chaque transaction = une opération
  // stockée, donc une lecture de plus au rejeu de chaque connexion.
  async seed(obs) {
    const ops = nombre('ops', 20000)
    const c = new Redacteur(DOC, 'seed')
    await c.connecter()
    await c.attendreRejeu()
    console.log(`Journal avant : ${JSON.stringify(await tailleJournal(DOC))}`)
    for (let i = 0; i < ops; i++) {
      c.action()
      if (i % 200 === 0) { await dors(120); process.stdout.write(`\r  ${i}/${ops} opérations`) }
      if (obs.arret) break
    }
    await dors(3000)
    console.log(`\nJournal après : ${JSON.stringify(await tailleJournal(DOC))}`)
    c.fermer()
  },

  // S1 — rejeu de journal sous connexions répétées. Coût client nul,
  // coût serveur = taille du journal, payé sur la boucle d'événements.
  async s1(obs) {
    const clients = nombre('clients', 4)
    const cycles = nombre('cycles', 10)
    console.log(`Journal : ${JSON.stringify(await tailleJournal(DOC))}`)
    const rejeux = []
    for (let cycle = 1; cycle <= cycles && !obs.arret; cycle++) {
      const lot = Array.from({ length: clients }, (_, i) => new Redacteur(DOC, `churn-${cycle}-${i}`))
      const t0 = performance.now()
      const tMur = Date.now()
      await Promise.all(lot.map((c) => c.connecter()))
      const msOuverture = performance.now() - t0
      await Promise.all(lot.map((c) => c.attendreRejeu()))
      // Le rejeu s'arrête au DERNIER message reçu, pas à la fin de la
      // fenêtre de silence qui sert à le détecter — sinon on mesurerait
      // surtout cette fenêtre.
      const dernier = Math.max(...lot.map((c) => c.dernierMessage))
      const msRejeu = dernier - tMur
      const messages = lot.reduce((a, c) => a + c.stats.recus, 0) / clients
      const octets = lot.reduce((a, c) => a + c.stats.octetsRecus, 0) / clients
      rejeux.push({ cycle, msOuverture: Math.round(msOuverture), msRejeu: Math.round(msRejeu), messages, koParClient: Math.round(octets / 1024) })
      console.log(`  cycle ${cycle}/${cycles} — ouverture ${Math.round(msOuverture)} ms, rejeu complet ${Math.round(msRejeu)} ms, ${messages} messages/client`)
      lot.forEach((c) => c.fermer())
      await dors(1000)
    }
    return { rejeux }
  },

  // S2 — diffusion N² : N clients dans la même salle, tous en frappe.
  async s2(obs) {
    const clients = nombre('clients', 50)
    const ops = nombre('ops', 200)
    const lot = []
    for (let i = 0; i < clients; i++) {
      const c = new Redacteur(DOC, `fanout-${i}`)
      lot.push(c)
      await c.connecter()
    }
    console.log(`${lot.filter((c) => c.connecte).length}/${clients} connectés, rejeu en cours…`)
    await Promise.all(lot.map((c) => c.attendreRejeu()))
    const t0 = performance.now()
    await Promise.all(lot.map((c) => c.taper(ops, 50, 100, obs)))
    await dors(3000)
    const res = {
      clients: lot.filter((c) => c.connecte).length,
      actions: lot.reduce((a, c) => a + c.stats.actions, 0),
      messagesRecus: lot.reduce((a, c) => a + c.stats.recus, 0),
      erreurs: lot.reduce((a, c) => a + c.stats.erreurs, 0),
      coupures: lot.reduce((a, c) => a + c.stats.coupures, 0),
      convergence: convergence(lot),
      dureeS: Math.round((performance.now() - t0) / 1000),
    }
    lot.forEach((c) => c.fermer())
    return res
  },

  // S3 — pression sur le registre : docs.json est relu et reparsé à chaque
  // appel de getDoc/roleFor/listDocs, et réécrit en entier à chaque
  // écriture. Le coût de TOUTE requête croît donc avec le nombre total de
  // documents de l'instance.
  async s3(obs) {
    const paliers = String(opt('paliers', '100,500,1000')).split(',').map(Number)
    const crees = []
    const mesures = []
    const chrono = async (fn) => { const t0 = performance.now(); await fn(); return Math.round(performance.now() - t0) }
    let cible = 0
    for (const palier of paliers) {
      while (crees.length < palier && !obs.arret) {
        const r = await api('/api/docs', { method: 'POST', body: JSON.stringify({ title: `CHARGE S3 — à supprimer ${crees.length}` }) })
        if (!r.ok) { obs.stop(`création de document refusée (${r.status})`); break }
        crees.push((await r.json()).id)
        if (crees.length % 50 === 0) process.stdout.write(`\r  ${crees.length} documents créés`)
      }
      if (obs.arret) break
      cible = crees.length
      const m = {
        documents: cible,
        listeDocsMs: await chrono(() => api('/api/docs')),
        ouvertureDocMs: await chrono(() => api(`/api/docs/${DOC}`)),
        creationMs: await chrono(() => api('/api/docs', { method: 'POST', body: JSON.stringify({ title: 'CHARGE S3 — à supprimer sonde' }) }).then(async (r) => { if (r.ok) crees.push((await r.json()).id) })),
      }
      const sondeWs = new Redacteur(DOC, 'sonde-ws')
      m.ouvertureWsMs = await chrono(() => sondeWs.connecter())
      sondeWs.fermer()
      mesures.push(m)
      console.log(`\n  ${cible} documents → liste ${m.listeDocsMs} ms, ouverture doc ${m.ouvertureDocMs} ms, création ${m.creationMs} ms, WS ${m.ouvertureWsMs} ms`)
      if (m.listeDocsMs > 2000) { obs.stop(`GET /api/docs à ${m.listeDocsMs} ms`); break }
    }
    console.log(`\nNettoyage de ${crees.length} documents…`)
    let supprimes = 0
    for (const id of crees) {
      const r = await api(`/api/docs/${id}`, { method: 'DELETE' })
      if (r.ok) supprimes++
    }
    return { mesures, créés: crees.length, supprimés: supprimes }
  },

  // S4 — trame unique volumineuse : parseFrame alloue le payload entier.
  async s4(obs) {
    const mo = nombre('mo', 5)
    const c = new Redacteur(DOC, 'gros-collage')
    await c.connecter()
    await c.attendreRejeu()
    const temoin = new Redacteur(DOC, 'temoin')
    await temoin.connecter()
    await temoin.attendreRejeu()

    const bloc = Array.from({ length: 2000 }, () => MOTS[rnd(MOTS.length)]).join(' ') + '. '
    const cible = mo * 1024 * 1024
    let taille = 0
    c.doc.transact(() => {
      while (taille < cible) {
        const p = new Y.XmlElement('paragraph')
        p.insert(0, [new Y.XmlText(bloc)])
        c.frag.insert(c.frag.length, [p])
        taille += bloc.length
      }
    }, 'charge')
    const t0 = performance.now()
    await dors(5000)
    const res = {
      moDemandés: mo,
      signesEnvoyés: taille,
      msAvantPropagation: Math.round(performance.now() - t0),
      témoinAReçu: temoin.signature().signes >= c.signature().signes ? 'oui' : 'partiel/non',
      convergence: convergence([c, temoin]),
      coupures: c.stats.coupures + temoin.stats.coupures,
    }
    c.fermer(); temoin.fermer()
    return res
  },

  // S5 — écriture soutenue : croissance du journal, et surtout vérifier si
  // la compaction se déclenche (elle est faite par un CLIENT au-delà de
  // 1000 opérations, jamais par le serveur — des clients headless ne
  // compactent pas).
  async s5(obs) {
    const clients = nombre('clients', 5)
    const minutes = nombre('minutes', 10)
    const avant = await tailleJournal(DOC)
    const lot = []
    for (let i = 0; i < clients; i++) { const c = new Redacteur(DOC, `écrit-${i}`); lot.push(c); await c.connecter() }
    await Promise.all(lot.map((c) => c.attendreRejeu()))
    const fin = Date.now() + minutes * 60000
    while (Date.now() < fin && !obs.arret) {
      await Promise.all(lot.map((c) => c.taper(20, 40, 60, obs)))
      const t = await tailleJournal(DOC)
      console.log(`  ${new Date().toISOString().slice(11, 19)} — journal ${JSON.stringify(t)}`)
    }
    const apres = await tailleJournal(DOC)
    lot.forEach((c) => c.fermer())
    return { avant, apres, convergence: convergence(lot) }
  },

  // S6 — reprise : tout couper d'un coup et tout rouvrir en même temps, à
  // l'échelle atteinte par S1/S2. Chaque client rejoue le journal entier.
  async s6(obs) {
    const clients = nombre('clients', 50)
    const lot = []
    for (let i = 0; i < clients; i++) { const c = new Redacteur(DOC, `tempete-${i}`); lot.push(c); await c.connecter() }
    await Promise.all(lot.map((c) => c.attendreRejeu()))
    console.log(`${lot.filter((c) => c.connecte).length} connectés, on coupe tout…`)
    const t0 = performance.now()
    const tMur = Date.now()
    lot.forEach((c) => c.ws && c.ws.close())
    await dors(500)
    const etats = await Promise.all(lot.map((c) => c.connecter()))
    const msRouvert = performance.now() - t0
    await Promise.all(lot.map((c) => c.attendreRejeu(1500)))
    const res = {
      rouverts: etats.filter((e) => e === 'ouvert').length,
      msToutesRouvertes: Math.round(msRouvert),
      msJusquaDernierMessage: Math.max(...lot.map((c) => c.dernierMessage)) - tMur,
      convergence: convergence(lot),
      erreurs: lot.reduce((a, c) => a + c.stats.erreurs, 0),
    }
    lot.forEach((c) => c.fermer())
    return res
  },

  // Observation seule (utile pendant qu'on manipule le serveur à la main).
  async stats(obs) {
    const minutes = nombre('minutes', 5)
    await dors(minutes * 60000)
  },
}

// ------------------------------------------------------------------- main

if (!scenario || !scenarios[scenario]) {
  console.error(`Scénarios : ${Object.keys(scenarios).join(', ')}
Session : une seule fois, avec le jeton d'un lien de connexion reçu par
email (la fin de l'URL, après #/login/verify/) — elle est ensuite mémorisée
dans tools/.session et reprise automatiquement :
  node tools/loadtest.js s1 --verify <jeton>

Ensuite, plus rien à passer (document par défaut : ${DOC_PAR_DEFAUT}) :
  node tools/loadtest.js seed --ops 20000
  node tools/loadtest.js s1   --clients 4 --cycles 10
  node tools/loadtest.js s2   --clients 40 --ops 150
  node tools/loadtest.js s3   --paliers 100,500,1000
  node tools/loadtest.js s4   --mo 5
  node tools/loadtest.js s5   --clients 5 --minutes 10
  node tools/loadtest.js s6   --clients 30
Options : --doc <id> --base <url> --cookie "collabtext_session=…"`)
  process.exit(1)
}

const obs = new Observatoire()
try {
  await ouvrirSession()
  if (!DOC) DOC = DOC_PAR_DEFAUT
  if (!DOC) throw new Error('Pas de document : passez --doc <id>')
  console.log(`\n=== ${scenario} sur ${BASE} — document ${DOC} ===\n`)
  obs.demarrer()
  const resultat = await scenarios[scenario](obs)
  await dors(2500)
  const resume = obs.fin()
  console.log('\n--- résultat du scénario ---')
  console.log(JSON.stringify(resultat ?? {}, null, 2))
  console.log('\n--- observation serveur ---')
  console.log(JSON.stringify(resume, null, 2))
  process.exit(resume.arrêt ? 2 : 0)
} catch (err) {
  obs.fin()
  console.error(`\nÉchec : ${err.message}`)
  process.exit(1)
}
