// Stockage des images d'un document (16/09/2026, voir
// claude/etude-tableaux-images.md, projet Amend).
//
// Les octets d'une image ne vont **jamais** dans le CRDT : chaque connexion
// à un document rejoue l'intégralité de son journal (990 Ko mesurés sur un
// document de 320 000 signes au test de charge n°3), et une seule capture
// d'écran encodée en base64 y ajouterait 2,7 Mo que chaque client
// retéléchargerait à chaque ouverture. Le document ne porte donc qu'une
// référence `{src, alt, largeur, hauteur}` ; les octets vivent ici, dans
// des fichiers, comme le reste du projet.
//
//   data/uploads/<docId>/<identifiant>.<png|jpg>
//
// Deux formats seulement, et c'est délibéré : le client ré-encode tout ce
// qu'on lui colle en PNG ou en JPEG (voir client/src/images.js). Ça garde
// le service trivial, et surtout ça reste dans ce que la bibliothèque
// `docx` sait embarquer à l'export Word — elle ne connaît pas le WebP.

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, rmSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomId } from './ws.js'

// Valeurs par défaut, retenues avec Sylvain le 15/09/2026. Après réduction
// à 1600 px côté client, une capture d'écran pèse ~200 Ko : 100 Mo par
// document laissent largement la place (plusieurs centaines
// d'illustrations), et le VPS (25 Go) tient d'autant plus de documents
// illustrés. La limite par image sert surtout à arrêter net un dépôt
// aberrant avant de l'écrire.
//
// Ce sont des **valeurs par défaut** : MAX_IMAGE_MB et MAX_DOC_IMAGES_MB
// (fichier .env, voir .env.example) les remplacent sans toucher au code.
// Le bon réglage dépend du disque de l'instance et de l'usage réel — deux
// choses qu'on ne connaîtra qu'en observant, et qu'on ne veut pas devoir
// redéployer pour ajuster. En mégaoctets, parce que c'est ce qu'on écrit
// dans un .env sans se tromper d'un facteur 1024.
export const DEFAUT_MAX_IMAGE_MO = 5
export const DEFAUT_MAX_DOCUMENT_MO = 100

/** Un réglage venu d'un .env est une chaîne, parfois vide, parfois une
 * bêtise : on retombe sur la valeur par défaut plutôt que sur NaN — un
 * quota NaN laisserait tout passer. */
function enOctets(valeur, defautMo) {
  const mo = Number(valeur)
  return Math.round((Number.isFinite(mo) && mo > 0 ? mo : defautMo) * 1024 * 1024)
}

const EXT_PAR_TYPE = { 'image/png': 'png', 'image/jpeg': 'jpg' }
const TYPE_PAR_EXT = { png: 'image/png', jpg: 'image/jpeg' }
// Le nom est fabriqué ici et jamais fourni par le client : le valider à la
// relecture est une ceinture, pas une bretelle — c'est ce qui garantit
// qu'aucun `..` ni aucun chemin absolu ne peut traverser le dossier.
const NOM_VALIDE = /^[A-Za-z0-9_-]{8,40}\.(png|jpg)$/

/** Erreur « la demande est mauvaise », pas « le serveur est cassé » : le
 * code HTTP voyage avec, et server.js le renvoie tel quel. */
function refus(status, message) {
  return Object.assign(new Error(message), { status })
}

export class Uploads {
  constructor(dataDir, { maxImageMo, maxDocumentMo } = {}) {
    this.dir = join(dataDir, 'uploads')
    this.maxImageOctets = enOctets(maxImageMo, DEFAUT_MAX_IMAGE_MO)
    this.maxDocumentOctets = enOctets(maxDocumentMo, DEFAUT_MAX_DOCUMENT_MO)
  }

  typeAccepte(mime) {
    return Object.prototype.hasOwnProperty.call(EXT_PAR_TYPE, mime)
  }

  _dossier(docId) {
    return join(this.dir, docId)
  }

