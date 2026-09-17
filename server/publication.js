// « Publier sur le web » (17/09/2026) — la première surface d'Amend
// lisible sans session.
//
// **Le serveur n'accepte pas de HTML.** C'est la décision qui tient tout le
// reste. Laisser le navigateur poster une page et l'assainir ici, ce serait
// faire reposer la sécurité d'une page publique sur l'exhaustivité d'un
// filtre écrit à la main — un `<script>` qui passerait s'exécuterait chez
// les visiteurs, sur le domaine même où vivent les sessions. Le client
// poste donc un **document structuré** (voir client/src/publicationExport.js)
// dans un modèle fermé — les types de blocs et les marques que connaît
// l'éditeur, rien d'autre — et c'est ce module qui fabrique le HTML, en
// échappant tout. Rien d'arbitraire ne peut traverser : ce qui n'est pas
// prévu ici n'existe pas dans la page.
//
// Deuxième décision : **un instantané, pas un document vivant**. Servir une
// page publique en rejouant le journal Yjs à chaque visite confierait le
// profil d'usage le plus coûteux de l'application à des visiteurs non
// authentifiés. La page est écrite une fois, au moment où on publie, et
// servie telle quelle depuis le disque.
//
// Troisième : **l'adresse publique ne révèle pas l'identifiant du
// document**. Publier est un choix, pas une devinette — un identifiant de
// publication tiré au sort, distinct, évite qu'on passe d'un document connu
// à sa page, ou l'inverse.

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomId } from './ws.js'

/** Qui a le droit de publier. Réglé dans le .env — `admins` pendant la
 * phase de test, `proprietaires` ou `editeurs` ensuite. C'est un
 * changement de configuration, pas de code : l'ouverture était prévue dès
 * le premier jour. */
export const PORTEES = ['admins', 'proprietaires', 'editeurs']

export function porteePublication() {
  const v = String(process.env.PUBLICATION_WEB || 'admins').trim().toLowerCase()
  return PORTEES.includes(v) ? v : 'admins'
}

/**
 * Cette personne peut-elle publier ce document ?
 * `admin` et `proprietaire` sont des booléens, `role` le rôle sur le
 * document. Un correcteur ne publie jamais, quelle que soit la portée.
 */
export function peutPublier({ admin, proprietaire, role }) {
  const portee = porteePublication()
  if (admin) return true
  if (portee === 'admins') return false
  if (portee === 'proprietaires') return !!proprietaire
  return role === 'editeur'
}

const ECHAPPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ECHAPPES[c])

// Les marques de l'éditeur qui ont un sens dans une page lue par quelqu'un
// d'autre. Les marques de suivi (insertion, deletion, authorColor) n'en
// font pas partie : une page publiée montre **l'état présent** du texte,
// comme les autres exports — rien n'est accepté ni rejeté au passage, et
// personne n'a à lire les ratures de l'auteur.
const MARQUES = { strong: 'strong', em: 'em', underline: 'u', strike: 's' }

function inline(morceaux) {
  if (!Array.isArray(morceaux)) return ''
  let out = ''
  for (const m of morceaux) {
    if (!m || typeof m !== 'object') continue
    if (m.type === 'saut') {
      out += '<br>'
      continue
    }
    if (m.type === 'image') {
      out += image(m)
      continue
    }
    if (m.type !== 'texte' || typeof m.texte !== 'string') continue
    let t = esc(m.texte)
    const marques = Array.isArray(m.marques) ? m.marques : []
    for (const nom of marques) {
      const balise = MARQUES[nom]
      if (balise) t = `<${balise}>${t}</${balise}>`
    }
    out += t
  }
  return out
}

/** Une image du document. Le nom de fichier seul, vérifié : les images
 * vivent sous `data/uploads/<docId>/` et sont servies par une route qui
 * valide déjà ce format. Rien d'autre ne peut devenir une `src`. */
