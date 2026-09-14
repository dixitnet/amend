// Sessions (cookie signé, sans stockage serveur) et jetons de reconnexion à
// usage unique (lien magique par email) — voir
// claude/conception-gestion-utilisateurs.md dans le projet Amend pour la
// conception complète. L'entrée initiale par lien d'invitation (voir
// storage.js : inviteLinks) est un mécanisme séparé et ne passe pas par ici
// pour la vérification d'email — seule la reconnexion ultérieure exige la
// possession de la boîte mail.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'collabtext_session'
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 jours

// Pas de SESSION_SECRET dans .env : on en génère un aléatoire au démarrage.
// Conséquence acceptée : un redémarrage du process déconnecte tout le
// monde (les cookies existants ne se vérifient plus) — sans gravité pour un
// premier déploiement, mais à définir dans .env en production pour l'éviter.
const SESSION_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex')
if (!process.env.SESSION_SECRET) {
  console.log(
    'Astuce : définis SESSION_SECRET dans .env pour que les sessions survivent à un redémarrage du serveur.'
  )
}

function sign(value) {
  return createHmac('sha256', SESSION_SECRET).update(value).digest('base64url')
}

export function parseCookies(req) {
  const header = req.headers.cookie
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const val = part.slice(eq + 1).trim()
    if (key) out[key] = decodeURIComponent(val)
  }
  return out
}

/** Adresse email normalisée (minuscules, espaces retirés), ou null si
 * manifestement invalide. Validation volontairement simple : l'entrée par
 * lien d'invitation ne vérifie pas la possession de la boîte mail de toute
 * façon (voir l'en-tête de ce fichier), donc une validation plus stricte
 * n'apporterait pas grand-chose ici. */
export function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

/** true si la requête est arrivée en HTTPS — via le proxy (Caddy en
 * production) puisque Node lui-même ne voit que du HTTP en clair derrière
 * lui. Détermine le flag Secure du cookie de session : absent en local sur
 * le Mac (pas de proxy HTTPS), actif en production. */
export function isSecureRequest(req) {
  return req.headers['x-forwarded-proto'] === 'https'
}

/** Liste blanche d'administrateurs (ADMIN_EMAILS dans .env, séparés par
 * des virgules) — pour l'instant Sylvain, sert à deux choses distinctes :
 * pouvoir se connecter/créer des documents sans avoir déjà d'accès nulle
 * part (bootstrap — voir isLoginAllowed ci-dessous), et accéder aux routes
 * d'administration de l'instance (feuille de style partagée, diagnostic).
 * Voir claude/conception-gestion-utilisateurs.md (projet Amend). */
function adminEmailList() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email) {
  if (!email) return false
  return adminEmailList().includes(email)
}

/** true si cette adresse a le droit de se connecter/créer un compte par ce
 * biais : soit elle a déjà accès à au moins un document (retour normal),
 * soit elle est administratrice (bootstrap). Tout le monde d'autre
 * n'arrive dans l'appli que par un lien d'invitation à un document
 * précis — jamais par la connexion générique. `storage` est passé en
 * paramètre plutôt qu'importé ici pour ne pas créer de dépendance
 * circulaire entre auth.js et storage.js. */
export function isLoginAllowed(email, storage) {
  return isAdminEmail(email) || storage.emailHasAnyAccess(email)
}

export function sessionCookieHeader(email, { secure }) {
  const payload = Buffer.from(JSON.stringify({ email, iat: Date.now() })).toString('base64url')
  const sig = sign(payload)
  const parts = [
    `${COOKIE_NAME}=${payload}.${sig}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function readSession(req) {
  const cookies = parseCookies(req)
  const raw = cookies[COOKIE_NAME]
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot === -1) return null
  const payload = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  const expected = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (Date.now() - data.iat > SESSION_MAX_AGE_MS) return null
    return data.email || null
  } catch {
    return null
  }
}

// --- Jetons de reconnexion (lien magique) : usage unique, courte durée de
// vie, en mémoire (pas besoin de survivre à un redémarrage). ---
const RECONNECT_TOKEN_TTL_MS = 20 * 60 * 1000 // 20 minutes
const reconnectTokens = new Map() // token -> { email, expiresAt }
const reconnectRateLimit = new Map() // email -> timestamps[]
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX = 5

export function canRequestReconnectLink(email) {
  const now = Date.now()
  const list = (reconnectRateLimit.get(email) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  reconnectRateLimit.set(email, list)
  return list.length < RATE_LIMIT_MAX
}

export function createReconnectToken(email) {
  const now = Date.now()
  const list = reconnectRateLimit.get(email) || []
  list.push(now)
  reconnectRateLimit.set(email, list)

  const token = randomBytes(24).toString('base64url')
  reconnectTokens.set(token, { email, expiresAt: now + RECONNECT_TOKEN_TTL_MS })
  return token
}

/** Consomme le jeton (usage unique) et renvoie l'email associé, ou null si
 * absent / expiré / déjà utilisé. */
export function consumeReconnectToken(token) {
  const entry = reconnectTokens.get(token)
  reconnectTokens.delete(token)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) return null
  return entry.email
}

// Nettoyage périodique des jetons expirés jamais consommés — évite une
// fuite mémoire lente sur un process qui tourne des semaines.
const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [token, entry] of reconnectTokens) {
    if (now > entry.expiresAt) reconnectTokens.delete(token)
  }
}, 10 * 60 * 1000)
cleanupTimer.unref?.()
