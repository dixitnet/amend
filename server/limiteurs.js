// Les plafonds par fenêtre, gardés d'un redémarrage à l'autre (point 25 de la
// feuille de route, 13/10/2026).
//
// Jusqu'ici les `Limiteur` vivaient en mémoire : chaque déploiement
// (`deploy.sh`) ou redémarrage remettait à zéro les compteurs d'inscriptions,
// de messages de contact, d'invitations, de liens de connexion, d'essais sur
// les pages publiées et de demandes d'IA par heure. Quelqu'un qui avait épuisé
// ses cinq liens de connexion de l'heure en retrouvait cinq autres au
// prochain déploiement ; le plafond de 30 essais sur les pages publiées
// n'arrêtait plus un balayage qu'à l'intervalle entre deux déploiements.
//
// Un seul fichier, `data/limiteurs.json`, tient les horodatages encore dans la
// fenêtre de chaque limiteur adopté. Il est écrit **au plus une fois toutes
// les deux secondes** (les compteurs bougent à chaque requête sensible, pas
// besoin de sync disque à chacune) et **une dernière fois à l'arrêt propre**.
// Un arrêt brutal (coupure, kill -9) perd au pire deux secondes de comptage :
// c'est mieux que tout, et ça ne bloque jamais une requête.
//
// Ce qu'il contient : des adresses courriel et des origines réseau (IP), pour
// la durée d'une fenêtre au plus (une heure, vingt-quatre pour les
// invitations) — chaque limiteur ne garde que ce qui est encore dans sa
// fenêtre, à l'écriture comme au chargement. Rien n'est conservé au-delà.
//
// Le fichier est facultatif : absent, illisible ou d'un autre format, on
// repart de zéro (le comportement d'avant) sans rien refuser. Ce n'est pas
// une donnée à protéger comme `docs.json`.

import { join } from 'node:path'
import { ecrireAtomique, lireJson } from './fichiers.js'

const VERSION = 1

export class RegistreLimiteurs {
  /**
   * @param {string} dataDir
   * @param {object} [options]
   * @param {number} [options.delaiMs]  délai maximal entre un changement et son écriture
   */
  constructor(dataDir, { delaiMs = 2000 } = {}) {
    this.chemin = join(dataDir, 'limiteurs.json')
    this.delaiMs = delaiMs
    this.limiteurs = new Map()
    this.minuteur = null
    this.etat = this._charger()
  }

  _charger() {
    try {
      const brut = lireJson(this.chemin, {})
      return brut && brut.version === VERSION && brut.limiteurs && typeof brut.limiteurs === 'object' ? brut.limiteurs : {}
    } catch {
      return {}
    }
  }

  /** Reprend l'état gardé pour `nom` (s'il y en a un) et se charge désormais
   * de le sauvegarder. Renvoie le limiteur, pour s'écrire en une ligne :
   * `const l = registre.adopter('contact', new Limiteur(…))`. */
  adopter(nom, limiteur) {
    if (this.limiteurs.has(nom)) throw new Error(`limiteur déjà adopté : ${nom}`)
    limiteur.importer(this.etat[nom])
    limiteur.surChangement = () => this.planifier()
    this.limiteurs.set(nom, limiteur)
    return limiteur
  }

  planifier() {
    if (this.minuteur) return
    this.minuteur = setTimeout(() => {
      this.minuteur = null
      this.sauver()
    }, this.delaiMs)
    if (this.minuteur.unref) this.minuteur.unref()
  }

  /** Écrit tout de suite, au mieux : une panne d'écriture ne doit rien empêcher. */
  sauver() {
    const limiteurs = {}
    for (const [nom, l] of this.limiteurs) {
      const e = l.exporter()
      if (Object.keys(e).length) limiteurs[nom] = e
    }
    try {
      ecrireAtomique(this.chemin, JSON.stringify({ version: VERSION, limiteurs }), { mode: 0o600 })
    } catch (err) {
      console.error('[amend] compteurs de limites non enregistrés :', err.message)
    }
  }

  /** À l'arrêt propre : annule l'écriture différée et écrit maintenant. */
  arreter() {
    if (this.minuteur) {
      clearTimeout(this.minuteur)
      this.minuteur = null
    }
    this.sauver()
  }
}
