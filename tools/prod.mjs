#!/usr/bin/env node
// Agir sur la PRODUCTION avec le compte de test de Claude (02/11/2026,
// CLAUDE.md « Tester la production »).
//
//   node tools/prod.mjs verifier            le compte : connecté, pas administrateur, nom, documents
//   node tools/prod.mjs documents           ses documents (propres et partagés), rôle et titre
//   node tools/prod.mjs creer "Mon essai"   crée « TEST — Mon essai » et affiche son identifiant
//
// En module (scripts Playwright de Claude, banc d'ouverture) :
//   import { verifierCompte, api, creerDocumentTest, contexteProd, deposerEtat, BASE } from './prod.mjs'
//
// Le cookie de session du compte est dans AMEND_PROD_COOKIE (secret de
// l'environnement, jamais affiché ni écrit). Le compte est un compte
// ordinaire : le serveur ne lui ouvre que ses documents et ceux qu'on lui
// partage. Garde-fous ici : refus si le cookie est celui d'un administrateur
// (un cookie de Sylvain posé par erreur) ; tout document créé porte le
// préfixe « TEST — ».
//
// Derrière un proxy (session Claude dans le cloud), `fetch` de Node a besoin
// de NODE_USE_ENV_PROXY=1 : la ligne de commande se relance d'elle-même avec.

/* global location -- fonction exécutée dans la page (Playwright) */
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const BASE = (process.env.AMEND_PROD_BASE || 'https://www.amend.ink').replace(/\/$/, '')
export const PREFIXE = 'TEST — '
const NOM_COOKIE = 'collabtext_session'

/** `collabtext_session=…`, depuis AMEND_PROD_COOKIE (valeur seule ou couple nom=valeur). */
export function cookieProd() {
  const brut = (process.env.AMEND_PROD_COOKIE || '').trim()
  if (!brut)
    throw new Error('AMEND_PROD_COOKIE absent : le cookie de session du compte de test (secret de l’environnement)')
  return brut.includes('=') ? brut.split(';')[0] : `${NOM_COOKIE}=${brut}`
}

/** Une requête à l'API de production, avec le cookie du compte de test. Les
 * requêtes qui modifient portent l'origine du site (server/origine.js). */
export async function api(chemin, { methode = 'GET', corps } = {}) {
  const entetes = { cookie: cookieProd() }
  if (methode !== 'GET') entetes.origin = BASE
  if (corps !== undefined) entetes['content-type'] = 'application/json'
  let res
  try {
    res = await fetch(`${BASE}${chemin}`, {
      method: methode,
      headers: entetes,
      body: corps === undefined ? undefined : JSON.stringify(corps),
    })
  } catch (err) {
    throw new Error(`${BASE} injoignable (${err.cause?.code || err.message}). Derrière un proxy : NODE_USE_ENV_PROXY=1`)
  }
  const texte = await res.text()
  let json = null
  try {
    json = JSON.parse(texte)
  } catch {
    /* pas du JSON */
  }
  return { status: res.status, json }
}

/** Le compte du cookie : connecté, pas administrateur. Renvoie `{ email, nom }`. */
export async function verifierCompte() {
  const { status, json } = await api('/api/auth/me')
  if (status !== 200 || !json) throw new Error(`/api/auth/me : réponse ${status}`)
  if (!json.email) throw new Error('cookie refusé : expiré (30 jours) ou session fermée — à renouveler')
  if (json.admin)
    throw new Error('ce cookie est celui d’un administrateur : refusé, seul le compte de test est autorisé')
  return { email: json.email, nom: json.nom }
}

export async function documents() {
  const { status, json } = await api('/api/docs')
  if (status !== 200) throw new Error(`/api/docs : réponse ${status}`)
  return json.docs || []
}

/** Crée un document au nom du compte de test ; le titre porte toujours « TEST — ». */
export async function creerDocumentTest(titre) {
  const complet = titre.startsWith(PREFIXE) ? titre : `${PREFIXE}${titre}`
  const { status, json } = await api('/api/docs', { methode: 'POST', corps: { title: complet } })
  if (status !== 201) throw new Error(`création refusée : ${status} ${json && json.error ? json.error : ''}`)
  return json
}

/** Un contexte Chromium connecté avec le compte de test. */
export async function contexteProd(navigateur, options = {}) {
  const [nom, valeur] = cookieProd().split(/=(.*)/s)
  const contexte = await navigateur.newContext(options)
  await contexte.addCookies([{ name: nom, value: valeur, url: BASE, secure: BASE.startsWith('https'), httpOnly: true }])
  return contexte
}

/** Envoie un état Yjs (Uint8Array) dans un document, par une WebSocket ouverte
 * depuis une page du site (le navigateur passe par le proxy et porte le
 * cookie ; Node ne le ferait pas). `page` doit être sur `BASE`. */
export async function deposerEtat(page, id, octets) {
  const b64 = Buffer.from(octets).toString('base64')
  await page.evaluate(
    async ({ id, b64 }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/ws/${id}?user=Banc`)
        ws.binaryType = 'arraybuffer'
        const garde = setTimeout(() => reject(new Error('délai dépassé')), 120000)
        ws.onerror = () => reject(new Error('WebSocket refusée'))
        ws.onmessage = (e) => {
          if (typeof e.data !== 'string') return
          const m = JSON.parse(e.data)
          if (m.type === 'refuse') reject(new Error(`refusé : ${m.raison}`))
          if (m.type !== 'synced') return
          ws.send(bin)
          // Le serveur ne répond pas à un envoi : on lui laisse le temps de l'absorber.
          setTimeout(
            () => {
              clearTimeout(garde)
              ws.close()
              resolve()
            },
            Math.min(30000, 1000 + bin.length / 2000)
          )
        }
      })
    },
    { id, b64 }
  )
}

/** Relance la commande avec NODE_USE_ENV_PROXY=1 si un proxy est configuré. */
export function relancerAvecProxySiBesoin() {
  if (!(process.env.HTTPS_PROXY || process.env.https_proxy) || process.env.NODE_USE_ENV_PROXY) return
  // L'avertissement « EnvHttpProxyAgent is experimental » n'apprend rien ici.
  const r = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  })
  process.exit(r.status ?? 1)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  relancerAvecProxySiBesoin()
  const [commande, ...reste] = process.argv.slice(2)
  try {
    const moi = await verifierCompte()
    if (commande === 'verifier' || !commande) {
      const docs = await documents()
      console.log(`compte : ${moi.email} — nom : ${moi.nom || '(aucun : la fenêtre « Votre nom » s’ouvrira)'}`)
      console.log(
        `documents : ${docs.length} (dont ${docs.filter((d) => d.jeSuisProprietaire).length} créés par le compte)`
      )
    } else if (commande === 'documents') {
      for (const d of await documents())
        console.log(`${d.id}  ${(d.jeSuisProprietaire ? 'propriétaire' : d.myRole).padEnd(12)}  ${d.title}`)
    } else if (commande === 'creer') {
      const titre = reste.join(' ').trim()
      if (!titre) throw new Error('usage : node tools/prod.mjs creer "titre"')
      const doc = await creerDocumentTest(titre)
      console.log(`${doc.id}  ${doc.title}`)
    } else {
      throw new Error(`commande inconnue : ${commande} (verifier, documents, creer)`)
    }
  } catch (err) {
    console.error(`✗ ${err.message}`)
    process.exit(1)
  }
}
