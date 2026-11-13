// Les polices de l'instance (13/11/2026, Sylvain : « un onglet sur la gestion
// des polices permettant d'uploader ») : les règles d'un fichier de police
// envoyé par un administrateur, et la lecture de son nom de famille. Le moteur
// du PDF (Typst) désigne une police par le nom de famille écrit dans le
// fichier : c'est lui qu'on lit, pas le nom du fichier. JavaScript pur.

/** Poids maximal d'un fichier de police (Sylvain, 13/11/2026). */
export const POLICE_MAX_OCTETS = 10 * 1024 * 1024
/** Longueur maximale d'un nom de famille ou de fichier gardé. */
const NOM_MAX = 120

/** Les quatre styles d'une famille complète pour un livre. */
export const STYLES_POLICE = ['romain', 'italique', 'gras', 'gras-italique']

const SIGNATURES = new Set([0x00010000, 0x4f54544f, 0x74727565]) // TrueType, « OTTO » (OpenType CFF), « true »

const u16 = (o, i) => (o[i] << 8) | o[i + 1]
const u32 = (o, i) => ((o[i] << 24) | (o[i + 1] << 16) | (o[i + 2] << 8) | o[i + 3]) >>> 0

/** Une table du fichier (`name`, `OS/2`), ou `null`. */
function table(o, nom) {
  const nombre = u16(o, 4)
  for (let i = 0; i < nombre; i++) {
    const d = 12 + i * 16
    if (d + 16 > o.length) return null
    if (String.fromCharCode(o[d], o[d + 1], o[d + 2], o[d + 3]) === nom) {
      const debut = u32(o, d + 8)
      const longueur = u32(o, d + 12)
      return debut + longueur <= o.length ? { debut, longueur } : null
    }
  }
  return null
}

/** Les noms écrits dans la table `name` : identifiant → texte (le nom Windows
 * en Unicode de préférence, sinon le nom Macintosh). */
function noms(o, t) {
  const nombre = u16(o, t.debut + 2)
  const chaines = t.debut + u16(o, t.debut + 4)
  const trouves = new Map()
  for (let i = 0; i < nombre; i++) {
    const d = t.debut + 6 + i * 12
    if (d + 12 > t.debut + t.longueur) break
    const plateforme = u16(o, d)
    const id = u16(o, d + 6)
    const longueur = u16(o, d + 8)
    const debut = chaines + u16(o, d + 10)
    if (debut + longueur > o.length) continue
    let texte = ''
    if (plateforme === 3 || plateforme === 0)
      for (let k = 0; k + 1 < longueur; k += 2) texte += String.fromCharCode(u16(o, debut + k))
    else if (plateforme === 1) for (let k = 0; k < longueur; k++) texte += String.fromCharCode(o[debut + k])
    else continue
    texte = texte.normalize('NFC').trim()
    // Le nom Windows (Unicode) l'emporte sur le nom Macintosh.
    if (texte && (plateforme !== 1 || !trouves.has(id))) trouves.set(id, texte)
  }
  return trouves
}

/**
 * Lit un fichier de police TrueType ou OpenType (`.ttf`, `.otf`) : son nom de
 * famille et son style. Refuse ce qui n'en est pas un (une collection `.ttc`,
 * un `.woff`, un fichier tronqué).
 * @param {Uint8Array} octets
 * @returns {{ ok: true, famille: string, style: 'romain' | 'italique' | 'gras' | 'gras-italique', graisse: number, sousFamille: string } | { ok: false, code: string }}
 */
export function lirePolice(octets) {
  if (!(octets instanceof Uint8Array) || octets.length < 12) return { ok: false, code: 'police-illisible' }
  if (octets.length > POLICE_MAX_OCTETS) return { ok: false, code: 'police-trop-lourde' }
  if (!SIGNATURES.has(u32(octets, 0))) return { ok: false, code: 'police-format' }
  const tNoms = table(octets, 'name')
  if (!tNoms) return { ok: false, code: 'police-illisible' }
  const n = noms(octets, tNoms)
  // La famille « typographique » (16) quand elle existe : c'est celle que Typst retient.
  const famille = (n.get(16) ?? n.get(1) ?? '').slice(0, NOM_MAX)
  if (!famille) return { ok: false, code: 'police-illisible' }
  const sousFamille = (n.get(17) ?? n.get(2) ?? '').slice(0, NOM_MAX)
  const os2 = table(octets, 'OS/2')
  const graisse = os2 && os2.longueur >= 64 ? u16(octets, os2.debut + 4) : /bold/i.test(sousFamille) ? 700 : 400
  const selection = os2 && os2.longueur >= 64 ? u16(octets, os2.debut + 62) : 0
  const italique = Boolean(selection & 1) || /italic|oblique/i.test(sousFamille)
  const gras = graisse >= 600
  return {
    ok: true,
    famille,
    style: gras ? (italique ? 'gras-italique' : 'gras') : italique ? 'italique' : 'romain',
    graisse,
    sousFamille,
  }
}

/** Le nom de fichier gardé pour l'affichage : sans chemin ni caractère de commande. */
export const nomFichierPolice = (nom) =>
  String(nom ?? '')
    .normalize('NFC')
    .replace(/^.*[\\/]/, '')
    // eslint-disable-next-line no-control-regex -- on retire justement les caractères de commande
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, NOM_MAX)

/** Les styles qui manquent à une famille pour un livre (le texte courant a
 * besoin du romain et de l'italique ; les titres, du gras). */
export const stylesManquants = (styles) => STYLES_POLICE.filter((s) => !styles.includes(s))

/**
 * Les familles d'un catalogue de fichiers : une par nom de famille, ses
 * fichiers dans l'ordre des styles, et ce qui lui manque.
 * @param {Array<{ id: string, famille: string, style: string, graisse: number, fichier: string, octets?: number }>} fichiers
 */
export function famillesDePolices(fichiers) {
  const parFamille = new Map()
  for (const f of fichiers) parFamille.set(f.famille, [...(parFamille.get(f.famille) ?? []), f])
  return [...parFamille.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([famille, liste]) => ({
      famille,
      fichiers: [...liste].sort(
        (a, b) => STYLES_POLICE.indexOf(a.style) - STYLES_POLICE.indexOf(b.style) || a.graisse - b.graisse,
      ),
      manquants: stylesManquants(liste.map((f) => f.style)),
    }))
}
