// Les feuilles de style : celle de l'instance, celle de chaque document, et
// le modèle de mise en page que chaque document a choisi (extrait de
// `Storage`, audit du 10/10/2026, A16). Le registre des documents n'est pas
// connu d'ici : on reçoit de quoi le lire et l'écrire, car le modèle choisi
// est une propriété du document, enregistrée avec lui.

import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { ecrireAtomique } from './fichiers.js'
import { fusionner, reduire, assainir } from '../shared/style.js'
import { compterEcarts, ID_DEFAUT } from '../shared/modeles.js'
import { Modeles } from './modeles.js'

export class StylesDocuments {
  /** `lireRegistre()` et `ecrireRegistre(registre)` : le registre des documents. */
  constructor(dataDir, { lireRegistre, ecrireRegistre }) {
    this.dataDir = dataDir
    this._lireRegistre = lireRegistre
    this._ecrireRegistre = ecrireRegistre
    this.stylePath = join(dataDir, 'style.json')
    // Les modèles de mise en page (01/10/2026, server/modeles.js). Le
    // registre ne sait rien des documents : on lui donne de quoi compter
    // ceux qui utilisent un modèle, et de quoi lire / écrire « Par défaut »,
    // qui est le style de l'instance.
    this.modeles = new Modeles(join(dataDir, 'modeles'), {
      lireInstance: () => this._lireStyle(this.stylePath),
      ecrireInstance: (style) => this.setStyle(style),
      enUsage: (id) => this.compterUsagesModele(id),
    })
  }

  /** Feuille de style par défaut de l'instance — celle que la page
   * « Mise en page » règle, et dont héritent les documents qui n'ont pas
   * la leur. Renvoyée complète (valeurs par défaut du code comprises). */
  getStyle() {
    return fusionner(this._lireStyle(this.stylePath))
  }

  setStyle(style) {
    return this._ecrireStyle(this.stylePath, style)
  }

  /** Feuille de style d'un document (16/09/2026). Un fichier par document,
   * à côté de son journal et de ses horodatages — surtout pas dans
   * `docs.json`, que `_readRegistry` relit et analyse plusieurs fois par
   * requête : à mille documents, un style de 840 octets chacun ferait
   * bientôt un mégaoctet reparsé à chaque appel d'API. Celui-ci n'est lu
   * qu'à l'ouverture du panneau et à l'export. */
  _stylePath(id) {
    return join(this.dataDir, `${id}.style.json`)
  }

  /** `true` si ce document a sa propre mise en page. Tant que c'est faux,
   * il suit le style par défaut de l'instance — y compris quand celui-ci
   * change. Dès qu'un éditeur y touche, elle devient la sienne et ne bouge
   * plus : une feuille de style d'instance modifiée ne doit pas reflouer
   * silencieusement sur un livre en cours. */
  hasOwnStyle(id) {
    return existsSync(this._stylePath(id))
  }

  /** Le modèle de mise en page d'un document (01/10/2026) : son
   * identifiant s'il en a choisi un et qu'il existe encore, sinon « Par
   * défaut ». C'est une **propriété du document** — enregistrée avec lui,
   * la même pour tous ses collaborateurs. */
  modeleDuDocument(id) {
    const meta = this._lireRegistre()[id]
    return this.modeles.effectif(meta && meta.modele)
  }

  /** La feuille de style effective d'un document : valeurs par défaut du
   * code, puis le calque de son modèle (« Par défaut » = le style de
   * l'instance, tant qu'il n'a pas choisi), puis ses propres écarts. */
  getDocStyle(id) {
    return fusionner(this.modeles.couche(this.modeleDuDocument(id)), this._lireStyle(this._stylePath(id)))
  }

  /** Le calque de son modèle, complet : ce par rapport à quoi un document
   * enregistre ses écarts (voir `reduire`). */
  _baseDuDocument(id) {
    return fusionner(this.modeles.couche(this.modeleDuDocument(id)))
  }

