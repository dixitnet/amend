// En-têtes de sécurité de l'application (audit du 10/10/2026, point 30).
//
// Jusque-là le site n'en envoyait aucun : ni CSP, ni `nosniff`, ni
// protection contre l'inclusion dans un cadre. Ils sont posés **ici**, dans
// l'application, plutôt que dans le Caddyfile : ils sont versionnés, testés,
// et valent sur toute instance. Seul HSTS reste côté Caddy (il ne concerne
// que la couche HTTPS) — voir `deploy/Caddyfile.exemple`.
//
// La politique de contenu (CSP) se déploie en deux temps, parce qu'une CSP
// trop stricte casse l'éditeur sans prévenir :
//   - `report-only` (défaut) : le navigateur signale les violations dans sa
//     console sans rien bloquer ;
//   - `enforce` : il bloque. À activer par `CSP_MODE=enforce` dans `.env`
//     une fois la console restée muette sur un parcours complet.
// `off` retire la CSP (retour en arrière immédiat).

export const MODES_CSP = ['off', 'report-only', 'enforce']

export function modeCsp(valeur) {
  const v = String(valeur || '').trim().toLowerCase()
  return MODES_CSP.includes(v) ? v : 'report-only'
}

/** La politique de l'application. Scripts uniquement de l'origine (aucun
 * script en ligne : la page d'accueil n'en a qu'un, de type JSON-LD, qui
 * est une donnée) ; styles en ligne permis parce que l'éditeur pose des
 * attributs `style` (couleurs des auteurs, marges) ; images de l'origine,
 * `data:` et `blob:` (aperçus, exports) ; connexions à l'origine et à la
 * WebSocket (Safari ancien ne comprend pas `'self'` pour `wss:`). */
export function politiqueApplication(appBaseUrl) {
  let ws = ''
  try {
    const u = new URL(appBaseUrl)
    ws = `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}`
  } catch {
    /* adresse de base illisible : 'self' seul */
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${ws ? ` ${ws}` : ''}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/**
 * Pose les en-têtes sur une réponse, avant tout `writeHead`. Les pages
 * publiées (`/p/`) posent leur propre CSP, plus stricte : on n'y ajoute
 * pas celle de l'application (un `writeHead` qui répète un en-tête écrase
 * celui-ci, mais la version « report-only » resterait en plus).
 */
export function poserEnTetes(res, { mode, politique, chemin }) {
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('x-frame-options', 'DENY')
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin')
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  if (mode === 'off' || chemin.startsWith('/p/')) return
  res.setHeader(mode === 'enforce' ? 'content-security-policy' : 'content-security-policy-report-only', politique)
}
