// Limiteur de débit à fenêtre glissante, en mémoire.
//
// Il remplace sept copies du même code (pages publiées, liste d'attente,
// messages de contact, liens magiques, échecs d'adresse des agents, dialogue,
// écritures des agents) : chacune filtrait des horodatages, poussait le
// sien et nettoyait la carte à sa façon. Audit du 10/10/2026, point A9.
//
// En mémoire et propre à un processus. Depuis le 13/10/2026, un limiteur peut
// être **adopté** par le `RegistreLimiteurs` (server/limiteurs.js), qui garde
// ses horodatages sur le disque : un redémarrage ou un déploiement ne remet
// alors plus les compteurs à zéro. Sans registre (les tests, les limiteurs
// de quelques secondes), il reste purement en mémoire. Ça freine un doigt qui
// reste appuyé et un balayage depuis une machine ; ça n'arrête pas un
// adversaire distribué.

export class Limiteur {
  /**
   * @param {object} options
   * @param {number} options.max          nombre d'événements tolérés dans la fenêtre
   * @param {number} options.fenetreMs    durée de la fenêtre
   * @param {() => number} [options.maintenant]  horloge (injectée par les tests)
   * @param {number} [options.cles]       au-delà, on purge les clés éteintes
   */
  constructor({ max, fenetreMs, maintenant = () => Date.now(), cles = 5000 }) {
    this.max = max
    this.fenetreMs = fenetreMs
    this.maintenant = maintenant
    this.clesMax = cles
    this.parCle = new Map()
    /** Appelé après chaque enregistrement (le registre y accroche son écriture différée). */
    this.surChangement = null
  }

  /** Les horodatages encore dans la fenêtre pour cette clé. */
  _recents(cle) {
    const maintenant = this.maintenant()
    const recents = (this.parCle.get(cle) || []).filter((t) => maintenant - t < this.fenetreMs)
    if (recents.length) this.parCle.set(cle, recents)
    else this.parCle.delete(cle)
    return recents
  }

  /** Combien d'événements dans la fenêtre. */
  compter(cle) {
    return this._recents(cle).length
  }

  /** Vrai si la limite est atteinte (sans rien enregistrer). */
  atteint(cle) {
    return this._recents(cle).length >= this.max
  }

  /** L'instant (ms) où la plus ancienne tentative encore comptée sortira de la
   * fenêtre — donc celui où une place se libère —, ou `null` si la clé n'a
   * rien de compté. */
  libereA(cle) {
    const recents = this._recents(cle)
    return recents.length ? Math.min(...recents) + this.fenetreMs : null
  }

  /** Enregistre un événement et renvoie le nombre d'événements dans la
   * fenêtre, celui-ci compris. Pour les usages où **chaque tentative
   * compte**, y compris celles qu'on refuse (adresses de pages publiées). */
  noter(cle) {
    const recents = this._recents(cle)
    recents.push(this.maintenant())
    this.parCle.set(cle, recents)
    if (this.parCle.size > this.clesMax) this._purger()
    if (this.surChangement) this.surChangement()
    return recents.length
  }

  /** Ce qui est encore dans la fenêtre, `{ clé: [horodatages] }`, pour la sauvegarde. */
  exporter() {
    const maintenant = this.maintenant()
    const sortie = {}
    for (const [cle, v] of this.parCle) {
      const recents = v.filter((t) => maintenant - t < this.fenetreMs)
      if (recents.length) sortie[cle] = recents
    }
    return sortie
  }

  /** Reprend un état sauvegardé. Tolérant : ce qui n'est pas un horodatage
   * plausible (nombre fini, pas dans le futur, dans la fenêtre) est ignoré. */
  importer(etat) {
    if (!etat || typeof etat !== 'object') return
    const maintenant = this.maintenant()
    for (const [cle, v] of Object.entries(etat)) {
      if (!Array.isArray(v)) continue
      const recents = v
        .filter((t) => Number.isFinite(t) && t <= maintenant && maintenant - t < this.fenetreMs)
        .sort((a, b) => a - b)
      if (recents.length) this.parCle.set(cle, recents)
    }
  }

  /** Enregistre l'événement **si la limite n'est pas atteinte**. Vrai si
   * l'événement est autorisé ; un refus ne consomme rien. */
  essayer(cle) {
    if (this.atteint(cle)) return false
    this.noter(cle)
    return true
  }

  _purger() {
    const maintenant = this.maintenant()
    for (const [cle, v] of this.parCle) {
      if (!v.some((t) => maintenant - t < this.fenetreMs)) this.parCle.delete(cle)
    }
  }
}
