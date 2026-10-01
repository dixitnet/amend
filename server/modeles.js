// Le registre des modèles de mise en page (01/10/2026) — voir
// shared/modeles.js pour ce qu'est un modèle et claude/etude-modeles-mise-
// en-page.md §0 pour les décisions.
//
// Ce module ne connaît que des feuilles de style et des fichiers :
// `data/modeles/<id>.json`, un par modèle, écrits en atomique comme le reste.
// Il ne sait ni qui est administrateur ni quels documents existent : ce qu'il
// lui faut du dehors lui est donné (`lireInstance`, `ecrireInstance`,
// `enUsage`), de sorte qu'il se teste sans serveur.
//
// Ce que le serveur garde d'un modèle est **fermé** : `assainir` ramène toute
// valeur dans les listes et les bornes du modèle de feuille de style, et le
// nom est un texte court sans caractères de contrôle. Aucun CSS ni Typst
// libre ne peut entrer par là — un modèle de l'instance touche tous les
// documents qui l'utilisent.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fusionner, reduire, assainir } from '../shared/style.js'
import { MODELES_LIVRES, modeleLivre, ID_DEFAUT, NOM_DEFAUT } from '../shared/modeles.js'

const ID_STOCKE = /^m-[0-9a-f]{8}$/
export const NOM_MAX = 60

/** Un nom de modèle propre, ou `null` : espaces compactés, caractères de
 * contrôle retirés, 1 à NOM_MAX caractères. */
export function nomValide(nom) {
  if (typeof nom !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const propre = nom.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!propre || propre.length > NOM_MAX) return null
  return propre
}

export class Modeles {
  /**
   * @param {string} dossier  `data/modeles`
   * @param {object} hotes
   * @param {() => object|null} hotes.lireInstance   calque réduit du style par défaut
   * @param {(style: object) => object} hotes.ecrireInstance  l'enregistre (renvoie le style complet)
   * @param {(id: string) => number} hotes.enUsage  combien de documents utilisent ce modèle
   */
  constructor(dossier, { lireInstance, ecrireInstance, enUsage }) {
    this.dossier = dossier
    this.lireInstance = lireInstance
    this.ecrireInstance = ecrireInstance
    this.enUsage = enUsage
  }

  _chemin(id) {
    return join(this.dossier, `${id}.json`)
  }

  _lire(id) {
    if (!ID_STOCKE.test(id)) return null
    try {
      return JSON.parse(readFileSync(this._chemin(id), 'utf8'))
    } catch {
      return null
    }
  }

  _ecrire(modele) {
    if (!existsSync(this.dossier)) mkdirSync(this.dossier, { recursive: true })
    const tmp = this._chemin(modele.id) + '.tmp'
    writeFileSync(tmp, JSON.stringify(modele, null, 2), 'utf8')
    renameSync(tmp, this._chemin(modele.id))
  }

  /** Un modèle, ou `null`. Forme commune aux trois portées :
   * `{ id, nom, portee, proprietaire?, style }` où `style` est le calque
   * (réduit pour un modèle stocké, partiel pour un livré, tel qu'enregistré
   * pour « Par défaut »). Aucun contrôle d'accès ici. */
  obtenir(id) {
    if (typeof id !== 'string') return null
    if (id === ID_DEFAUT) {
      return { id: ID_DEFAUT, nom: NOM_DEFAUT, portee: 'instance', defaut: true, style: this.lireInstance() || {} }
    }
    const livre = modeleLivre(id)
    if (livre) return { id: livre.id, nom: livre.nom, portee: 'livre', description: livre.description, style: livre.style }
    const m = this._lire(id)
    if (!m) return null
    return { id: m.id, nom: m.nom, portee: m.portee, proprietaire: m.proprietaire || null, creeLe: m.creeLe, modifieLe: m.modifieLe, style: m.style || {} }
  }

  existe(id) {
    return this.obtenir(id) !== null
  }

  /** Le calque à empiler sous les écarts d'un document. Un identifiant
   * absent ou qui n'existe plus (modèle supprimé à la main sur le disque)
   * retombe sur « Par défaut » : un document ne reste jamais sans mise en
   * page. */
  couche(id) {
    const m = id ? this.obtenir(id) : null
    return (m || this.obtenir(ID_DEFAUT)).style
  }

