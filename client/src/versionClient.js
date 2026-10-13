// Une page restée ouverte pendant un déploiement (13/10/2026).
//
// Quand le client change sans que le serveur redémarre, les onglets déjà
// ouverts gardent l'ancien code **et restent connectés**. Si l'on a ajouté un
// type de bloc entre-temps (la « ligne de séparation » du 13/10), l'ancien
// éditeur ne sait pas le construire : y-prosemirror **supprime** alors l'élément
// du document partagé, pour tout le monde, dans la milliseconde qui suit. C'est
// ce qui faisait disparaître la ligne dans « Le Jardin dès (que) possibles » —
// trois connexions de la même personne y étaient ouvertes, dont deux sur
// l'ancienne version.
//
// Une page périmée est donc dangereuse, pas seulement démodée. On la repère en
// comparant le fichier JavaScript principal qu'elle a chargé à celui que le
// serveur annonce dans sa page d'accueil, et on la recharge d'office après un
// bref préavis (les frappes sont envoyées au fur et à mesure : rien ne se perd).

const MOTIF_PRINCIPAL = /\/assets\/(index-[\w-]+\.js)/

/** Le fichier principal chargé par cette page, ou `null` (serveur de
 * développement : rien à comparer). */
export function fichierPrincipalCharge(doc = document) {
  for (const s of doc.querySelectorAll('script[src]')) {
    const m = MOTIF_PRINCIPAL.exec(s.getAttribute('src') || '')
    if (m) return m[1]
  }
  return null
}

/** `perimee`, `a_jour` ou `inconnue` (réseau coupé, page illisible, dev). */
export async function etatDeLaVersion({ doc = document, fetchFn = (...a) => fetch(...a) } = {}) {
  const charge = fichierPrincipalCharge(doc)
  if (!charge) return 'inconnue'
  try {
    const res = await fetchFn('/', { cache: 'no-store', credentials: 'omit' })
    if (!res.ok) return 'inconnue'
    const m = MOTIF_PRINCIPAL.exec(await res.text())
    if (!m) return 'inconnue'
    return m[1] === charge ? 'a_jour' : 'perimee'
  } catch {
    return 'inconnue'
  }
}

/** Le bandeau, avec son compte à rebours. Rend de quoi l'arrêter. */
export function afficherBandeauVersion({
  doc = document,
  secondes = 15,
  recharger = () => location.reload(),
  setIntervalFn = (...a) => setInterval(...a),
  clearIntervalFn = (...a) => clearInterval(...a),
} = {}) {
  const bandeau = doc.createElement('div')
  bandeau.className = 'bandeau-version'
  bandeau.setAttribute('role', 'alert')
  const texte = doc.createElement('span')
  const bouton = doc.createElement('button')
  bouton.type = 'button'
  bouton.textContent = 'Recharger maintenant'
  bandeau.append(texte, bouton)
  doc.body.append(bandeau)
  let reste = secondes
  const dire = () => {
    texte.textContent = `Une nouvelle version d’amend.ink est en ligne. Cette page se recharge dans ${reste} s, pour ne rien abîmer dans le document.`
  }
  dire()
  const arreter = () => clearIntervalFn(minuterie)
  const minuterie = setIntervalFn(() => {
    reste -= 1
    if (reste <= 0) {
      arreter()
      recharger()
      return
    }
    dire()
  }, 1000)
  bouton.addEventListener('click', () => {
    arreter()
    recharger()
  })
  return { bandeau, arreter }
}

/** À lancer une fois, au démarrage. */
export function surveillerLaVersion({
  doc = document,
  intervalleMs = 60_000,
  fetchFn,
  recharger,
  setIntervalFn = (...a) => setInterval(...a),
} = {}) {
  if (!fichierPrincipalCharge(doc)) return () => {}
  let affiche = false
  const verifier = async () => {
    if (affiche) return
    if ((await etatDeLaVersion({ doc, fetchFn })) !== 'perimee') return
    affiche = true
    afficherBandeauVersion({ doc, recharger })
  }
  const minuterie = setIntervalFn(verifier, intervalleMs)
  const auRetour = () => {
    if (doc.visibilityState === 'visible') verifier()
  }
  doc.addEventListener('visibilitychange', auRetour)
  globalThis.addEventListener?.('online', verifier)
  return () => {
    clearInterval(minuterie)
    doc.removeEventListener('visibilitychange', auRetour)
    globalThis.removeEventListener?.('online', verifier)
  }
}