  setDocStyle(id, style) {
    // Le modèle est passé à `reduire` : sans lui, un réglage ramené à la
    // valeur codée en dur (page A4 quand le modèle est en A5) disparaît du
    // fichier et le document retombe sur son modèle — voir `reduire`.
    // Deux régimes (voir `reduire`) : un document sur « Par défaut » fige
    // ce qu'il tient de l'instance (comportement d'avant les modèles) ; un
    // document qui a **choisi** un modèle n'enregistre que ses écarts à lui.
    const seulement = this.modeleDuDocument(id) !== ID_DEFAUT
    return this._ecrireStyle(this._stylePath(id), style, this._baseDuDocument(id), { seulement })
  }

  /** Combien de réglages propres ce document porte **réellement** par
   * rapport à son modèle : on compare la feuille effective à celle du
   * modèle, plutôt que de compter le fichier — un document sur « Par
   * défaut » en a figé beaucoup qui ne s'écartent de rien. */
  ecartsDuDocument(id) {
    if (!this.hasOwnStyle(id)) return 0
    return compterEcarts(reduire(this.getDocStyle(id), this._baseDuDocument(id), { seulement: true }))
  }

  /** Repasse un document à son modèle : on efface son fichier d'écarts. */
  resetDocStyle(id) {
    const p = this._stylePath(id)
    if (existsSync(p)) unlinkSync(p)
    return this.getDocStyle(id)
  }

  /** Change le modèle d'un document. Par défaut ses écarts propres sont
   * **abandonnés** : un réglage de page fait pour l'ancien modèle (un A5
   * demandé sur « Livre ») n'a plus de sens sur le nouveau, et conserver
   * des écarts en silence ferait que le document ne ressemble ni à l'un ni à
   * l'autre. `garderEcarts` les conserve quand même. Renvoie `null` si le
   * document n'existe pas. */
  setDocModele(id, modeleId, { garderEcarts = false } = {}) {
    const registry = this._lireRegistre()
    if (!registry[id]) return null
    if (modeleId === ID_DEFAUT) delete registry[id].modele
    else registry[id].modele = modeleId
    this._ecrireRegistre(registry)
    if (!garderEcarts) this.resetDocStyle(id)
    return this.getDocStyle(id)
  }

  /** Tous les décomptes d'un coup (identifiant → nombre), pour la liste des
   * modèles : un seul passage sur le registre plutôt qu'un par modèle. */
  usagesModeles() {
    const n = new Map()
    for (const meta of Object.values(this._lireRegistre())) {
      const id = this.modeles.effectif(meta && meta.modele)
      n.set(id, (n.get(id) || 0) + 1)
    }
    return n
  }

  /** Combien de documents utilisent ce modèle. « Par défaut » compte aussi
   * ceux qui n'en ont jamais choisi, et ceux dont le modèle a disparu. */
  compterUsagesModele(modeleId) {
    let n = 0
    for (const meta of Object.values(this._lireRegistre())) {
      const effectif = this.modeles.effectif(meta && meta.modele)
      if (effectif === modeleId) n++
    }
    return n
  }

  _lireStyle(path) {
    try {
      return JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      return null
    }
  }

  /** On n'enregistre que les écarts aux valeurs par défaut (`reduire`) :
   * un réglage qu'on n'a pas touché continue de suivre le défaut, et un
   * réglage ajouté plus tard au modèle apparaît tout seul. Écriture
   * atomique, comme le registre. */
  _ecrireStyle(path, style, instance = null, options = {}) {
    // `assainir` : ce qui est enregistré est toujours dans le domaine que
    // le modèle sait rendre (listes fermées, bornes) — un modèle partagé
    // porteur d'une marge « abc » ferait échouer l'export de tous ses
    // documents.
    const complet = assainir(style)
    ecrireAtomique(path, JSON.stringify(reduire(complet, instance, options), null, 2))
    return complet
  }

  /** L'effacement d'un document emporte ses écarts de style. */
  supprimerDuDocument(id) {
    const p = this._stylePath(id)
    if (existsSync(p)) unlinkSync(p)
  }
}
