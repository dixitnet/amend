// Le catalogue de polices de l'instance (24/10/2026).
//
// Les polices de base sont dans `shared/style.js` (`POLICES_BASE`) : celles que
// le serveur a par `apt`. Ce module gère le reste — les polices qu'un
// administrateur dépose lui-même :
//
//     data/polices/<id>-<empreinte>.ttf|otf     les fichiers
//     data/polices.json                         le registre
//
// Un seul catalogue nourrit les trois sorties :
//   - le PDF : `data/polices/` s'ajoute au `--font-path` de Typst (typst.js) ;
//   - l'écran : le client en tire des `@font-face` (client/src/polices.js) ;
//   - Word : le nom de la famille.
//
// **Ce qu'on accepte.** Du TrueType ou de l'OpenType (`.ttf`, `.otf`) : Typst ne
// lit pas le WOFF2. Pas de collection (`.ttc`), pas de police variable (Typst
// n'en lit que l'instance par défaut : l'administrateur croirait avoir toute la
// famille). Pas de police dont l'en-tête interdit l'embarquement (`OS/2.fsType`
// bit 1, « Restricted License ») : on la servirait aux navigateurs et on
// l'écrirait dans les PDF.
//
// **Ce qu'on ne fait pas confiance à.** Ni le nom du fichier envoyé (le nôtre
// est `<id>-<empreinte>.<ext>`), ni son type MIME : la signature des quatre
// premiers octets décide. Seul un administrateur dépose (routes/polices.js),
// et le fichier n'est jamais exécuté ni décodé ici au-delà de deux tables
// (`name`, `OS/2`) lues à la main, sans dépendance, avec des bornes partout.
//
// Les polices de plusieurs fichiers d'une même famille (normal, gras, italique…)
// s'ajoutent une à une : un fichier de plus pour une famille déjà là complète
// son entrée, ou remplace le fichier de même graisse et de même style.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { ecrireAtomique, lireJson } from './fichiers.js'
import { GENERIQUES } from '../shared/style.js'

export const FICHIER_MAX_OCTETS = 10 * 1024 * 1024
export const TOTAL_MAX_OCTETS = 100 * 1024 * 1024
export const FAMILLES_MAX = 30
export const FICHIERS_MAX_PAR_FAMILLE = 12

export class PoliceInvalide extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'PoliceInvalide'
    this.status = status
  }
}

// --- Lecture d'une police -------------------------------------------------

const TABLES_REQUISES = ['head', 'cmap', 'name', 'OS/2']

function decoderNom(octets, plateforme) {
  // Plateforme 3 (Windows) et 0 (Unicode) : UTF-16 gros-boutiste. Plateforme 1
  // (Macintosh) : Mac Roman, que le latin1 approche pour de l'ASCII.
  if (plateforme === 1) return octets.toString('latin1')
  const sortie = Buffer.alloc(octets.length - (octets.length % 2))
  for (let i = 0; i + 1 < sortie.length; i += 2) {
    sortie[i] = octets[i + 1]
    sortie[i + 1] = octets[i]
  }
  return sortie.toString('utf16le')
}

function lireNoms(buffer, table) {
  const noms = new Map() // nameID -> { valeur, rang }
  if (table.length < 6) return noms
  const decalage = table.offset
  const compte = buffer.readUInt16BE(decalage + 2)
  const chaines = decalage + buffer.readUInt16BE(decalage + 4)
  for (let i = 0; i < Math.min(compte, 600); i++) {
    const r = decalage + 6 + i * 12
    if (r + 12 > buffer.length || r + 12 > decalage + table.length) break
    const plateforme = buffer.readUInt16BE(r)
    const langue = buffer.readUInt16BE(r + 4)
    const id = buffer.readUInt16BE(r + 6)
    const longueur = buffer.readUInt16BE(r + 8)
    const debut = chaines + buffer.readUInt16BE(r + 10)
    if (debut + longueur > buffer.length || longueur > 2000) continue
    if (plateforme !== 3 && plateforme !== 1 && plateforme !== 0) continue
    // Windows en anglais américain d'abord (0x409), puis le reste de Windows,
    // puis Mac.
    const rang = plateforme === 3 ? (langue === 0x409 ? 0 : 1) : plateforme === 0 ? 2 : 3
    const texte = decoderNom(buffer.subarray(debut, debut + longueur), plateforme)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
    if (!texte) continue
    const deja = noms.get(id)
    if (!deja || rang < deja.rang) noms.set(id, { valeur: texte, rang })
  }
  return noms
}

