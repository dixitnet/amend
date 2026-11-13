// Les appels aux routes des commentaires (couche application), pour le
// magasin de fils de l'adaptateur BlockNote. Les codes d'erreur du serveur
// remontent tels quels (`err.code`) ; aucun texte ici.

const CLE_RECHARGE = 'amend2.session.rechargee'

/** Session expirée en cours d'usage : on recharge la page, le chargement
 * initial montre alors l'écran de connexion. Une seule fois, tant que la
 * session n'est pas revenue (drapeau effacé quand /api/moi répond 200,
 * voir `sessionRetrouvee`). Sans stockage, pas de garde-fou : pas de rechargement. */
function rechargerSiSessionExpiree() {
  try {
    if (sessionStorage.getItem(CLE_RECHARGE)) return
    sessionStorage.setItem(CLE_RECHARGE, '1')
  } catch {
    return
  }
  location.reload()
}
/** À appeler quand `/api/moi` répond 200. */
export function sessionRetrouvee() {
  try {
    sessionStorage.removeItem(CLE_RECHARGE)
  } catch {
    // Stockage refusé : rien à effacer.
  }
}

/** Un appel JSON à nos routes ; une réponse en erreur lève avec son code.
 * Le seul de l'application (App.jsx s'en sert aussi ; audit du 10/11/2026). */
export async function appel(methode, chemin, corps) {
  const r = await fetch(chemin, {
    method: methode,
    headers: corps === undefined ? {} : { 'content-type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const donnees = await r.json().catch(() => ({}))
  if (r.status === 401 && chemin !== '/api/moi' && chemin !== '/api/connexion') rechargerSiSessionExpiree()
  if (!r.ok)
    throw Object.assign(new Error(donnees.code || `http-${r.status}`), { code: donnees.code || `http-${r.status}` })
  return donnees
}

/** Envoie une image d'un document (lots du 11/11/2026, lot B) ; rend son
 * adresse ; une réponse en erreur lève avec son code, comme \`appel\`. */
export async function envoyerImage(docId, fichier) {
  const r = await fetch(`/api/documents/${encodeURIComponent(docId)}/images`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: fichier,
  })
  const donnees = await r.json().catch(() => ({}))
  if (!r.ok)
    throw Object.assign(new Error(donnees.code || `http-${r.status}`), { code: donnees.code || `http-${r.status}` })
  return donnees.url
}

/** Envoie un fichier de police de l'instance (13/11/2026) ; une réponse en
 * erreur lève avec son code et la famille en cause, comme \`appel\`. */
export async function envoyerPolice(fichier) {
  const r = await fetch('/api/admin/polices', {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-amend-fichier': encodeURIComponent(fichier.name) },
    body: fichier,
  })
  const donnees = await r.json().catch(() => ({}))
  if (!r.ok) {
    const code = donnees.code || `http-${r.status}`
    throw Object.assign(new Error(code), { code, famille: donnees.famille ?? null })
  }
  return donnees
}

/** Le service des commentaires d'un document. */
export function serviceCommentaires(docId) {
  const base = `/api/documents/${encodeURIComponent(docId)}/fils`
  const c = (fil, id) => `${base}/${fil}/commentaires/${id}`
  return {
    lister: () => appel('GET', base),
    creer: (corps, metadonnees) => appel('POST', base, { corps, metadonnees }),
    repondre: (fil, corps) => appel('POST', `${base}/${fil}/commentaires`, { corps }),
    modifier: (fil, id, corps) => appel('PUT', c(fil, id), { corps }),
    supprimer: (fil, id) => appel('DELETE', c(fil, id)),
    supprimerFil: (fil) => appel('DELETE', `${base}/${fil}`),
    resoudre: (fil) => appel('POST', `${base}/${fil}/resoudre`),
    rouvrir: (fil) => appel('POST', `${base}/${fil}/rouvrir`),
    reagir: (fil, id, emoji) => appel('POST', `${c(fil, id)}/reactions`, { emoji }),
    retirerReaction: (fil, id, emoji) => appel('DELETE', `${c(fil, id)}/reactions/${encodeURIComponent(emoji)}`),
    ancrer: (fil, ancre) => appel('POST', `${base}/${fil}/ancre`, ancre),
    /** Prévient à chaque changement des fils ; rend la fonction qui arrête. */
    abonner(rappel) {
      const flux = new EventSource(`${base}/evenements`)
      flux.onmessage = () => rappel()
      return () => flux.close()
    },
  }
}

/** Les noms d'une liste de personnes, dans la forme qu'attend BlockNote. */
export async function nomsDe(ids) {
  const q = new URLSearchParams(ids.map((id) => ['id', id]))
  const liste = await appel('GET', `/api/personnes?${q}`).catch(() => [])
  return ids.map((id) => ({ id, username: liste.find((p) => p.id === id)?.nom ?? id, avatarUrl: '' }))
}
