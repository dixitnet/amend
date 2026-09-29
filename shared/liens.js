// Les adresses de lien — **partagé par le client et le serveur** (30/09/2026).
//
// Un lien dans un document partagé est une attaque en puissance sur les
// autres lecteurs : `javascript:` s'exécute dans leur session, un lien
// `https://www.amend.ink@site-pirate.example` ressemble à autre chose que
// ce qu'il est. La règle est donc une **liste blanche**, appliquée à
// chaque endroit où une adresse entre, sort ou se rend — la saisie, le
// collage, l'affichage dans l'éditeur, les quatre exports et la page
// publiée — et jamais fondée sur une liste noire (« refuser javascript: »
// en oubliera toujours un).
//
// Ce fichier est la seule définition de « une adresse acceptable ».

/** Les seuls protocoles qu'un lien peut porter. */
export const PROTOCOLES_AUTORISES = ['http:', 'https:', 'mailto:']

/** Au-delà, ce n'est plus une adresse, c'est autre chose. */
export const LONGUEUR_MAX = 2048

/**
 * L'adresse normalisée si elle est acceptable, sinon `null`.
 * Normalisée = celle que rend `URL#href` : les espaces, guillemets et
 * chevrons y sont déjà encodés, le protocole en minuscules.
 *
 * Refuse : tout protocole hors liste blanche, une adresse avec identifiant
 * ou mot de passe (`https://a@b`), un hôte vide, un caractère de contrôle.
 */
export function adresseAutorisee(href) {
  if (typeof href !== 'string') return null
  const brut = href.trim()
  if (!brut || brut.length > LONGUEUR_MAX) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(brut)) return null
  let url
  try {
    url = new URL(brut)
  } catch {
    return null
  }
  if (!PROTOCOLES_AUTORISES.includes(url.protocol)) return null
  if (url.protocol === 'mailto:') {
    // « mailto: » seul, ou sans destinataire, ne mène nulle part.
    if (!url.pathname || url.pathname.length < 3) return null
    return url.href
  }
  if (!url.hostname) return null
  if (url.username || url.password) return null
  return url.href
}

/**
 * Ce que la personne a tapé dans le champ « adresse », transformé en
 * adresse acceptable — ou `null`. Tolérant sur la forme (elle n'a pas à
 * écrire `https://`), strict sur le fond :
 *
 *   `exemple.org/page`   → `https://exemple.org/page`
 *   `moi@exemple.org`    → `mailto:moi@exemple.org`
 *   `localhost:8787`     → `https://localhost:8787/`
 *   `javascript:alert(1)`, `data:…`, `file:…` → `null`
 */
export function adresseDepuisSaisie(saisie) {
  if (typeof saisie !== 'string') return null
  const s = saisie.trim()
  if (!s) return null
  if (/^(https?:\/\/|mailto:)/i.test(s)) return adresseAutorisee(s)
  // Un protocole quelconque (`javascript:`, `data:`, `ftp:`…) — sauf
  // « hôte:port », qui a la même allure et n'en est pas un.
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^\s/:@]+:\d+([/?#]|$)/.test(s)) return null
  if (/\s/.test(s)) return null
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(s)) return adresseAutorisee('mailto:' + s)
  if (/^[^\s/@]+\.[^\s/@]+|^localhost(:\d+)?([/?#]|$)/i.test(s)) return adresseAutorisee('https://' + s)
  return null
}

/** Ce qui s'affiche quand on n'a pas de texte à mettre sur le lien : le
 * nom d'hôte, ou l'adresse électronique — pas les vingt paramètres. */
export function libelleCourt(href) {
  const a = adresseAutorisee(href)
  if (!a) return String(href || '')
  const u = new URL(a)
  if (u.protocol === 'mailto:') return decodeURIComponent(u.pathname)
  return u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname : '')
}

/** Le texte brut d'une adresse pour un passage collé : `true` si c'est
 * *uniquement* une adresse (un seul mot, avec protocole). Sert à décider
 * si un collage devient un lien. */
export function estUneAdresseSeule(texte) {
  if (typeof texte !== 'string') return false
  const t = texte.trim()
  if (!t || /\s/.test(t)) return false
  return /^(https?:\/\/|mailto:)/i.test(t) && adresseAutorisee(t) !== null
}