function image(n) {
  const nom = String(n.nom || '')
  if (!/^[A-Za-z0-9_-]{8,40}\.(png|jpg)$/.test(nom)) return ''
  const alt = n.alt ? ` alt="${esc(n.alt)}"` : ' alt=""'
  return `<img src="images/${esc(nom)}"${alt}>`
}

function bloc(n) {
  if (!n || typeof n !== 'object') return ''
  switch (n.type) {
    case 'paragraphe': {
      const contenu = inline(n.contenu)
      return contenu ? `<p>${contenu}</p>` : '<p>&nbsp;</p>'
    }
    case 'titre': {
      const niveau = Math.min(5, Math.max(1, Number(n.niveau) || 2))
      return `<h${niveau}>${inline(n.contenu)}</h${niveau}>`
    }
    case 'citation':
      return `<blockquote>${(n.blocs || []).map(bloc).join('')}</blockquote>`
    case 'liste':
      return `<ul>${(n.items || []).map((i) => `<li>${(i.blocs || []).map(bloc).join('')}</li>`).join('')}</ul>`
    case 'liste-ordonnee':
      return `<ol>${(n.items || []).map((i) => `<li>${(i.blocs || []).map(bloc).join('')}</li>`).join('')}</ol>`
    case 'taches':
      return `<ul class="taches">${(n.items || [])
        .map(
          (i) =>
            `<li class="${i.fait ? 'faite' : ''}">${i.fait ? '☑' : '☐'} ${(i.blocs || []).map(bloc).join('')}</li>`
        )
        .join('')}</ul>`
    case 'tableau':
      return `<table><tbody>${(n.lignes || [])
        .map((l) => `<tr>${(l || []).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    case 'image':
      return `<figure>${image(n)}</figure>`
    case 'separation':
      return '<hr>'
    default:
      // Un type inconnu ne produit rien. C'est la règle qui rend le modèle
      // réellement fermé : ajouter un bloc à l'éditeur demandera d'ajouter
      // une ligne ici, et jusque-là il ne sortira simplement pas.
      return ''
  }
}

/** La feuille de style de la page publiée.
 *
 * Volontairement **celle du web, pas celle du document** : une mise en page
 * réglée en A5 avec des marges en millimètres est faite pour du papier, et
 * la plaquer sur une page lue au téléphone donnerait le pire des deux.
 * Cette feuille-ci ne cherche qu'une chose : se lire. */
const FEUILLE = `
:root { color-scheme: light dark; --fg:#1f1b16; --bg:#fdfcfb; --muted:#766f66; --bord:#e4ddd3; --accent:#5f7a4a; }
@media (prefers-color-scheme: dark) {
  :root { --fg:#ece7df; --bg:#1a1815; --muted:#a89f92; --bord:#38332c; --accent:#a9c68a; }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font-family: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
  font-size: 18px; line-height: 1.65;
}
main { max-width: 38em; margin: 0 auto; padding: 48px 20px 96px; }
h1, h2, h3, h4, h5 { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; line-height: 1.25; margin: 1.8em 0 0.5em; }
h1 { font-size: 1.9em; margin-top: 0; }
h2 { font-size: 1.45em; } h3 { font-size: 1.2em; } h4, h5 { font-size: 1.05em; }
p { margin: 0 0 1em; }
blockquote { margin: 1.4em 0; padding: 0 0 0 1em; border-left: 3px solid var(--bord); color: var(--muted); }
ul, ol { padding-left: 1.4em; }
ul.taches { list-style: none; padding-left: 0; }
ul.taches .faite { color: var(--muted); text-decoration: line-through; }
img { max-width: 100%; height: auto; }
figure { margin: 1.6em 0; text-align: center; }
table { border-collapse: collapse; width: 100%; margin: 1.4em 0; font-size: 0.92em; }
td { border: 1px solid var(--bord); padding: 6px 9px; vertical-align: top; }
hr { border: none; border-top: 1px solid var(--bord); margin: 2.4em 0; }
a { color: var(--accent); }
.pied { max-width: 38em; margin: 0 auto; padding: 0 20px 48px; font-size: 13px; color: var(--muted);
  font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; border-top: 1px solid var(--bord); padding-top: 16px; }
@media (max-width: 600px) { body { font-size: 17px; } main { padding: 28px 16px 64px; } }
`

/** La page complète. Aucun script, aucune ressource extérieure : une page
 * publiée ne charge rien, ne mesure rien, ne suit personne. */
export function rendre({ titre, blocs, publieLe }) {
  const corps = (Array.isArray(blocs) ? blocs : []).map(bloc).join('\n')
  const date = new Date(publieLe || Date.now()).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titre || 'Document')}</title>
