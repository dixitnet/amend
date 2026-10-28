// Le registre des modèles de mise en page (01/10/2026) — voir
// shared/modeles.js pour ce qu'est un modèle et claude/etude-modeles-mise-
// en-page.md §0 pour les décisions.
//
// Ce module ne connaît que des feuilles de style et des fichiers. Depuis le
// 28/10/2026, un modèle stocké est **deux fichiers** dans `data/modeles/` :
//
//  - `<id>.css`  : sa mise en page, en CSS d'impression (shared/profilCss.js).
//    C'est « le fichier du modèle » : lisible, complet, identifiable ;
//  - `<id>.json` : ce que le CSS ne dit pas — nom, catégorie, portée,
//    propriétaire, dates.
//
// Les modèles d'avant (un seul `<id>.json` portant `style`) sont convertis au
// démarrage (`migrer`) : le CSS est écrit et **relu** avant que le JSON ne
// perde son `style`, et un modèle dont la relecture ne redonne pas la même
// mise en page reste tel quel plutôt que de perdre un réglage.
//
// Il ne sait ni qui est administrateur ni quels documents existent : ce qu'il
// lui faut du dehors lui est donné (`lireInstance`, `ecrireInstance`,
// `enUsage`), de sorte qu'il se teste sans serveur.
//
// Ce que le serveur garde d'un modèle est **fermé** : le CSS est lu par un
// profil qui ne retient que des valeurs reconnues, `assainir` les ramène dans
// les listes et les bornes du modèle de feuille de style, et le CSS gardé est
// réécrit à partir de ces valeurs, jamais du texte reçu. Le nom et la
// catégorie sont des textes courts sans caractères de contrôle. Aucun CSS ni
// Typst libre ne peut entrer par là — un modèle de l'instance touche tous les
// documents qui l'utilisent.

import { existsSync, mkdirSync, readFileSync, unlinkSync, readdirSync } from 'node:fs'
import { ecrireAtomique } from './fichiers.js'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fusionner, reduire, assainir } from '../shared/style.js'
import { ecrireProfil, lireProfil } from '../shared/profilCss.js'
import {
  MODELES_LIVRES,
  modeleLivre,
  modeleLivreSemable,
  ID_DEFAUT,
  NOM_DEFAUT,
  categorieValide,
  categorieReservee,
  comparerModeles,
  CATEGORIE_AMEND,
} from '../shared/modeles.js'

const ID_STOCKE = /^m-[0-9a-f]{8}$/
export const NOM_MAX = 60

// eslint-disable-next-line no-control-regex
const CARACTERES_DE_CONTROLE = /[\u0000-\u001f\u007f]/g

/** Un nom de modèle propre, ou `null` : espaces compactés, caractères de
 * contrôle retirés, 1 à NOM_MAX caractères. */
export function nomValide(nom) {
  if (typeof nom !== 'string') return null
  const propre = nom.replace(CARACTERES_DE_CONTROLE, ' ').replace(/\s+/g, ' ').trim()
  if (!propre || propre.length > NOM_MAX) return null
  return propre
}

/** Ce qu'un aller-retour par le CSS ne conserve pas, ôté pour comparer : les
 * côtés d'un format libre quand le format est nommé, et l'orientation d'un
 * format libre (210 × 148 *est* un paysage). Aucun n'a d'effet sur l'export. */
