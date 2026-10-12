#!/usr/bin/env node
// Une instance d'amend.ink de TEST, jetable, avec ses faux services
// (protocole de test global, §2.1, environnement A) : un dossier de données
// temporaire, un faux Anthropic, un faux Mailgun, un secret connu — donc des
// cookies de session fabricables. Sert au fuzz, à la matrice des droits, à
// Playwright, aux pannes provoquées.
//
//   node tools/instance-test.js --port 18900 --comptes admin@test.local,ed@test.local
//   → écrit sur stdout une ligne JSON {base, secret, data, cookies}, puis reste
//     en vie jusqu'à Ctrl-C (les processus fils sont arrêtés avec lui).
//
// En module : `const inst = await lancerInstance({ port })` puis `inst.arreter()`.

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cookieDeSession } from './forger-session.js'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')

function attendreSortie(p, motif, ms = 15000) {
  return new Promise((resolve, reject) => {
    let vu = ''
    const garde = setTimeout(() => reject(new Error(`délai dépassé en attendant « ${motif} » :\n${vu}`)), ms)
    const lire = (d) => {
      vu += d
      if (vu.includes(motif)) {
        clearTimeout(garde)
        resolve(vu)
      }
    }
    p.stdout.on('data', lire)
    p.stderr.on('data', lire)
    p.once('exit', (c) => {
      clearTimeout(garde)
      reject(new Error(`sorti (${c}) avant « ${motif} » :\n${vu}`))
    })
  })
}

// Un seul secret par process : voir tools/forger-session.js.
const SECRET_DU_PROCESSUS = 'secret-de-test-' + Math.random().toString(36).slice(2)

export async function lancerInstance({
  port = 18900,
  comptes = ['admin@test.local'],
  admin = comptes[0],
  secret = SECRET_DU_PROCESSUS,
  anthropic = {}, // options passées au faux Anthropic (ex. { latence: '1,5', 'erreur-529': 0.1 })
  mailgun = {},
  env = {},
  data = null, // un dossier à réutiliser (copie de données, restauration)
} = {}) {
  const dossier = data || mkdtempSync(join(tmpdir(), 'amend-test-'))
  const fils = []
  const options = (o) => Object.entries(o).flatMap(([k, v]) => (v === true ? [`--${k}`] : [`--${k}`, String(v)]))
  const fauxA = spawn(
    process.execPath,
    [
      join(RACINE, 'tools/faux-anthropic.js'),
      '--port',
      String(port + 1),
      ...options({ latence: '5,40', ...anthropic }),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )
  const fauxM = spawn(
    process.execPath,
    [join(RACINE, 'tools/faux-mailgun.js'), '--port', String(port + 2), ...options({ latence: '1,10', ...mailgun })],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )
  fils.push(fauxA, fauxM)
  await Promise.all([attendreSortie(fauxA, 'faux Anthropic'), attendreSortie(fauxM, 'faux Mailgun')])
  const journal = []
  const base = `http://127.0.0.1:${port}`
  const lancerServeur = () => {
    const proc = spawn(process.execPath, [join(RACINE, 'server/server.js')], {
      cwd: RACINE,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: dossier,
        SESSION_SECRET: secret,
        ADMIN_EMAILS: admin,
        APP_BASE_URL: `http://localhost:${port}`,
        ANTHROPIC_API_KEY: 'faux',
        ANTHROPIC_API_URL: `http://127.0.0.1:${port + 1}`,
        MAILGUN_API_KEY: 'faux',
        MAILGUN_DOMAIN: 'test.local',
        MAILGUN_API_URL: `http://127.0.0.1:${port + 2}`,
        CLAUDE_AGENT: 'editeurs',
        PUBLICATION_WEB: 'editeurs',
        ...env,
      },
    })
    proc.stdout.on('data', (d) => journal.push(String(d)))
    proc.stderr.on('data', (d) => journal.push(String(d)))
    return proc
  }
  const attendreServeur = async () => {
    const t0 = Date.now()
    for (;;) {
      try {
        if ((await fetch(`${base}/api/auth/me`)).status < 500) return
      } catch {
        /* pas encore */
      }
      if (Date.now() - t0 > 15000) {
        fils.forEach((f) => f.kill())
        throw new Error('le serveur de test ne répond pas :\n' + journal.join(''))
      }
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  let serveur = lancerServeur()
  fils.push(serveur)
  await attendreServeur()
  const cookies = {}
  for (const c of comptes) cookies[c] = await cookieDeSession(c, secret)
  return {
    base,
    port,
    secret,
    data: dossier,
    cookies,
    journal,
    fauxAnthropic: `http://127.0.0.1:${port + 1}`,
    fauxMailgun: `http://127.0.0.1:${port + 2}`,
    async api(chemin, { cookie, methode = 'GET', corps, entetes = {} } = {}) {
      const res = await fetch(`${base}${chemin}`, {
        method: methode,
        headers: {
          ...(corps ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
          ...entetes,
        },
        body: corps ? JSON.stringify(corps) : undefined,
      })
      let json = null
      const texte = await res.text()
      try {
        json = JSON.parse(texte)
      } catch {
        /* pas du JSON */
      }
      return { status: res.status, json, texte, entetes: res.headers }
    },
    /** Arrête puis relance le serveur seul (mêmes données, même port) :
     * `brutal` = SIGKILL, comme un plantage ou un redémarrage du service. */
    async redemarrer({ brutal = false } = {}) {
      const ancien = serveur
      const fini = new Promise((r) => ancien.once('exit', r))
      ancien.kill(brutal ? 'SIGKILL' : 'SIGTERM')
      await fini
      serveur = lancerServeur()
      fils.push(serveur)
      await attendreServeur()
    },
    /** Arrête tout et rend la main quand les processus sont *vraiment* partis
     * (SIGKILL au bout de 3 s) : sans cela, l'instance suivante, sur le même
     * port, parle à la précédente qui finit de s'éteindre. */
    async arreter({ garderDonnees = false } = {}) {
      const attentes = fils.map(
        (f) =>
          new Promise((resolve) => {
            if (f.exitCode !== null || f.signalCode !== null) return resolve()
            const garde = setTimeout(() => {
              try {
                f.kill('SIGKILL')
              } catch {
                /* parti */
              }
            }, 3000)
            f.once('exit', () => {
              clearTimeout(garde)
              resolve()
            })
            try {
              f.kill()
            } catch {
              resolve()
            }
          })
      )
      await Promise.all(attentes)
      if (!data && !garderDonnees) {
        try {
          rmSync(dossier, { recursive: true, force: true })
        } catch {
          /* sans importance */
        }
      }
    },
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const opt = (n, d) => {
    const i = args.indexOf(`--${n}`)
    return i === -1 ? d : args[i + 1]
  }
  const comptes = String(opt('comptes', 'admin@test.local')).split(',')
  const inst = await lancerInstance({ port: Number(opt('port', 18900)), comptes, data: opt('data', null) })
  console.log(JSON.stringify({ base: inst.base, secret: inst.secret, data: inst.data, cookies: inst.cookies }))
  const sortir = async () => {
    await inst.arreter()
    process.exit(0)
  }
  process.on('SIGINT', sortir)
  process.on('SIGTERM', sortir)
}
