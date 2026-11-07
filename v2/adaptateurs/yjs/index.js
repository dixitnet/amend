// Adaptateur Yjs 14, côté navigateur (couche 2) : ouvre un document partagé et
// sa connexion au serveur de collaboration. L'application ne manipule ni
// Y.Doc ni fournisseur : elle reçoit un contexte opaque (pour l'adaptateur de
// l'éditeur) et des abonnements en vocabulaire amend.ink.
import * as Y from '@y/y'
import { WebsocketProvider } from '@y/websocket'

/** Nom du type racine qui porte le texte (le même pour tous les documents). */
export const RACINE_TEXTE = 'doc'

const ETATS = { connected: 'connecte', connecting: 'connexion', disconnected: 'deconnecte' }

/**
 * @param {{ url: string, docId: string, personne: { id: string, nom: string, couleur: string } }} o
 *   url : adresse WebSocket de la collaboration, sans le nom du document.
 */
export function ouvrirDocument({ url, docId, personne }) {
  const doc = new Y.Doc()
  const fournisseur = new WebsocketProvider(url, docId, doc, { disableBc: true })
  fournisseur.awareness.setLocalStateField('user', { name: personne.nom, color: personne.couleur, id: personne.id })
  return {
    /** Pour l'adaptateur de l'éditeur, et lui seul. */
    contexte: { doc, fragment: doc.get(RACINE_TEXTE), fournisseur },
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
      fournisseur.destroy()
      doc.destroy()
    },
  }
}