/** La famille telle que Typst la nommera : l'identifiant 16 (« famille
 * typographique ») quand il existe, sinon le 1. */
function nettoyerFamille(texte) {
  return texte
    .replace(/[^\p{L}\p{N} ._'’()+-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

/**
 * Lit ce dont le catalogue a besoin dans les octets d'une police, ou lève
 * `PoliceInvalide`. Rend :
 *
 *   { format: 'ttf'|'otf', famille, sousFamille, poids, italique, generique,
 *     licence, droitEmbarquement }
 */
export function lirePolice(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 64) throw new PoliceInvalide("ce fichier n'est pas une police")
  const signature = buffer.toString('latin1', 0, 4)
  let format
  if (signature === 'OTTO') format = 'otf'
  else if (signature === '\u0000\u0001\u0000\u0000' || signature === 'true') format = 'ttf'
  else if (signature === 'ttcf')
    throw new PoliceInvalide('les collections de polices (.ttc) ne sont pas acceptées : déposez les fichiers un à un')
  else if (signature === 'wOFF' || signature === 'wOF2') {
    throw new PoliceInvalide(
      'le WOFF n’est pas lu par le PDF : déposez le fichier TrueType (.ttf) ou OpenType (.otf)',
      415
    )
  } else throw new PoliceInvalide("ce fichier n'est pas une police TrueType ou OpenType", 415)

  const nombre = buffer.readUInt16BE(4)
  if (nombre < 4 || nombre > 80 || 12 + nombre * 16 > buffer.length)
    throw new PoliceInvalide('police illisible (en-tête)')
  const tables = {}
  for (let i = 0; i < nombre; i++) {
    const r = 12 + i * 16
    const etiquette = buffer.toString('latin1', r, r + 4)
    const offset = buffer.readUInt32BE(r + 8)
    const longueur = buffer.readUInt32BE(r + 12)
    if (offset > buffer.length || longueur > buffer.length - offset)
      throw new PoliceInvalide('police illisible (table hors du fichier)')
    tables[etiquette] = { offset, length: longueur }
  }
  for (const t of TABLES_REQUISES) {
    if (!tables[t]) throw new PoliceInvalide(`police incomplète (table « ${t} » absente)`)
  }
  if (!tables.glyf && !tables['CFF '] && !tables.CFF2)
    throw new PoliceInvalide('police incomplète (aucun dessin de lettres)')
  if (tables.fvar) {
    throw new PoliceInvalide(
      'les polices variables ne sont pas prises en charge par le PDF : déposez les fichiers statiques (Regular, Bold, Italic…)'
    )
  }

  const os2 = tables['OS/2']
  if (os2.length < 64) throw new PoliceInvalide('police illisible (table OS/2)')
  const poidsBrut = buffer.readUInt16BE(os2.offset + 4)
  const fsType = buffer.readUInt16BE(os2.offset + 8)
  const fsSelection = buffer.readUInt16BE(os2.offset + 62)
  if (fsType & 0x0002) {
    throw new PoliceInvalide(
      "l'auteur de cette police interdit son embarquement (licence « Restricted ») : elle ne peut être ni servie ni écrite dans un PDF",
      403
    )
  }
  const familleSerif = buffer[os2.offset + 32]
  const serifStyle = buffer[os2.offset + 33]
  const sansSerif = [11, 12, 13].includes(serifStyle)
  let monospace = false
  if (tables.post && tables.post.length >= 16) monospace = buffer.readUInt32BE(tables.post.offset + 12) !== 0
  const generique = monospace
    ? 'monospace'
    : familleSerif === 2 && serifStyle > 1 && !sansSerif
      ? 'serif'
      : 'sans-serif'

  const noms = lireNoms(buffer, tables.name)
  const brut = (noms.get(16) || noms.get(1) || {}).valeur
  const famille = nettoyerFamille(brut || '')
  if (!famille || !/^[\p{L}\p{N}]/u.test(famille)) throw new PoliceInvalide('police sans nom de famille lisible')
  const italique =
    !!(fsSelection & 1) || (tables.head.length >= 46 && !!(buffer.readUInt16BE(tables.head.offset + 44) & 2))
  const poids = Math.min(900, Math.max(100, Math.round(poidsBrut / 100) * 100 || 400))
  return {
    format,
    famille,
    sousFamille: ((noms.get(17) || noms.get(2) || {}).valeur || '').slice(0, 60),
    poids,
    italique,
    generique,
    licence: ((noms.get(13) || noms.get(14) || noms.get(0) || {}).valeur || '').slice(0, 300),
    droitEmbarquement:
      fsType === 0 ? 'installable' : fsType & 0x0008 ? 'modifiable' : fsType & 0x0004 ? 'lecture' : 'non précisé',
  }
}

// --- Le catalogue ---------------------------------------------------------

function identifiantPour(famille) {
  const slug = famille
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug ? `i-${slug}` : null
}

export class Polices {
  constructor(dataDir) {
    this.dossier = join(dataDir, 'polices')
    this.registre = join(dataDir, 'polices.json')
  }

  _lire() {
    const donnees = lireJson(this.registre, { version: 1, polices: {} })
    if (!donnees || typeof donnees.polices !== 'object' || donnees.polices === null) return { version: 1, polices: {} }
    return donnees
  }

  _ecrire(donnees) {
    ecrireAtomique(this.registre, JSON.stringify(donnees, null, 2))
  }

  /** Les polices de l'instance, dans l'ordre alphabétique des libellés. */
  lister() {
    try {
      return Object.values(this._lire().polices).sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    } catch {
      // Registre illisible : aucune police d'instance plutôt qu'un serveur qui ne répond plus
      // (fichiers.js a gardé une copie et l'a dit).
      return []
    }
  }

  /** Ce que le client reçoit : tout sauf les détails de gestion. */
  catalogue() {
    return this.lister().map((p) => ({
      id: p.id,
      label: p.label,
      famille: p.famille,
      generique: p.generique,
      fichiers: p.fichiers.map((f) => ({ nom: f.nom, poids: f.poids, italique: f.italique })),
    }))
  }

  /** Le catalogue de gestion (administrateurs) : licence, poids, qui, quand. */
  detail() {
    const total = this.octetsTotal()
    return { polices: this.lister(), octets: total, octetsMax: TOTAL_MAX_OCTETS, familles: FAMILLES_MAX }
  }

  octetsTotal() {
    return this.lister().reduce((s, p) => s + p.fichiers.reduce((t, f) => t + f.octets, 0), 0)
  }

  /** Vrai s'il y a au moins un fichier : Typst n'a un `--font-path` à recevoir que dans ce cas. */
  nonVide() {
    return this.lister().some((p) => p.fichiers.length)
  }

  /**
   * Ajoute (ou complète) une famille avec un fichier. Rend `{ police, fichier, cree, remplace }`.
   * Lève `PoliceInvalide` (le message est montré tel quel à l'administrateur).
   */
  ajouter(buffer, { par = '', maintenant = Date.now() } = {}) {
    if (buffer.length > FICHIER_MAX_OCTETS) {
      throw new PoliceInvalide(`ce fichier dépasse ${Math.round(FICHIER_MAX_OCTETS / 1048576)} Mo`, 413)
    }
    const lue = lirePolice(buffer)
    const id = identifiantPour(lue.famille)
    if (!id) throw new PoliceInvalide('police sans nom de famille utilisable')

    const donnees = this._lire()
    const existante = donnees.polices[id]
    if (!existante && Object.keys(donnees.polices).length >= FAMILLES_MAX) {
      throw new PoliceInvalide(`le catalogue est plein (${FAMILLES_MAX} familles) : supprimez-en une`, 409)
    }
    const empreinte = createHash('sha256').update(buffer).digest('hex').slice(0, 12)
    const nom = `${id}-${empreinte}.${lue.format}`

    const fichiers = existante ? [...existante.fichiers] : []
    const memeStyle = fichiers.findIndex((f) => f.poids === lue.poids && f.italique === lue.italique)
    if (memeStyle === -1 && fichiers.length >= FICHIERS_MAX_PAR_FAMILLE) {
      throw new PoliceInvalide(`cette famille a déjà ${FICHIERS_MAX_PAR_FAMILLE} fichiers`, 409)
    }
    const remplace = memeStyle === -1 ? null : fichiers[memeStyle]
    const total = this.octetsTotal() - (remplace ? remplace.octets : 0) + buffer.length
    if (total > TOTAL_MAX_OCTETS) {
      throw new PoliceInvalide(`le catalogue dépasse ${Math.round(TOTAL_MAX_OCTETS / 1048576)} Mo en tout`, 413)
    }

    mkdirSync(this.dossier, { recursive: true })
    ecrireAtomique(join(this.dossier, nom), buffer)
    const fichier = { nom, poids: lue.poids, italique: lue.italique, octets: buffer.length, style: lue.sousFamille }
    if (memeStyle === -1) fichiers.push(fichier)
    else fichiers[memeStyle] = fichier
    fichiers.sort((a, b) => a.poids - b.poids || Number(a.italique) - Number(b.italique))

    const police = {
      id,
      label: existante ? existante.label : lue.famille,
      famille: lue.famille,
      generique: GENERIQUES.includes(lue.generique) ? lue.generique : 'sans-serif',
      licence: lue.licence || (existante ? existante.licence : ''),
      droitEmbarquement: lue.droitEmbarquement,
      fichiers,
      ajoutePar: existante ? existante.ajoutePar : par,
      ajouteLe: existante ? existante.ajouteLe : maintenant,
      modifieLe: maintenant,
    }
    donnees.polices[id] = police
    this._ecrire(donnees)
    // L'ancien fichier de même style n'est retiré qu'une fois le registre à jour.
    if (remplace && remplace.nom !== nom) this._effacer(remplace.nom)
    return { police, fichier, cree: !existante, remplace: !!remplace }
  }

  /** Retire une famille et ses fichiers. Rend `false` si elle n'existe pas. */
  supprimer(id) {
    const donnees = this._lire()
    const police = donnees.polices[id]
    if (!police) return false
    delete donnees.polices[id]
    this._ecrire(donnees)
    for (const f of police.fichiers) this._effacer(f.nom)
    return true
  }

  /** Retire un seul fichier d'une famille (le reste de la famille est gardé ; la
   * famille disparaît avec son dernier fichier). */
  supprimerFichier(id, nom) {
    const donnees = this._lire()
    const police = donnees.polices[id]
    if (!police) return false
    const reste = police.fichiers.filter((f) => f.nom !== nom)
    if (reste.length === police.fichiers.length) return false
    if (!reste.length) return this.supprimer(id)
    police.fichiers = reste
    this._ecrire(donnees)
    this._effacer(nom)
    return true
  }

  _effacer(nom) {
    if (!/^i-[a-z0-9-]+-[0-9a-f]{12}\.(ttf|otf)$/.test(nom)) return
    try {
      unlinkSync(join(this.dossier, nom))
    } catch {
      /* déjà parti */
    }
  }

  /** Le chemin d'un fichier **du catalogue** (jamais autre chose), ou null. */
  chemin(id, nom) {
    if (!/^i-[a-z0-9-]+-[0-9a-f]{12}\.(ttf|otf)$/.test(String(nom))) return null
    const police = this.lister().find((p) => p.id === id)
    if (!police || !police.fichiers.some((f) => f.nom === nom)) return null
    const chemin = join(this.dossier, nom)
    return existsSync(chemin) ? chemin : null
  }

  typeDe(nom) {
    return String(nom).endsWith('.otf') ? 'font/otf' : 'font/ttf'
  }
}
