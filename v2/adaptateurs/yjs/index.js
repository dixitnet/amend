// Adaptateur Yjs 14, côté navigateur (couche 2) : ouvre un document partagé et
// sa connexion au serveur de collaboration. L'application ne manipule ni
// Y.Doc ni fournisseur : elle reçoit un contexte opaque (pour l'adaptateur de
// l'éditeur) et des abonnements en vocabulaire amend.ink.
import * as Y from '@y/y'
import { WebsocketProvider } from '@y/websocket'

/** Nom du type racine qui porte le texte (le même pour tous les documents). */
const RACINE_TEXTE = 'doc'

const ETATS = { connected: 'connecte', connecting: 'connexion', disconnected: 'deconnecte' }

/** Les auteurs des suggestions, tels que y/hub les a enregistrés (il les
 * garde, mais ne les envoie pas en direct) : à redemander après chaque
 * changement. `null` si y/hub ne répond pas. */
async function auteursDesSuggestions(url, docId) {
  const api = url.replace(/^ws/, 'http').replace(/\/ws\/v1\/([^/]+)$/, '/changeset/v1/$1')
  try {
    const r = await fetch(`${api}/${encodeURIComponent(docId)}?branch=suggestions&attributions=true`, {
      credentials: 'include',
      headers: { accept: 'application/json' },
    })
    if (!r.ok) return null
    const { attributions } = await r.json()
    return Y.decodeContentMap(Uint8Array.from(atob(attributions), (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

/**
 * @param {{ url: string, docId: string, personne: { id: string, nom: string, couleur: string }, suggestions?: boolean }} o
 *   url : adresse WebSocket de la collaboration, sans le nom du document ;
 *   suggestions : ouvrir aussi la branche des suggestions (correcteur, éditeur)
 */
export function ouvrirDocument({ url, docId, personne, suggestions = false }) {
  const doc = new Y.Doc()
  const fournisseur = new WebsocketProvider(url, docId, doc, { disableBc: true })
  fournisseur.awareness.setLocalStateField('user', { name: personne.nom, color: personne.couleur, id: personne.id })
  // Les suggestions : un second document, sur la branche `suggestions` de
  // y/hub (le montage de BlockNote : « suggestion doc »). Il reçoit le texte
  // principal (par l'éditeur) et porte en plus les propositions. Sans présence.
  let sugg = null
  if (suggestions) {
    const docS = new Y.Doc({ isSuggestionDoc: true })
    const fournisseurS = new WebsocketProvider(url, docId, docS, { disableBc: true, params: { branch: 'suggestions' } })
    fournisseurS.awareness.setLocalState(null)
    sugg = {
      doc: docS,
      fragment: docS.get(RACINE_TEXTE),
      fournisseur: fournisseurS,
      auteurs: () => auteursDesSuggestions(url, docId),
    }
  }
  return {
    /** Pour l'adaptateur de l'éditeur, et lui seul. */
    contexte: { doc, fragment: doc.get(RACINE_TEXTE), fournisseur, suggestions: sugg },
    surEtat(rappel) {
      const f = ({ status }) => rappel(ETATS[status] || 'deconnecte')
      fournisseur.on('status', f)
      rappel(fournisseur.wsconnected ? 'connecte' : 'connexion')
      return () => fournisseur.off('status', f)
    },
    /** Rappelé avec le nombre d'autres personnes présentes sur le document. */
    surParticipants(rappel) {
      const aw = fournisseur.awareness
      const f = () => rappel(Math.max(0, aw.getStates().size - 1))
      aw.on('change', f)
      f()
      return () => aw.off('change', f)
    },
    fermer() {
      sugg?.fournisseur.destroy()
      sugg?.doc.destroy()
      fournisseur.destroy()
      doc.destroy()
    },
  }
}
