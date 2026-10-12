// La liste d'attente publique (point 45 de la feuille de route, 11/10/2026),
// sortie de Storage : un fichier `waitlist.json`, une ligne par inscription.
// Rien n'en sort sans être administrateur (voir server/routes/admin.js).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ecrireAtomique } from './fichiers.js'

const WAITLIST_MAX_LIGNES = 20_000
const WAITLIST_DOUBLON_MS = 60 * 60 * 1000

export class ListeAttente {
  /** @param {string} dataDir
   * @param {{ aUnAcces: (email: string) => boolean }} options  `aUnAcces` dit
   *   si cette adresse a déjà un rôle sur un document (statut « acces »). */
  constructor(dataDir, { aUnAcces = () => false } = {}) {
    this.chemin = join(dataDir, 'waitlist.json')
    this.aUnAcces = aUnAcces
    if (!existsSync(this.chemin)) writeFileSync(this.chemin, JSON.stringify([]), 'utf8')
  }

  /** Liste d'attente : juste un empilement d'emails avec la date, pas de
   * déduplication stricte ni de gestion pour l'instant (décision du 14/09 :
   * "on stocke les emails, on verra plus tard") — Sylvain les consultera à
   * la main en attendant un vrai dispositif d'approbation. */
  ajouter(email) {
    let list
    try {
      list = JSON.parse(readFileSync(this.chemin, 'utf8'))
    } catch {
      list = []
    }
    // Bornes (audit du 10/10/2026, S4) : l'inscription est publique, donc
    // la liste ne grossit pas sans limite. La même adresse revenue dans
    // l'heure n'ajoute pas de ligne ; au-delà du plafond, on n'ajoute plus
    // rien (c'est le signe d'un abus, pas d'un succès).
    const maintenant = Date.now()
    if (list.length >= WAITLIST_MAX_LIGNES) return false
    for (let i = list.length - 1; i >= 0; i--) {
      const ligne = list[i]
      if (ligne && ligne.email === email) {
        if (maintenant - (ligne.ts || 0) < WAITLIST_DOUBLON_MS) return false
        break
      }
    }
    list.push({ email, ts: maintenant })
    ecrireAtomique(this.chemin, JSON.stringify(list, null, 2))
    return true
  }

  /** La liste d'attente, telle quelle (dates comprises). **Réservée aux
   * administrateurs** : ce sont des adresses de personnes qui ont laissé
   * leur coordonnée, pas un annuaire. Aucune route publique n'appelle
   * cette méthode — et il n'y a pas non plus de compteur public (décision
   * du 17/09). */
  lire() {
    try {
      return JSON.parse(readFileSync(this.chemin, 'utf8'))
    } catch {
      return []
    }
  }

  /** Marque comme « embarquées » toutes les inscriptions de cette adresse
   * (01/10/2026) : la personne a reçu son premier document. La ligne reste
   * dans le fichier — c'est le journal des inscriptions, pas une file qu'on
   * vide — et porte `embarque: { ts, docId, par }`. Sans effet si l'adresse
   * n'est pas dans la liste (on peut embarquer quelqu'un qui n'a rien
   * déposé). */
  marquerEmbarque(email, docId, par) {
    let list
    try {
      list = JSON.parse(readFileSync(this.chemin, 'utf8'))
    } catch {
      return 0
    }
    let n = 0
    for (const ligne of list) {
      if (ligne && ligne.email === email) {
        ligne.embarque = { ts: Date.now(), docId, par }
        n++
      }
    }
    if (!n) return 0
    ecrireAtomique(this.chemin, JSON.stringify(list, null, 2))
    return n
  }

  /** Retire toutes les inscriptions de cette adresse (suppression de compte :
   * la personne qui s'en va ne veut pas non plus rester dans la file).
   * Renvoie le nombre de lignes retirées. */
  retirer(email) {
    let list
    try {
      list = JSON.parse(readFileSync(this.chemin, 'utf8'))
    } catch {
      return 0
    }
    if (!Array.isArray(list)) return 0
    const cible = String(email).toLowerCase()
    const gardees = list.filter((l) => !(l && typeof l.email === 'string' && l.email.toLowerCase() === cible))
    const n = list.length - gardees.length
    if (n) ecrireAtomique(this.chemin, JSON.stringify(gardees, null, 2))
    return n
  }

  /** La liste d'attente **vue comme une file** : une ligne par adresse (la
   * première inscription fixe le rang, les suivantes sont comptées), la plus
   * ancienne d'abord, avec un statut :
   *
   *  - `attente`  : personne ne lui a rien ouvert ;
   *  - `embarque` : elle a reçu son premier document (`embarque` en dit
   *    quand et lequel) ;
   *  - `acces`    : elle a déjà accès à un document par une autre voie — on
   *    ne l'embarque pas, on ne la compte pas parmi celles qui attendent.
   *
   * `enAttente` : combien d'adresses sont au statut `attente`. Lecture
   * seule, réservée aux administrateurs comme `waitlist()`. */
  file() {
    const premieres = new Map()
    for (const ligne of this.lire()) {
      if (!ligne || typeof ligne.email !== 'string') continue
      const vue = premieres.get(ligne.email)
      if (!vue) {
        premieres.set(ligne.email, {
          email: ligne.email,
          ts: ligne.ts || 0,
          inscriptions: 1,
          embarque: ligne.embarque || null,
        })
      } else {
        vue.inscriptions++
        if (ligne.ts && ligne.ts < vue.ts) vue.ts = ligne.ts
        if (ligne.embarque && !vue.embarque) vue.embarque = ligne.embarque
      }
    }
    const file = [...premieres.values()]
      .sort((a, b) => a.ts - b.ts)
      .map((l, i) => ({
        ...l,
        rang: i + 1,
        statut: l.embarque ? 'embarque' : this.aUnAcces(l.email) ? 'acces' : 'attente',
      }))
    return { file, enAttente: file.filter((l) => l.statut === 'attente').length }
  }
}
