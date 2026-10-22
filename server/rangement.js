// Le rangement personnel : dossiers et favoris (12/10/2026,
// claude/conception-dossiers-corbeille.md §4 et §5).
//
// Chaque personne range **à sa façon** les documents qu'elle voit, les siens
// comme ceux qu'on lui a partagés. Rien de ce qui est ici n'est visible des
// autres, rien ne donne ni ne retire un droit, et rien n'est écrit dans le
// registre des documents : déplacer un document ne « touche » pas sa date.
//
// Un fichier par compte, `data/rangements/<idCompte>.json` :
//   { version, dossiers: [{ id, nom, parent }], placement: { docId: dossierId },
//     favoris: [docId] }
// Un document est dans **un seul** dossier à la fois (comme un fichier).
//
// Les entrées orphelines (un document qui n'existe plus, ou dont la personne
// n'a plus l'accès) ne sont pas nettoyées à la main : `elaguer` les écarte à
// la lecture, et la prochaine écriture les oublie. Retirer un accès ne demande
// donc aucune opération ici.

import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { ErreurHttp } from './erreurs.js'
import { ecrireJsonAtomique, lireJson } from './fichiers.js'
import { idCompte } from './users.js'

export const PROFONDEUR_MAX = 3
export const DOSSIERS_MAX = 100
export const NOM_DOSSIER_MAX = 60
// Dix favoris (22/10/2026, décision de Sylvain) : un favori est un raccourci,
// et l'encadré des favoris, en tête de « Mes documents », doit laisser voir
// l'arborescence sans défiler. Qui en avait davantage les garde tous : seul
// l'ajout est refusé, tant qu'on n'est pas redescendu sous la limite.
export const FAVORIS_MAX = 10

const vide = () => ({ version: 1, dossiers: [], placement: {}, favoris: [] })