<meta name="robots" content="noindex">
<style>${FEUILLE}</style>
</head>
<body>
<main>
<h1>${esc(titre || 'Document')}</h1>
${corps}
</main>
<p class="pied">Publié le ${esc(date)} avec Amend.</p>
</body>
</html>
`
}

/** Le registre des pages publiées : un fichier à part, pas `docs.json`.
 * Le registre des documents est relu et analysé plusieurs fois par requête
 * (mesuré au test de charge n°3) — une page publiée n'a rien à y faire. */
export class Publications {
  constructor(dataDir) {
    this.dataDir = dataDir
    this.indexPath = join(dataDir, 'publications.json')
  }

  _lire() {
    try {
      return JSON.parse(readFileSync(this.indexPath, 'utf8'))
    } catch {
      return {}
    }
  }

  _ecrire(index) {
    const tmp = this.indexPath + '.tmp'
    writeFileSync(tmp, JSON.stringify(index, null, 2), 'utf8')
    renameSync(tmp, this.indexPath)
  }

  _pagePath(pubId) {
    return join(this.dataDir, `pub-${pubId}.html`)
  }

  /** L'état de publication d'un document, ou `null`. */
  pourDocument(docId) {
    const index = this._lire()
    for (const [pubId, meta] of Object.entries(index)) {
      if (meta.docId === docId) return { pubId, ...meta }
    }
    return null
  }

  /** Publie (ou republie) un document. L'identifiant de publication est
   * conservé d'une fois sur l'autre : republier ne doit pas casser le lien
   * qu'on a déjà envoyé à quelqu'un. */
  publier(docId, { titre, blocs }) {
    const index = this._lire()
    const existante = this.pourDocument(docId)
    const pubId = existante ? existante.pubId : randomId(16)
    const publieLe = existante ? existante.publieLe : Date.now()
    const html = rendre({ titre, blocs, publieLe })
    writeFileSync(this._pagePath(pubId), html, 'utf8')
    index[pubId] = { docId, titre: String(titre || '').slice(0, 300), publieLe, majLe: Date.now() }
    this._ecrire(index)
    return { pubId, ...index[pubId], octets: Buffer.byteLength(html) }
  }

  depublier(docId) {
    const index = this._lire()
    const existante = this.pourDocument(docId)
    if (!existante) return false
    try {
      unlinkSync(this._pagePath(existante.pubId))
    } catch {
      /* déjà partie */
    }
    delete index[existante.pubId]
    this._ecrire(index)
    return true
  }

  /** Le HTML d'une page publiée, ou `null`. */
  page(pubId) {
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(String(pubId || ''))) return null
    const chemin = this._pagePath(pubId)
    if (!existsSync(chemin)) return null
    try {
      return readFileSync(chemin, 'utf8')
    } catch {
      return null
    }
  }

  /** Le document derrière une publication — pour servir ses images. */
  documentDe(pubId) {
    const meta = this._lire()[pubId]
    return meta ? meta.docId : null
  }

  toutes() {
    return Object.entries(this._lire()).map(([pubId, meta]) => ({ pubId, ...meta }))
  }
}
