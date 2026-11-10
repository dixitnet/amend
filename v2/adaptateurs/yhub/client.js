// Adaptateur y/hub (couche 2), côté de notre serveur : son client vers les
// routes de y/hub, sans charger y/hub lui-même (le serveur n'en a pas besoin,
// et y/hub pèse en mémoire). Identité : le jeton interne (voir index.js).
import * as encodage from 'lib0/buffer'

const ORGANISATION = 'amend'

/**
 * Le client de notre serveur vers y/hub (jeton interne) : lire le texte
 * principal d'un document, et y écrire une modification attribuée à une
 * personne (l'ancre d'un commentaire, pour le correcteur qui l'a demandée).
 * @param {{ url: string, jeton: string }} o  url : la racine de l'API (…/collaboration)
 */
export function clientCollaboration({ url, jeton }) {
  const adresse = (docId, branche = 'main') =>
    `${url}/ydoc/v1/${ORGANISATION}/${encodeURIComponent(docId)}?branch=${branche}`
  const entetes = { 'x-amend-interne': jeton }
  async function appel(docId, options, branche = 'main') {
    const r = await fetch(adresse(docId, branche), {
      ...options,
      headers: { ...entetes, ...options?.headers },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) throw Object.assign(new Error(`y/hub : ${r.status}`), { code: 'collaboration-indisponible' })
    return encodage.decodeAny(new Uint8Array(await r.arrayBuffer()))
  }
  return {
    /** Efface un document dans y/hub, texte et suggestions, définitivement. */
    async supprimerDocument(docId) {
      for (const branche of ['main', 'suggestions']) {
        const r = await fetch(`${adresse(docId, branche)}&hard=true`, {
          method: 'DELETE',
          headers: entetes,
          signal: AbortSignal.timeout(5000),
        })
        // 404 : jamais écrit dans cette branche, rien à effacer.
        if (!r.ok && r.status !== 404)
          throw Object.assign(new Error(`y/hub : ${r.status}`), { code: 'collaboration-indisponible' })
      }
    },
    /** L'état encodé du texte principal. */
    lireTexte: async (docId) => (await appel(docId)).doc,
    /** Écrit une modification du texte, attribuée à `pour` (en plus du serveur). */
    ecrireTexte: (docId, mise, pour) =>
      appel(docId, {
        method: 'PATCH',
        headers: { 'content-type': 'application/octet-stream' },
        body: encodage.encodeAny({ update: mise, customAttributions: [{ k: 'pour', v: pour }] }),
      }),
    /** Les suggestions en cours (état encodé), lues au nom de Margo ; une branche
     * jamais écrite se lit vide. */
    lireSuggestions: async (docId) =>
      (await appel(docId, { headers: { 'x-amend-agent': 'margo' } }, 'suggestions')).doc,
    /** Écrit une modification dans les suggestions, attribuée à Margo (étape 8). */
    ecrireSuggestions: (docId, mise) =>
      appel(
        docId,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/octet-stream', 'x-amend-agent': 'margo' },
          body: encodage.encodeAny({ update: mise }),
        },
        'suggestions',
      ),
  }
}