  /** L'identifiant effectivement appliqué : celui qui est demandé s'il
   * existe, sinon « Par défaut ». */
  effectif(id) {
    return id && this.existe(id) ? id : ID_DEFAUT
  }

  /** Qui voit ce modèle. Les livrés et ceux de l'instance : tout le monde ;
   * un modèle personnel : son propriétaire seul — pas même un administrateur
   * (ce sont des préférences, pas des données d'exploitation). */
  visiblePour(modele, email) {
    if (!modele) return false
    if (modele.portee !== 'perso') return true
    return !!email && modele.proprietaire === email
  }

  /** Qui peut modifier ou supprimer ce modèle. « Par défaut » et ceux de
   * l'instance : les administrateurs ; un modèle personnel : son
   * propriétaire ; un livré : personne. */
  peutModifier(modele, email, admin) {
    if (!modele) return false
    if (modele.portee === 'livre') return false
    if (modele.portee === 'instance') return !!admin
    return !!email && modele.proprietaire === email
  }

  /** Les modèles visibles par cette personne, rangés : « Par défaut », les
   * livrés, ceux de l'instance, puis les siens — chacun avec son style
   * **complet** (pour afficher le format sans refaire la fusion). */
  lister(email) {
    const stockes = []
    if (existsSync(this.dossier)) {
      for (const f of readdirSync(this.dossier)) {
        const m = f.endsWith('.json') ? this._lire(f.slice(0, -5)) : null
        if (m) stockes.push(m)
      }
    }
    const nom = (a, b) => a.nom.localeCompare(b.nom, 'fr')
    const instance = stockes.filter((m) => m.portee === 'instance').sort(nom)
    const persos = stockes.filter((m) => m.portee === 'perso' && email && m.proprietaire === email).sort(nom)
    const tous = [
      this.obtenir(ID_DEFAUT),
      ...MODELES_LIVRES.map((l) => this.obtenir(l.id)),
      ...instance.map((m) => this.obtenir(m.id)),
      ...persos.map((m) => this.obtenir(m.id)),
    ]
    return tous.map((m) => ({ ...m, style: fusionner(m.style) }))
  }

  /** Duplique un modèle (visible par l'appelant, c'est à la route de le
   * vérifier) en un nouveau, personnel ou — si `portee` vaut `instance` —
   * de l'instance. Jamais une page blanche : on part d'un existant. */
  creer({ nom, depuis, portee, email }) {
    const propre = nomValide(nom)
    if (!propre) throw new Error('nom invalide')
    const source = this.obtenir(depuis)
    if (!source) throw new Error('modèle de départ introuvable')
    const maintenant = Date.now()
    const modele = {
      id: `m-${randomBytes(4).toString('hex')}`,
      nom: propre,
      portee: portee === 'instance' ? 'instance' : 'perso',
      proprietaire: portee === 'instance' ? null : email,
      style: reduire(assainir(fusionner(source.style))),
      creeLe: maintenant,
      modifieLe: maintenant,
    }
    this._ecrire(modele)
    return this.obtenir(modele.id)
  }

  renommer(id, nom) {
    const propre = nomValide(nom)
    if (!propre) throw new Error('nom invalide')
    const m = this._lire(id)
    if (!m) throw new Error('modèle introuvable')
    m.nom = propre
    m.modifieLe = Date.now()
    this._ecrire(m)
    return this.obtenir(id)
  }

  /** Remplace la mise en page d'un modèle. « Par défaut » passe par le
   * stockage de l'instance (`style.json`), comme avant. */
  ecrireStyle(id, style) {
    if (id === ID_DEFAUT) {
      this.ecrireInstance(style)
      return this.obtenir(ID_DEFAUT)
    }
    const m = this._lire(id)
    if (!m) throw new Error('modèle introuvable')
    m.style = reduire(assainir(style))
    m.modifieLe = Date.now()
    this._ecrire(m)
    return this.obtenir(id)
  }

  /** Supprime un modèle stocké. Refuse « Par défaut », un livré, et un
   * modèle **utilisé** : l'erreur porte le nombre de documents. */
  supprimer(id) {
    const m = this._lire(id)
    if (!m) throw new Error('modèle introuvable')
    const n = this.enUsage(id)
    if (n > 0) {
      const err = new Error('modèle utilisé')
      err.utilisePar = n
      throw err
    }
    unlinkSync(this._chemin(id))
  }
}
