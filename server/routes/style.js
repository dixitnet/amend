// La mise en page : style par défaut, style d'un document, modèles.
// Extrait de server.js (point 43 de la feuille de route, 11/10/2026) : l'ordre des
// routes et leur comportement sont inchangés.

import { ID_DEFAUT } from '../../shared/modeles.js'
import { fusionner } from '../../shared/style.js'
import { isAdminEmail, readSession } from '../auth.js'
import { capabilities } from '../roles.js'
import { sendJson, readJsonBody, PAS_TRAITE } from '../http.js'

export async function routesStyle(req, res, url, ctx) {
  const { pathname } = url
  const { storage } = ctx

  // L'état de la mise en page d'un document tel que l'éditeur le montre : la
  // feuille effective, s'il a des écarts propres (et combien), et son modèle.
  const resumeModele = (modeleId) => {
    const m = storage.modeles.obtenir(modeleId)
    return m ? { id: m.id, nom: m.nom, portee: m.portee } : null
  }
  const etatStyleDoc = (docId) => ({
    style: storage.getDocStyle(docId),
    propre: storage.hasOwnStyle(docId),
    ecarts: storage.ecartsDuDocument(docId),
    modele: resumeModele(storage.modeleDuDocument(docId)),
  })

  if (pathname === '/api/style' && req.method === 'GET') {
    return sendJson(res, 200, storage.getStyle())
  }

  // --- Mise en page d'un document (16/09/2026) ---
  // La feuille de style était réglée pour toute l'instance, ce qui n'a de
  // sens que si l'instance ne fait qu'un type de document. Elle descend au
  // document ; `/api/style` garde son rôle mais change de sens — il définit
  // désormais le **style par défaut**, dont héritent les documents qui
  // n'ont pas le leur.
  const docStyleMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/style$/)
  if (docStyleMatch) {
    const id = docStyleMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    const role = storage.roleFor(id, readSession(req))
    if (req.method === 'GET') {
      // Lire la mise en page suit l'accès au document : un correcteur la
      // voit, il ne la change pas.
      if (!role) {
        return sendJson(res, 403, { error: "vous n'avez pas accès à ce document" })
      }
      return sendJson(res, 200, etatStyleDoc(id))
    }
    if (req.method === 'PUT' || req.method === 'DELETE') {
      if (!capabilities(role).canManageDocument) return sendJson(res, 403, { error: 'réservé aux éditeurs' })
      if (req.method === 'DELETE') {
        // Revenir à son modèle : on efface les écarts propres du document.
        storage.resetDocStyle(id)
        return sendJson(res, 200, etatStyleDoc(id))
      }
      const body = await readJsonBody(req)
      storage.setDocStyle(id, body)
      return sendJson(res, 200, etatStyleDoc(id))
    }
  }

  // --- Modèle de mise en page d'un document (01/10/2026) ---
  // Le modèle est une **propriété du document** : le même pour tous ses
  // collaborateurs, suivi par les exports. Le choisir est un geste d'éditeur
  // (`canManageDocument`, comme les écarts). On ne peut choisir qu'un
  // modèle qu'on voit ; un document peut en revanche déjà porter celui d'un
  // collaborateur — le re-choisir ne change rien.
  const docModeleMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/modele$/)
  if (docModeleMatch && req.method === 'PUT') {
    const id = docModeleMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    const email = readSession(req)
    const role = storage.roleFor(id, email)
    if (!role) return sendJson(res, 403, { error: "vous n'avez pas accès à ce document" })
    if (!capabilities(role).canManageDocument) return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    const body = await readJsonBody(req)
    const modele = typeof body.modeleId === 'string' ? storage.modeles.obtenir(body.modeleId) : null
    if (!modele) return sendJson(res, 404, { error: 'modèle introuvable' })
    if (modele.id !== storage.modeleDuDocument(id)) {
      if (!storage.modeles.visiblePour(modele, email)) return sendJson(res, 404, { error: 'modèle introuvable' })
      storage.setDocModele(id, modele.id, { garderEcarts: body.garderEcarts === true })
    }
    return sendJson(res, 200, etatStyleDoc(id))
  }
  if (pathname === '/api/style' && req.method === 'PUT') {
    // Feuille de style partagée par toute l'instance, pas par document —
    // réservée aux administrateurs (voir ADMIN_EMAILS, auth.js), pas aux
    // éditeurs de tel ou tel document.
    if (!isAdminEmail(readSession(req))) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    const body = await readJsonBody(req)
    return sendJson(res, 200, storage.setStyle(body))
  }

  // --- Les modèles de mise en page (01/10/2026, server/modeles.js) ---
  // Livrés (dans le code), de l'instance (administrateurs), personnels (une
  // personne). Voir claude/etude-modeles-mise-en-page.md §0.
  const PERSOS_MAX = 50
  const vueModele = (m, email, admin, usages) => ({
    id: m.id,
    nom: m.nom,
    portee: m.portee,
    description: m.description || null,
    defaut: m.id === ID_DEFAUT,
    style: fusionner(m.style),
    modifiable: storage.modeles.peutModifier(m, email, admin),
    // « Par défaut » ne se supprime pas ; les autres, tant qu'ils ne servent pas.
    supprimable: m.id !== ID_DEFAUT && storage.modeles.peutModifier(m, email, admin),
    utilisePar: usages ? usages.get(m.id) || 0 : 0,
  })
  if (pathname === '/api/modeles' && req.method === 'GET') {
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    const admin = isAdminEmail(email)
    const usages = storage.usagesModeles()
    const modeles = storage.modeles.lister(email).map((m) => vueModele(m, email, admin, usages))
    return sendJson(res, 200, { modeles, admin })
  }
  if (pathname === '/api/modeles' && req.method === 'POST') {
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    const admin = isAdminEmail(email)
    const body = await readJsonBody(req)
    const instance = body.portee === 'instance'
    if (instance && !admin) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    const depuis = typeof body.depuis === 'string' ? storage.modeles.obtenir(body.depuis) : null
    // Jamais une page blanche : on part d'un modèle qu'on voit.
    if (!depuis || !storage.modeles.visiblePour(depuis, email)) {
      return sendJson(res, 404, { error: 'modèle de départ introuvable' })
    }
    if (!instance && storage.modeles.lister(email).filter((m) => m.portee === 'perso').length >= PERSOS_MAX) {
      return sendJson(res, 409, { error: `vous avez déjà ${PERSOS_MAX} modèles personnels` })
    }
    try {
      const cree = storage.modeles.creer({ nom: body.nom, depuis: depuis.id, portee: instance ? 'instance' : 'perso', email })
      return sendJson(res, 200, vueModele(cree, email, admin))
    } catch (err) {
      return sendJson(res, 400, { error: err.message })
    }
  }
  const modeleMatch = pathname.match(/^\/api\/modeles\/([A-Za-z0-9_-]+)$/)
  if (modeleMatch) {
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    const admin = isAdminEmail(email)
    const modele = storage.modeles.obtenir(modeleMatch[1])
    // Un modèle personnel d'un autre n'existe pas pour vous.
    if (!modele || !storage.modeles.visiblePour(modele, email)) return sendJson(res, 404, { error: 'modèle introuvable' })
    if (req.method === 'GET') return sendJson(res, 200, vueModele(modele, email, admin))
    if (req.method === 'PUT' || req.method === 'DELETE') {
      if (!storage.modeles.peutModifier(modele, email, admin)) {
        return sendJson(res, 403, {
          error: modele.portee === 'livre' ? 'un modèle livré ne se modifie pas : dupliquez-le' : 'ce modèle ne vous appartient pas',
        })
      }
      if (req.method === 'DELETE') {
        if (modele.id === ID_DEFAUT) return sendJson(res, 403, { error: '« Par défaut » ne se supprime pas' })
        try {
          storage.modeles.supprimer(modele.id)
          return sendJson(res, 200, { ok: true })
        } catch (err) {
          if (err.utilisePar) {
            return sendJson(res, 409, { error: `ce modèle est utilisé par ${err.utilisePar} document(s)`, utilisePar: err.utilisePar })
          }
          return sendJson(res, 400, { error: err.message })
        }
      }
      const body = await readJsonBody(req)
      if (body.nom !== undefined && modele.id === ID_DEFAUT) {
        return sendJson(res, 400, { error: 'le nom de « Par défaut » ne se change pas' })
      }
      try {
        if (body.nom !== undefined) storage.modeles.renommer(modele.id, body.nom)
        if (body.style !== undefined) {
          if (!body.style || typeof body.style !== 'object') return sendJson(res, 400, { error: 'mise en page invalide' })
          storage.modeles.ecrireStyle(modele.id, body.style)
        }
      } catch (err) {
        return sendJson(res, 400, { error: err.message })
      }
      return sendJson(res, 200, vueModele(storage.modeles.obtenir(modele.id), email, admin))
    }
  }

  return PAS_TRAITE
}
