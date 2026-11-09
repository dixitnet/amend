// Les appels aux routes des commentaires (couche application), pour le
// magasin de fils de l'adaptateur BlockNote. Les codes d'erreur du serveur
// remontent tels quels (`err.code`) ; aucun texte ici.
async function appel(methode, chemin, corps) {
  const r = await fetch(chemin, {
    method: methode,
    headers: corps === undefined ? {} : { 'content-type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const donnees = await r.json().catch(() => ({}))
  if (!r.ok)
    throw Object.assign(new Error(donnees.code || `http-${r.status}`), { code: donnees.code || `http-${r.status}` })
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
