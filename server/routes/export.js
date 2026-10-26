// Rendu PDF (Typst).
// Extrait de server.js (point 43 de la feuille de route, 11/10/2026) : l'ordre des
// routes et leur comportement sont inchangés.

import { readSession } from '../auth.js'
import { capabilities } from '../roles.js'
import { TypstError } from '../typst.js'
import { sendJson, readJsonBody, PAS_TRAITE } from '../http.js'

// La source Typst d'un livre entier : 531 ko mesurés sur 524 000 signes.
const MAX_TYPST_BODY = 4_000_000

// Les images d'un autre document que la source désigne (`images/<document>/<nom>`) :
// un passage copié d'un document à l'autre garde l'adresse de l'image d'origine
// (24/10/2026). Elles ne sont déposées que si la personne peut lire ce document-là —
// la même règle que pour l'afficher à l'écran. Au plus 300 : une source n'en
// désigne pas davantage sans raison.
const IMAGE_ETRANGERE = /images\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+\.(?:png|jpg))/g
const MAX_IMAGES_ETRANGERES = 300

export function imagesDuRendu(source, id, req, ctx) {
  const { storage, uploads } = ctx
  const images = uploads.lister(id)
  const session = readSession(req)
  const vues = new Set()
  for (const [, autre, nom] of source.matchAll(IMAGE_ETRANGERE)) {
    const cle = `${autre}/${nom}`
    if (autre === id || vues.has(cle)) continue
    vues.add(cle)
    if (vues.size > MAX_IMAGES_ETRANGERES) break
    if (!storage.getDoc(autre) || !storage.roleFor(autre, session)) continue
    const chemin = uploads.chemin(autre, nom)
    if (chemin) images.push({ nom: cle, chemin })
  }
  return images
}

export async function routesExport(req, res, url, ctx) {
  const { pathname } = url
  const { storage, typst } = ctx

  // --- Rendu PDF (16/09/2026, voir claude/proto-export-pdf-typst-pagedjs.md).
  // Le client fabrique la source Typst à partir du document ProseMirror
  // qu'il a sous la main — le serveur n'a que des mises à jour Yjs binaires,
  // et les reconstituer ici demanderait Yjs dans un backend sans dépendance.
  // Il ne reste donc à faire ici que compiler, dans un bac à sable.
  //
  // C'est aussi le premier export réellement réservé aux éditeurs : le .md
  // et le .docx sont fabriqués dans le navigateur, où masquer un bouton
  // n'est qu'une convention. Ici, c'est le serveur qui décide.
  const pdfMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/pdf$/)
  if (pdfMatch && req.method === 'POST') {
    const id = pdfMatch[1]
    const doc = storage.getDoc(id)
    if (!doc) return sendJson(res, 404, { error: 'document introuvable' })
    if (!capabilities(storage.roleFor(id, readSession(req))).canManageDocument) {
      return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    }
    const body = await readJsonBody(req, MAX_TYPST_BODY)
    try {
      const source = String(body.source || '')
      const pdf = await typst.rendre(source, { images: imagesDuRendu(source, id, req, ctx) })
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': pdf.length,
        'content-disposition': `attachment; filename="document.pdf"`,
      })
      return res.end(pdf)
    } catch (err) {
      if (err instanceof TypstError) return sendJson(res, err.status, { error: err.message })
      throw err
    }
  }

  // --- Images (16/09/2026, voir claude/etude-tableaux-images.md). Les
  // octets ne vont jamais dans le document : le nœud ne porte que l'URL
  // ci-dessous, et c'est cette route qui décide qui a le droit de la lire.
  // Servir /uploads/<id>.png sans vérifier l'accès referait exactement la
  // faille trouvée le 15/09 sur history/raw — du contenu de document
  // accessible à qui connaît une URL. ---

  return PAS_TRAITE
}
