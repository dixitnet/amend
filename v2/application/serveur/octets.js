// La lecture d'un corps brut borné, commune aux envois d'images et de polices (audit du 16/11/2026).

/** Lit le corps brut, sans dépasser `max` octets (au-delà : `null`, et rien
 * de plus n'est gardé ; la connexion se ferme après la réponse). */
export function lireOctets(req, max) {
  return new Promise((resolve, reject) => {
    const morceaux = []
    let taille = 0
    req.on('data', (m) => {
      taille += m.length
      if (taille > max) {
        morceaux.length = 0
        req.removeAllListeners('data')
        req.pause()
        return resolve(null)
      }
      morceaux.push(m)
    })
    req.on('end', () => resolve(new Uint8Array(Buffer.concat(morceaux))))
    req.on('error', reject)
  })
}
