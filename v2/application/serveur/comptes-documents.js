// Les routes des documents : la corbeille, Mes documents et Partagé avec moi,
// puis un document (corbeille douce, copie, titre, rangement, favori, retrait).
// Découpé de `comptes.js` sans changement de logique ; `ctx` porte les aides
// construites par `creerComptes`.
import { randomUUID } from 'node:crypto'
import {
  identifiantDocument,
  titreDocument,
  roleEffectif,
  sectionDuDocument,
  refusRetrait,
  peutModifierEquipe,
  deplacementDocument,
  DUREE_CORBEILLE_MS,
  dansLaCorbeille,
  joursRestants,
  titreDeCopie,
  lieuDeLaCopie,
} from '../../domaine/index.js'

/** @param {any} ctx  les aides et dépendances de `creerComptes` */
export function creerDocuments(ctx) {
  const { comptes, collaboration, lireCorps, t, ok, err, revoir, roleSur, effacer, equipeVisee } = ctx

  /** Les routes `/api/corbeille…` ; `p` est connecté. */
  async function corbeille(req, res, p, segments) {
    const methode = req.method
    if (!segments.length) {
      if (methode !== 'GET') return err(res, 405, 'methode-refusee')
      const maintenant = Date.now()
      return ok(res, {
        documents: (await comptes.corbeilleDe(p.id, maintenant - DUREE_CORBEILLE_MS)).map((d) => ({
          id: d.id,
          titre: d.titre,
          equipe: d.equipe,
          supprimeLe: d.supprimeLe,
          joursRestants: joursRestants(d.supprimeLe, maintenant),
        })),
      })
    }
    if (segments.length > 1) return err(res, 404, 'introuvable')
    const v = identifiantDocument(segments[0])
    if (!v.ok) return err(res, 400, v.code)
    const doc = await comptes.document(v.id)
    const { caps: capsCorbeille } = await roleSur(v.id, p.id, { corbeille: true })
    if (!doc || !dansLaCorbeille(doc.supprimeLe) || !capsCorbeille.includes('supprimer'))
      return err(res, 404, 'document-introuvable')
    if (methode === 'DELETE') return (await effacer(v.id), ok(res))
    if (methode !== 'POST') return err(res, 405, 'methode-refusee')
    // y/hub d'abord : s'il échoue, le document reste dans la corbeille, entier.
    if (collaboration)
      try {
        await collaboration.restaurer(v.id)
      } catch (e) {
        console.error(`[serveur] restauration dans y/hub de ${v.id} :`, e)
        return err(res, 502, 'collaboration-indisponible')
      }
    await comptes.mettreALaCorbeille(v.id, false)
    return ok(res)
  }

  /** Mes documents et Partagé avec moi (GET), nouveau document (POST). */
  async function listeEtCreation(req, res, p, membre, dossierDe) {
    const methode = req.method
    if (methode === 'GET') {
      const mesEquipes = await comptes.equipesDe(p.id)
      const ids = new Set(mesEquipes.map((e) => e.id))
      return ok(res, {
        equipes: mesEquipes,
        dossiers: await comptes.dossiersDe(p.id),
        documents: (await comptes.documentsDe(p.id))
          .map((d) => {
            const section = sectionDuDocument(d, p.id, ids)
            return {
              id: d.id,
              titre: d.titre,
              creeLe: d.creeLe,
              modifieLe: d.modifieLe,
              role: roleEffectif(d.roles),
              section,
              favori: d.favori,
              ...(section === 'mes-documents'
                ? { dossier: d.dossier }
                : { partagePar: d.partagePar, parLien: d.parLien, partageLe: d.partageLe }),
            }
          })
          .filter((d) => d.section !== 'equipe'),
      })
    }
    if (methode !== 'POST') return err(res, 405, 'methode-refusee')
    const { titre, dossier, equipe: brute } = await lireCorps(req)
    const t1 = titreDocument(titre)
    if (!t1.ok) return err(res, 400, t1.code)
    const equipe = equipeVisee(brute)
    if (equipe && !peutModifierEquipe((await membre(equipe)).caps)) return err(res, 403, 'droit-insuffisant')
    const rangement = await dossierDe(dossier, equipe)
    if (rangement === undefined) return err(res, 404, 'dossier-introuvable')
    const id = randomUUID()
    const leTitre = t1.titre
    if (equipe) await comptes.creerDocumentEquipe(id, equipe, p.id, leTitre, rangement)
    else await comptes.creerDocument(id, p.id, leTitre, rangement)
    return ok(res, { id }, 201)
  }

  /** Un document : corbeille douce, copie, titre, rangement, favori, retrait.
   * Rend `undefined` pour une autre requête. `cx` : { docId, role, caps, sous, cible }. */
  async function document(req, res, p, { docId, role, caps, sous, cible }, membre, dossierDe) {
    const methode = req.method
    // DELETE /api/documents/:doc : à la corbeille, le propriétaire seul (comme
    // Docs : suppression douce, 30 jours). D'abord la base (plus personne ne
    // l'ouvre : le serveur refuse les droits), puis y/hub, qui déconnecte ceux
    // qui l'ont ouvert ; son échec ne fait que retarder la déconnexion.
    if (!sous) {
      if (methode !== 'DELETE') return err(res, 405, 'methode-refusee')
      if (!caps.includes('supprimer')) return err(res, 403, 'droit-insuffisant')
      await comptes.mettreALaCorbeille(docId, true)
      if (collaboration)
        await collaboration
          .mettreALaCorbeille(docId)
          .catch((e) => console.error(`[serveur] corbeille dans y/hub de ${docId} :`, e))
      return ok(res)
    }
    // POST /api/documents/:doc/copie : dupliquer (comme Docs, \`duplicate\` : qui
    // lit le document) ; le texte seul, titré « … (copie) », rangé à côté de
    // l'original si l'on peut y écrire (domaine : lieuDeLaCopie).
    if (sous === 'copie' && !cible) {
      if (methode !== 'POST') return err(res, 405, 'methode-refusee')
      if (!collaboration) return err(res, 503, 'collaboration-indisponible')
      const doc = await comptes.document(docId)
      const ids = new Set((await comptes.equipesDe(p.id)).map((e) => e.id))
      const section = sectionDuDocument({ ...doc, roles: [role] }, p.id, ids)
      const lieu = lieuDeLaCopie(
        { section, equipe: doc.equipe, dossier: doc.dossier },
        doc.equipe ? peutModifierEquipe((await membre(doc.equipe)).caps) : false,
      )
      const titre = titreDeCopie(doc.titre, (x) => t('document.copie', { titre: x }), t('documents.sansTitre'))
      const id = randomUUID()
      if (lieu.equipe) await comptes.creerDocumentEquipe(id, lieu.equipe, p.id, titre, lieu.dossier)
      else await comptes.creerDocument(id, p.id, titre, lieu.dossier)
      try {
        // Comme Docs : la copie garde le droit de lire les images de sa source,
        // sans que les fichiers soient recopiés.
        await comptes.heriterImages(id, docId)
        await collaboration.copierTexte(docId, id, p.id)
      } catch (e) {
        // Comme Docs : un échec défait toute la copie, rien n'est laissé à moitié.
        console.error(`[serveur] copie de ${docId} :`, e)
        await effacer(id)
        return err(res, 502, 'collaboration-indisponible')
      }
      return ok(res, { id }, 201)
    }
    // PUT /api/documents/:doc/titre { titre } : qui écrit le texte renomme le document.
    if (sous === 'titre' && !cible && methode === 'PUT') {
      if (!caps.includes('ecrire')) return err(res, 403, 'droit-insuffisant')
      const r = titreDocument((await lireCorps(req)).titre)
      if (!r.ok) return err(res, 400, r.code)
      await comptes.renommerDocument(docId, r.titre)
      return ok(res, { titre: r.titre })
    }
    // PUT /api/documents/:doc/dossier { dossier, equipe? } : le ranger, le
    // faire entrer dans une équipe, ou l'en sortir (domaine : deplacementDocument).
    if (sous === 'dossier' && !cible && methode === 'PUT') {
      const doc = await comptes.document(docId)
      const corps = await lireCorps(req)
      const source = doc.equipe ?? null
      const destination = corps.equipe === undefined ? source : equipeVisee(corps.equipe)
      const decision = deplacementDocument({
        source,
        destination,
        emplacementEstMoi: doc.emplacement === p.id,
        capsDocument: caps,
        capsSource: (await membre(source)).caps,
        capsDestination: (await membre(destination)).caps,
      })
      if (decision.code) return err(res, decision.code === 'droit-insuffisant' ? 403 : 409, decision.code)
      const rangement = await dossierDe(corps.dossier, destination)
      if (rangement === undefined) return err(res, 404, 'dossier-introuvable')
      if (decision.action === 'entrer') await comptes.entrerDansEquipe(docId, destination, rangement)
      else if (decision.action === 'sortir') await comptes.sortirDeLEquipe(docId, p.id, rangement)
      else await comptes.rangerDocument(docId, rangement)
      // Entrer dans une équipe ou en sortir change les droits de ses membres.
      if (decision.action === 'entrer' || decision.action === 'sortir') await revoir(docId)
      return ok(res)
    }
    // PUT / DELETE /api/documents/:doc/favori : mes favoris (comme Docs,
    // `favorite/`) ; quiconque lit le document (Sylvain, 10/11/2026).
    if (sous === 'favori' && !cible) {
      if (methode !== 'PUT' && methode !== 'DELETE') return err(res, 405, 'methode-refusee')
      await comptes.favori(docId, p.id, methode === 'PUT')
      return ok(res)
    }
    // DELETE /api/documents/:doc/moi : je me retire (jamais le dernier propriétaire).
    if (sous === 'moi' && !cible && methode === 'DELETE') {
      const actuel = await comptes.acces(docId, p.id)
      const refus = refusRetrait(actuel, await comptes.proprietaires(docId))
      if (refus) return err(res, 409, refus)
      if (actuel && (await comptes.modifierAcces(docId, p.id, null)) === 'dernier-proprietaire')
        return err(res, 409, 'dernier-proprietaire')
      await comptes.retirerPassageParLien(docId, p.id)
      await revoir(docId, p.id)
      return ok(res)
    }
  }

  return { corbeille, listeEtCreation, document }
}
