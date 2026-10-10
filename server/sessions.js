// Révocation des sessions (audit S8, 10/10/2026).
//
// Une session est un cookie signé, sans état côté serveur : la déconnexion
// n'efface que le cookie du navigateur qui la demande, et un cookie volé (ou
// resté sur un ordinateur prêté) valait ses 30 jours, quoi qu'on fasse. Le
// seul coupe-circuit était de changer `SESSION_SECRET`, c'est-à-dire de
// déconnecter *tout le monde*.
//
// Ici : pour chaque adresse, **l'instant avant lequel les sessions ne
// valent plus**. « Se déconnecter partout » l'avance à maintenant ; tout
// cookie émis avant (ou à cet instant) est refusé par `readSession`. Les
// sessions ouvertes ensuite (nouveau lien magique, invitation) valent
// normalement. Dans un fichier à part (`sessions-revoquees.json`) plutôt que
// dans `users.json` : une adresse qui n'a jamais nommé son compte peut
// quand même vouloir se déconnecter, et un compte à demi rempli (sans nom ni
// couleur) casserait les lecteurs de `users.json`.
//
// Lu à travers un cache invalidé par la taille et la date du fichier : on
// l'interroge à chaque requête authentifiée, et relire un JSON à chaque
// fois serait de l'argent jeté.

import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { lireJson, ecrireJsonAtomique } from './fichiers.js'

export class SessionsRevoquees {
  constructor(dataDir) {
    this.path = join(dataDir, 'sessions-revoquees.json')
    this._signature = null
    this._cache = {}
  }

  _registre() {
    if (!existsSync(this.path)) {
      this._signature = null
      this._cache = {}
      return this._cache
    }
    const st = statSync(this.path)
    const signature = `${st.mtimeMs}:${st.size}`
    if (signature !== this._signature) {
      // Illisible : `lireJson` lève (et met le fichier de côté) plutôt que de
      // renvoyer « personne n'est révoqué » — ouvrir des sessions révoquées
      // sur un fichier tronqué serait pire qu'une erreur.
      this._cache = lireJson(this.path, {})
      this._signature = signature
    }
    return this._cache
  }

  /** L'instant (ms) avant lequel les sessions de cette adresse sont
   * refusées ; 0 si elle n'a jamais rien révoqué. */
  validesDepuis(email) {
    if (!email) return 0
    return Number(this._registre()[email]) || 0
  }

  /** Révoque toutes les sessions émises jusqu'ici pour cette adresse. */
  revoquer(email, maintenant = Date.now()) {
    if (!email) return 0
    const registre = { ...this._registre(), [email]: maintenant }
    ecrireJsonAtomique(this.path, registre)
    this._signature = null // relu au prochain appel
    return maintenant
  }
}
