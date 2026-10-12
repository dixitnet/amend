import { createReadStream, statSync } from 'node:fs'
import { NOM_PAGE } from './publication.js'

/** Les pages publiées — **la seule partie d'Amend lisible sans session**.
 *
 * Servie avant tout le reste et volontairement à part : ce chemin ne lit
 * aucun cookie, ne touche ni au registre des documents ni aux accès, et ne
 * rend qu'un fichier écrit d'avance. Moins il partage de code avec
 * l'application, moins il peut lui arriver quelque chose par ici.
 * `noindex` est dans la page elle-même : publier, ce n'est pas demander à
 * être référencé. */
export function creerServicePages({ publications, uploads, essaiPublicationAutorise }) {
  return function servirPublication(req, res, pathname) {
    const pageMatch = pathname.match(/^\/p\/([a-z-]{11,26})$/)
    if (pageMatch && NOM_PAGE.test(pageMatch[1])) {
      const html = publications.page(pageMatch[1])
      if (!html) {
        if (!essaiPublicationAutorise(req)) {
          res.writeHead(429, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('trop de tentatives')
          return true
        }
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          '<!DOCTYPE html><meta charset="utf-8"><title>Page introuvable</title><p>Cette page n’existe pas, ou n’est plus publiée.</p>'
        )
        return true
      }
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': Buffer.byteLength(html),
        // Une page publique peut être mise en cache, mais brièvement : on
        // republie pour corriger une coquille et on veut la voir.
        'cache-control': 'public, max-age=300',
        // Rien d'extérieur n'entre dans une page publiée, et rien n'en sort.
        'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      })
      res.end(html)
      return true
    }

    const imgMatch = pathname.match(/^\/p\/([a-z-]{11,26})\/images\/([A-Za-z0-9_.-]+)$/)
    if (imgMatch && NOM_PAGE.test(imgMatch[1])) {
      const docId = publications.documentDe(imgMatch[1])
      const chemin = docId && uploads.chemin(docId, imgMatch[2])
      if (!chemin) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('image introuvable')
        return true
      }
      res.writeHead(200, {
        'content-type': uploads.typeDe(imgMatch[2]),
        'content-length': statSync(chemin).size,
        'cache-control': 'public, max-age=86400, immutable',
      })
      createReadStream(chemin).pipe(res)
      return true
    }

    return false
  }
}