  /** Octets déjà stockés pour ce document — recalculé à chaque dépôt plutôt
   * que tenu à jour dans un compteur : un compteur se désynchronise du
   * disque au premier incident, et il y a au plus quelques dizaines de
   * fichiers à lire. */
  octetsDocument(docId) {
    const dossier = this._dossier(docId)
    if (!existsSync(dossier)) return 0
    let total = 0
    for (const nom of readdirSync(dossier)) {
      try {
        total += statSync(join(dossier, nom)).size
      } catch {
        /* fichier disparu entre-temps */
      }
    }
    return total
  }

  /** Écrit une image et renvoie son nom. Lève une erreur portant son statut
   * HTTP si le type n'est pas accepté ou si un quota est dépassé. */
  enregistrer(docId, buffer, mime) {
    const ext = EXT_PAR_TYPE[mime]
    if (!ext) throw refus(415, "format d'image non accepté (png ou jpeg)")
    if (!buffer || !buffer.length) throw refus(400, 'image vide')
    if (buffer.length > this.maxImageOctets) {
      throw refus(413, `image trop lourde (maximum ${Math.round(this.maxImageOctets / 1048576)} Mo)`)
    }
    const dejaLa = this.octetsDocument(docId)
    if (dejaLa + buffer.length > this.maxDocumentOctets) {
      throw refus(413, `ce document a atteint sa limite d'images (${Math.round(this.maxDocumentOctets / 1048576)} Mo)`)
    }
    const dossier = this._dossier(docId)
    if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true })
    const nom = `${randomId(16)}.${ext}`
    writeFileSync(join(dossier, nom), buffer)
    return { nom, octets: buffer.length }
  }

  /** Chemin d'une image existante, ou `null` — un nom qui ne correspond pas
   * exactement à ce que `enregistrer` fabrique n'est même pas cherché. */
  chemin(docId, nom) {
    if (!NOM_VALIDE.test(nom)) return null
    const complet = join(this._dossier(docId), nom)
    return existsSync(complet) ? complet : null
  }

  typeDe(nom) {
    return TYPE_PAR_EXT[nom.split('.').pop()] || 'application/octet-stream'
  }

  /** Appelé à la suppression d'un document (server.js) : sans ça, les
   * images d'un document supprimé resteraient sur le disque pour toujours. */
  supprimerDocument(docId) {
    const dossier = this._dossier(docId)
    if (!existsSync(dossier)) return 0
    let n = 0
    for (const nom of readdirSync(dossier)) {
      try {
        unlinkSync(join(dossier, nom))
        n++
      } catch {
        /* ignoré */
      }
    }
    try {
      rmSync(dossier, { recursive: true, force: true })
    } catch {
      /* ignoré */
    }
    return n
  }

  /** Les images d'un document, pour le rendu PDF : le compilateur les veut
   * en fichiers à côté de la source, pas en URL. */
  lister(docId) {
    const dossier = this._dossier(docId)
    if (!existsSync(dossier)) return []
    try {
      return readdirSync(dossier).map((nom) => ({ nom, chemin: join(dossier, nom) }))
    } catch {
      return []
    }
  }

  /** Pour le back-office : combien d'images, quel poids, et quel document
   * approche le plus de sa limite. */
  statistiques() {
    if (!existsSync(this.dir)) return { fichiers: 0, octetsTotal: 0, plusGrosDocumentOctets: 0, documents: 0 }
    let fichiers = 0
    let octetsTotal = 0
    let plusGrosDocumentOctets = 0
    let documents = 0
    for (const docId of readdirSync(this.dir)) {
      const dossier = join(this.dir, docId)
      let octetsDoc = 0
      let n = 0
      try {
        for (const nom of readdirSync(dossier)) {
          octetsDoc += statSync(join(dossier, nom)).size
          n++
        }
      } catch {
        continue
      }
      if (!n) continue
      documents++
      fichiers += n
      octetsTotal += octetsDoc
      plusGrosDocumentOctets = Math.max(plusGrosDocumentOctets, octetsDoc)
    }
    return { fichiers, octetsTotal, plusGrosDocumentOctets, documents }
  }
}