function sansReste(reduit) {
  const copie = JSON.parse(JSON.stringify(reduit || {}))
  const page = copie.page
  if (page) {
    const libre = page.size === 'personnalise'
    if (!libre) {
      delete page.largeur
      delete page.hauteur
    } else delete page.orientation
    if (!Object.keys(page).length) delete copie.page
  }
  return copie
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
    try {
      this.migrer()
    } catch (err) {
      console.error('[modeles] conversion en CSS interrompue :', err.message)
    }
  }

  _chemin(id) {
    return join(this.dossier, `${id}.json`)
  }

  /** Les identifiants qu'un modèle stocké peut porter : `m-` et huit
   * chiffres hexadécimaux, ou l'identifiant d'un modèle livré copié. */
  _idStockable(id) {
    return ID_STOCKE.test(id) || !!modeleLivreSemable(id)
  }

  /** Les modèles livrés déjà copiés un jour, supprimés ou non. */
  _semes() {
    try {
      const lu = JSON.parse(readFileSync(join(this.dossier, 'semis.json'), 'utf8'))
      return Array.isArray(lu.semes) ? lu.semes.filter((x) => typeof x === 'string') : []
    } catch {
      return []
    }
  }

  _cheminCss(id) {
    return join(this.dossier, `${id}.css`)
  }

  _lire(id) {
    if (!this._idStockable(id)) return null
    try {
      return JSON.parse(readFileSync(this._chemin(id), 'utf8'))
    } catch {
      return null
    }
  }

  _creerDossier() {
    if (!existsSync(this.dossier)) mkdirSync(this.dossier, { recursive: true })
  }

  /** Les informations propres au modèle (nom, catégorie…). Un modèle d'avant
   * le CSS garde ici son `style` tant qu'il n'est pas converti. */
  _ecrireMeta(modele) {
    this._creerDossier()
    ecrireAtomique(this._chemin(modele.id), JSON.stringify(modele, null, 2))
  }

  /** Sa mise en page, en CSS : le fichier du modèle. */
  _ecrireStyle(id, style) {
    this._creerDossier()
    ecrireAtomique(this._cheminCss(id), ecrireProfil(style))
  }

  /** La mise en page d'un modèle stocké : `{ style, avertissements }`, `style`
   * étant le calque réduit. Le CSS fait foi ; à défaut (modèle pas encore
   * converti), le `style` du JSON. Un CSS illisible ne fait pas tomber le
   * serveur : le modèle retombe sur les valeurs du code, et le dit. */
  _style(meta) {
    const chemin = this._cheminCss(meta.id)
    if (existsSync(chemin)) {
      try {
        const lu = lireProfil(readFileSync(chemin, 'utf8'))
        return { style: reduire(assainir(lu.style)), avertissements: lu.avertissements }
      } catch (err) {
        return { style: {}, avertissements: [`Le fichier CSS de ce modèle n’a pas pu être lu : ${err.message}.`] }
      }
    }
    return { style: meta.style || {}, avertissements: [] }
  }

  /** Convertit les modèles d'avant le CSS. Renvoie le nombre de modèles
   * convertis. Sans danger à répéter : un modèle converti n'a plus de
   * `style` dans son JSON. */
  migrer() {
    if (!existsSync(this.dossier)) return 0
    let n = 0
    for (const f of readdirSync(this.dossier)) {
      if (!f.endsWith('.json')) continue
      const meta = this._lire(f.slice(0, -5))
      if (!meta || meta.style === undefined) continue
      if (!existsSync(this._cheminCss(meta.id))) {
        const attendu = reduire(assainir(meta.style))
        const css = ecrireProfil(fusionner(meta.style))
        const relu = reduire(assainir(lireProfil(css).style))
        if (JSON.stringify(sansReste(relu)) !== JSON.stringify(sansReste(attendu))) {
          console.error(
            `[modeles] ${meta.id} : la conversion en CSS ne redonne pas la même mise en page, laissé tel quel`
          )
          continue
        }
        this._ecrireStyle(meta.id, relu)
      }
      delete meta.style
      this._ecrireMeta(meta)
      n++
    }
    return n
  }

  /** Copie les modèles livrés dans ceux de l'instance (29/10/2026) : chacun,
   * une seule fois. Un modèle livré copié est un modèle d'instance comme un
   * autre — les administrateurs le règlent, le renomment, le rangent, le
   * suppriment — qui garde son identifiant et l'origine `origine`, de sorte
   * qu'on puisse le **rétablir** tel que le code le livre. Un modèle supprimé
   * ne revient pas : `semis.json` se souvient de ce qui a été copié, et un
   * livré ajouté plus tard par le code est copié au démarrage suivant.
   * « Texte brut » n'est pas copié. Renvoie le nombre de copies faites. */
  semer() {
    const deja = this._semes()
    const faits = []
    for (const livre of MODELES_LIVRES) {
      if (livre.fixe || deja.includes(livre.id)) continue
      if (!existsSync(this._chemin(livre.id))) {
        const maintenant = Date.now()
        this._ecrireStyle(livre.id, reduire(assainir(fusionner(livre.style))))
        this._ecrireMeta({
          id: livre.id,
          nom: livre.nom,
          categorie: livre.categorie || '',
          portee: 'instance',
          proprietaire: null,
          origine: livre.id,
          creeLe: maintenant,
          modifieLe: maintenant,
        })
      }
      faits.push(livre.id)
    }
    if (faits.length) {
      this._creerDossier()
      ecrireAtomique(join(this.dossier, 'semis.json'), JSON.stringify({ semes: [...deja, ...faits] }, null, 2))
    }
    return faits.length
  }

  /** Remet un modèle copié d'un livré tel que le code le livre : nom,
   * catégorie et mise en page. */
  retablir(id) {
    const m = this._lire(id)
    if (!m) throw new Error('modèle introuvable')
    const livre = m.origine ? modeleLivreSemable(m.origine) : null
    if (!livre) throw new Error('ce modèle ne vient pas d’un modèle livré')
    this._ecrireStyle(id, reduire(assainir(fusionner(livre.style))))
    m.nom = livre.nom
    m.categorie = livre.categorie || ''
    delete m.style
    m.modifieLe = Date.now()
    this._ecrireMeta(m)
    return this.obtenir(id)
  }

  /** Un modèle, ou `null`. Forme commune aux trois portées :
   * `{ id, nom, categorie, portee, proprietaire?, style, avertissements? }`
   * où `style` est le calque (réduit pour un modèle stocké, partiel pour un
   * livré, tel qu'enregistré pour « Par défaut »). `avertissements` : ce que
   * la lecture de son CSS n'a pas compris (une police absente de l'instance,
   * par exemple). Aucun contrôle d'accès ici. */
  obtenir(id) {
    if (typeof id !== 'string') return null
    if (id === ID_DEFAUT) {
      return {
        id: ID_DEFAUT,
        nom: NOM_DEFAUT,
        categorie: CATEGORIE_AMEND,
        portee: 'instance',
        defaut: true,
        style: this.lireInstance() || {},
      }
    }
    const m = this._lire(id)
    if (m) {
      const { style, avertissements } = this._style(m)
      const livre = m.origine ? modeleLivreSemable(m.origine) : null
      const vue = {
        id: m.id,
        nom: m.nom,
        categorie: m.categorie || '',
        portee: m.portee,
        proprietaire: m.proprietaire || null,
        creeLe: m.creeLe,
        modifieLe: m.modifieLe,
        style,
        avertissements,
      }
      if (livre) {
        // Un modèle copié d'un livré : s'écarte-t-il encore de ce que livre le
        // code ? (nom, catégorie ou mise en page) — c'est ce qui permet de le
        // rétablir, et de ne décrire en détail que ce qui est encore d'origine.
        const mise = (st) => JSON.stringify(sansReste(reduire(assainir(st))))
        vue.origine = livre.id
        vue.ecartLivre =
          m.nom !== livre.nom || (m.categorie || '') !== (livre.categorie || '') || mise(style) !== mise(livre.style)
        if (!vue.ecartLivre) vue.description = livre.description
      }
      return vue
    }
    // Dans le code : « Texte brut », et les livrés pas encore copiés (un
    // copié puis supprimé n'est plus rien — `semis.json` s'en souvient).
    const livre = modeleLivre(id)
    if (livre && (livre.fixe || !this._semes().includes(livre.id))) {
      return {
        id: livre.id,
        nom: livre.nom,
        categorie: livre.categorie || '',
        portee: 'livre',
        description: livre.description,
        style: livre.style,
      }
    }
    return null
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
   * l'instance (dont les livrés copiés) : les administrateurs ; un modèle
   * personnel : son propriétaire ; « Texte brut » : personne. */
  peutModifier(modele, email, admin) {
    if (!modele) return false
    if (modele.portee === 'livre') return false
    if (modele.portee === 'instance') return !!admin
    return !!email && modele.proprietaire === email
  }

  /** Les modèles visibles par cette personne, rangés : « Par défaut », puis
   * ceux sans catégorie, puis chaque catégorie par ordre alphabétique (voir
   * `comparerModeles`) — chacun avec son style **complet** (pour afficher le
   * format sans refaire la fusion). */
  lister(email) {
    const stockes = []
    if (existsSync(this.dossier)) {
      for (const f of readdirSync(this.dossier)) {
        const m = f.endsWith('.json') ? this._lire(f.slice(0, -5)) : null
        if (m) stockes.push(m)
      }
    }
    const visibles = stockes.filter(
      (m) => m.portee === 'instance' || (m.portee === 'perso' && email && m.proprietaire === email)
    )
    // Par identifiant : un livré copié est à la fois dans le code et sur le disque.
    const parId = new Map()
    for (const m of [
      this.obtenir(ID_DEFAUT),
      ...MODELES_LIVRES.map((l) => this.obtenir(l.id)),
      ...visibles.map((m) => this.obtenir(m.id)),
    ]) {
      if (m) parId.set(m.id, m)
    }
    const tous = [...parId.values()]
    return tous.sort(comparerModeles).map((m) => ({ ...m, style: fusionner(m.style) }))
  }

  /** Duplique un modèle (visible par l'appelant, c'est à la route de le
   * vérifier) en un nouveau, personnel ou — si `portee` vaut `instance` —
   * de l'instance. Jamais une page blanche : on part d'un existant. La
   * catégorie est obligatoire (elle ne se déduit pas du modèle de départ :
   * un modèle copié d'« amend.ink - Texte brut » n'est pas amend.ink). */
  creer({ nom, categorie, depuis, portee, email }) {
    const propre = nomValide(nom)
    if (!propre) throw new Error('nom invalide')
    const source = this.obtenir(depuis)
    if (!source) throw new Error('modèle de départ introuvable')
    const rangee = this._categorieAdmise(categorie)
    const maintenant = Date.now()
    const id = `m-${randomBytes(4).toString('hex')}`
    // Le CSS d'abord : un JSON sans CSS n'est jamais lu comme un modèle vide.
    this._ecrireStyle(id, reduire(assainir(fusionner(source.style))))
    this._ecrireMeta({
      id,
      nom: propre,
      categorie: rangee,
      portee: portee === 'instance' ? 'instance' : 'perso',
      proprietaire: portee === 'instance' ? null : email,
      creeLe: maintenant,
      modifieLe: maintenant,
    })
    return this.obtenir(id)
  }

  renommer(id, nom) {
    const propre = nomValide(nom)
    if (!propre) throw new Error('nom invalide')
    const m = this._lire(id)
    if (!m) throw new Error('modèle introuvable')
    m.nom = propre
    m.modifieLe = Date.now()
    this._ecrireMeta(m)
    return this.obtenir(id)
  }

  /** La catégorie d'un modèle qu'on range : obligatoire (28/10/2026), un
   * texte court, et pas celle d'amend.ink qui est réservée aux modèles livrés
   * avec l'application. */
  _categorieAdmise(categorie) {
    const propre = categorieValide(categorie)
    if (propre === null) throw new Error('catégorie invalide')
    if (!propre) throw new Error('catégorie obligatoire')
    if (categorieReservee(propre)) throw new Error(`la catégorie « ${CATEGORIE_AMEND} » est réservée`)
    return propre
  }

  /** Change la catégorie d'un modèle stocké. */
  classer(id, categorie) {
    const propre = this._categorieAdmise(categorie)
    const m = this._lire(id)
    if (!m) throw new Error('modèle introuvable')
    m.categorie = propre
    m.modifieLe = Date.now()
    this._ecrireMeta(m)
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
    this._ecrireStyle(id, reduire(assainir(style)))
    // Un modèle d'avant le CSS est converti du même coup.
    delete m.style
    m.modifieLe = Date.now()
    this._ecrireMeta(m)
    return this.obtenir(id)
  }

  /** Efface les modèles **personnels** d'une adresse (suppression de
   * compte), qu'ils soient utilisés ou non : ce sont ses préférences, et
   * personne d'autre ne peut les voir (`visiblePour`). Un document qui s'en
   * servait retombe sur « Par défaut » (`couche`). Renvoie les identifiants
   * effacés. */
  supprimerPersonnels(email) {
    if (!email || !existsSync(this.dossier)) return []
    const effaces = []
    for (const f of readdirSync(this.dossier)) {
      const id = f.replace(/\.json$/, '')
      if (!f.endsWith('.json') || !ID_STOCKE.test(id)) continue
      const m = this._lire(id)
      if (m && m.portee === 'perso' && m.proprietaire === email) {
        unlinkSync(this._chemin(id))
        if (existsSync(this._cheminCss(id))) unlinkSync(this._cheminCss(id))
        effaces.push(id)
      }
    }
    return effaces
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
    if (existsSync(this._cheminCss(id))) unlinkSync(this._cheminCss(id))
  }
}
