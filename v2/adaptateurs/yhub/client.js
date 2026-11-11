// Adaptateur y/hub (couche 2), côté de notre serveur : son client vers les
// routes de y/hub, sans charger y/hub lui-même (le serveur n'en a pas besoin,
// et y/hub pèse en mémoire). Identité : le jeton interne (voir index.js).
import * as encodage from 'lib0/buffer'

const ORGANISATION = 'amend'

const indisponible = (message) => Object.assign(new Error(message), { code: 'collaboration-indisponible' })
/** L'état encodé d'une réponse de y/hub : un `Uint8Array`, sinon la réponse est illisible.
 * (Une branche jamais écrite rend un état vide, pas une absence de `doc`.) */
function etatDe(reponse) {
  if (!(reponse?.doc instanceof Uint8Array)) throw indisponible('y/hub : réponse illisible')
  return reponse.doc
}

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
    if (!r.ok) throw indisponible(`y/hub : ${r.status}`)
    try {
      return encodage.decodeAny(new Uint8Array(await r.arrayBuffer()))
    } catch {
      throw indisponible('y/hub : réponse illisible')
    }
  }
  /** Une requête sur les deux branches ; 404 : jamais écrite, rien à faire. */
  async function surLesBranches(url, methode) {
    for (const branche of ['main', 'suggestions']) {
      const r = await fetch(url(branche), { method: methode, headers: entetes, signal: AbortSignal.timeout(5000) })
      if (!r.ok && r.status !== 404) throw indisponible(`y/hub : ${r.status}`)
    }
  }
  return {
    /** Les droits sur le document ont changé (pour `personne`, ou pour tous) :
     * ses connexions ouvertes les redemandent, texte et suggestions. */
    async revoirAcces(docId, personne = null) {
      // Les deux branches sont tentées, même si la première échoue : sinon la
      // seconde garderait ses anciens droits.
      let echec = null
      for (const branche of ['main', 'suggestions']) {
        const q = new URLSearchParams({ branch: branche, ...(personne ? { personne } : {}) })
        try {
          const r = await fetch(`${url}/reset-connections/v1/${ORGANISATION}/${encodeURIComponent(docId)}?${q}`, {
            method: 'POST',
            headers: entetes,
            signal: AbortSignal.timeout(5000),
          })
          if (!r.ok) echec ??= indisponible(`y/hub : ${r.status}`)
        } catch (e) {
          echec ??= e?.code === 'collaboration-indisponible' ? e : indisponible(`y/hub : ${e?.message ?? e}`)
        }
      }
      if (echec) throw indisponible(echec.message)
    },
    /** Efface un document dans y/hub, texte et suggestions, définitivement. */
    supprimerDocument: (docId) => surLesBranches((b) => `${adresse(docId, b)}&hard=true`, 'DELETE'),
    /** Met un document à la corbeille : y/hub déconnecte ceux qui l'ont ouvert et
     * le refuse ensuite ; le contenu est gardé (comme Docs, \`delete_ydoc\`). */
    mettreALaCorbeille: (docId) => surLesBranches((b) => adresse(docId, b), 'DELETE'),
    /** Sort un document de la corbeille (route \`restore-ydoc\`, comme Docs). */
    restaurer: (docId) =>
      surLesBranches((b) => `${url}/restore-ydoc/v1/${ORGANISATION}/${encodeURIComponent(docId)}?branch=${b}`, 'POST'),
    /** L'état encodé du texte principal. */
    lireTexte: async (docId) => etatDe(await appel(docId)),
    /** Écrit dans \`cible\` le texte principal de \`source\`, attribué à \`pour\`
     * (dupliquer, comme Docs : le texte seul, ni suggestions ni historique). */
    async copierTexte(source, cible, pour) {
      const etat = etatDe(await appel(source))
      await appel(cible, {
        method: 'PATCH',
        headers: { 'content-type': 'application/octet-stream' },
        body: encodage.encodeAny({ update: etat, customAttributions: [{ k: 'pour', v: pour }] }),
      })
    },
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
      etatDe(await appel(docId, { headers: { 'x-amend-agent': 'margo' } }, 'suggestions')),
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