/** Le nom, tel qu'on le range : sans caractères de contrôle, espaces resserrés. */
export function nomDeDossier(nom) {
  return String(nom ?? '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOM_DOSSIER_MAX)
}

export class Rangements {
  constructor(dataDir) {
    this.dossier = join(dataDir, 'rangements')
  }

  _chemin(email) {
    return join(this.dossier, `${idCompte(email)}.json`)
  }

  /** Efface le rangement d'une personne (suppression de compte). Les
   * rangements des autres n'ont rien à apprendre : ils n'y mentionnent que
   * des documents, et les orphelins s'écartent d'eux-mêmes (`elaguer`). */
  supprimer(email) {
    if (!email) return false
    const chemin = this._chemin(email)
    if (!existsSync(chemin)) return false
    unlinkSync(chemin)
    return true
  }

  /** Le rangement d'une personne (jamais d'exception pour un fichier absent). */
  lire(email) {
    if (!email) return vide()
    const brut = lireJson(this._chemin(email), vide())
    return {
      version: 1,
      dossiers: Array.isArray(brut.dossiers)
        ? brut.dossiers.filter((d) => d && typeof d.id === 'string' && typeof d.nom === 'string')
        : [],
      placement: brut.placement && typeof brut.placement === 'object' ? { ...brut.placement } : {},
      favoris: Array.isArray(brut.favoris) ? brut.favoris.filter((x) => typeof x === 'string') : [],
    }
  }

  _ecrire(email, rangement) {
    if (!existsSync(this.dossier)) mkdirSync(this.dossier, { recursive: true })
    ecrireJsonAtomique(this._chemin(email), rangement)
  }

  /** Le rangement réduit à ce qui existe encore : `visibles` est l'ensemble
   * des documents que la personne voit (corbeille comprise). Ne touche pas
   * au fichier. */
  elaguer(rangement, visibles) {
    const ids = new Set(rangement.dossiers.map((d) => d.id))
    const placement = {}
    for (const [doc, dossier] of Object.entries(rangement.placement)) {
      if (visibles.has(doc) && ids.has(dossier)) placement[doc] = dossier
    }
    return { ...rangement, placement, favoris: rangement.favoris.filter((d) => visibles.has(d)) }
  }

  /** Lecture suivie d'élagage ; l'écriture qui suit oubliera les orphelines. */
  _pour(email, visibles) {
    const r = this.lire(email)
    return visibles ? this.elaguer(r, visibles) : r
  }

  // --- Favoris -------------------------------------------------------------

  favori(email, docId, favori, visibles = null) {
    const r = this._pour(email, visibles)
    const sans = r.favoris.filter((d) => d !== docId)
    if (favori) {
      if (sans.length >= FAVORIS_MAX)
        throw new ErreurHttp(409, `Vous avez déjà ${FAVORIS_MAX} favoris : retirez-en un pour en ajouter.`)
      sans.push(docId)
    }
    r.favoris = sans
    this._ecrire(email, r)
    return r
  }

  estFavori(email, docId) {
    return this.lire(email).favoris.includes(docId)
  }

  // --- Dossiers --------------------------------------------------------------

  _profondeur(r, id) {
    let n = 0
    let cur = r.dossiers.find((d) => d.id === id)
    while (cur) {
      n++
      cur = cur.parent ? r.dossiers.find((d) => d.id === cur.parent) : null
      if (n > PROFONDEUR_MAX + 5) break
    }
    return n
  }

  /** Nombre de niveaux sous `id`, lui compris (un dossier sans sous-dossier : 1). */
  _hauteur(r, id) {
    const enfants = r.dossiers.filter((d) => d.parent === id)
    return 1 + enfants.reduce((m, e) => Math.max(m, this._hauteur(r, e.id)), 0)
  }

  _verifierNom(r, nom, parent, sauf = null) {
    if (!nom) throw new ErreurHttp(400, 'le nom du dossier est vide')
    const meme = r.dossiers.some(
      (d) => d.id !== sauf && (d.parent || null) === (parent || null) && d.nom.toLowerCase() === nom.toLowerCase()
    )
    if (meme) throw new ErreurHttp(409, `il y a déjà un dossier « ${nom} » à cet endroit`)
  }

  _dossier(r, id) {
    const d = r.dossiers.find((x) => x.id === id)
    if (!d) throw new ErreurHttp(404, 'dossier introuvable')
    return d
  }

  creerDossier(email, nomBrut, parent = null, visibles = null) {
    const r = this._pour(email, visibles)
    const nom = nomDeDossier(nomBrut)
    if (parent) {
      this._dossier(r, parent)
      if (this._profondeur(r, parent) >= PROFONDEUR_MAX)
        throw new ErreurHttp(400, `les dossiers vont jusqu’à ${PROFONDEUR_MAX} niveaux`)
    }
    this._verifierNom(r, nom, parent)
    if (r.dossiers.length >= DOSSIERS_MAX) throw new ErreurHttp(403, `limite de ${DOSSIERS_MAX} dossiers atteinte`)
    const dossier = { id: `d_${randomBytes(5).toString('hex')}`, nom, parent: parent || null }
    r.dossiers.push(dossier)
    this._ecrire(email, r)
    return { dossier, rangement: r }
  }

  renommerDossier(email, id, nomBrut, visibles = null) {
    const r = this._pour(email, visibles)
    const d = this._dossier(r, id)
    const nom = nomDeDossier(nomBrut)
    this._verifierNom(r, nom, d.parent, id)
    d.nom = nom
    this._ecrire(email, r)
    return { dossier: d, rangement: r }
  }

  /** Déplace un dossier (avec tout ce qu'il contient) sous `parent` (null :
   * à la racine). Ni dans lui-même ni dans un de ses descendants, ni au-delà
   * de la profondeur permise. */
  deplacerDossier(email, id, parent, visibles = null) {
    const r = this._pour(email, visibles)
    const d = this._dossier(r, id)
    if (parent) {
      this._dossier(r, parent)
      for (
        let cur = r.dossiers.find((x) => x.id === parent);
        cur;
        cur = cur.parent ? r.dossiers.find((x) => x.id === cur.parent) : null
      ) {
        if (cur.id === id) throw new ErreurHttp(400, 'un dossier ne se range pas dans lui-même')
      }
    }
    const profondeurParent = parent ? this._profondeur(r, parent) : 0
    if (profondeurParent + this._hauteur(r, id) > PROFONDEUR_MAX)
      throw new ErreurHttp(400, `les dossiers vont jusqu’à ${PROFONDEUR_MAX} niveaux`)
    this._verifierNom(r, d.nom, parent, id)
    d.parent = parent || null
    this._ecrire(email, r)
    return { dossier: d, rangement: r }
  }

  /** Supprime un dossier — jamais ce qu'il contient : sous-dossiers et
   * documents remontent d'un niveau. */
  supprimerDossier(email, id, visibles = null) {
    const r = this._pour(email, visibles)
    const d = this._dossier(r, id)
    const parent = d.parent || null
    // Remonter les sous-dossiers peut créer un doublon de nom : on ajoute un
    // suffixe plutôt que de refuser de supprimer.
    for (const enfant of r.dossiers.filter((x) => x.parent === id)) {
      let nom = enfant.nom
      for (
        let n = 2;
        r.dossiers.some(
          (x) =>
            x.id !== enfant.id &&
            x.id !== id &&
            (x.parent || null) === parent &&
            x.nom.toLowerCase() === nom.toLowerCase()
        );
        n++
      ) {
        nom = `${enfant.nom} (${n})`.slice(0, NOM_DOSSIER_MAX + 6)
      }
      enfant.nom = nom
      enfant.parent = parent
    }
    for (const [doc, dossier] of Object.entries(r.placement)) {
      if (dossier === id) {
        if (parent) r.placement[doc] = parent
        else delete r.placement[doc]
      }
    }
    r.dossiers = r.dossiers.filter((x) => x.id !== id)
    this._ecrire(email, r)
    return r
  }

  /** Range un document dans un dossier (null : à la racine). */
  placerDocument(email, docId, dossier, visibles = null) {
    const r = this._pour(email, visibles)
    if (dossier) this._dossier(r, dossier)
    if (dossier) r.placement[docId] = dossier
    else delete r.placement[docId]
    this._ecrire(email, r)
    return r
  }
}
