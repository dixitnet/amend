// Les routes des dossiers : les miens (étape 6c) et ceux de mes équipes (6d).
// Découpé de `comptes.js` sans changement de logique ; `ctx` porte les aides
// construites par `creerComptes`.
import { nomDossier, peutModifierEquipe, refusDeplacementDossier } from '../../domaine/index.js'

/** @param {any} ctx  les aides et dépendances de `creerComptes` */
export function creerDossiers(ctx) {
  const { comptes, lireCorps, err, ok, equipeVisee } = ctx

  /** Les routes `/api/dossiers…` ; `p` est connecté. */
  async function dossiers(req, res, p, segments, membre, dossierDe) {
    const methode = req.method
    if (!segments.length) {
      if (methode !== 'POST') return err(res, 405, 'methode-refusee')
      const corps = await lireCorps(req)
      const equipe = equipeVisee(corps.equipe)
      if (equipe && !peutModifierEquipe((await membre(equipe)).caps)) return err(res, 403, 'droit-insuffisant')
      const n = nomDossier(corps.nom)
      if (!n.ok) return err(res, 400, n.code)
      const parent = await dossierDe(corps.parent, equipe)
      if (parent === undefined) return err(res, 404, 'dossier-introuvable')
      return ok(res, { id: await comptes.creerDossier(p.id, n.nom, parent, equipe) }, 201)
    }
    if (segments.length > 1) return err(res, 404, 'introuvable')
    const dossier = await comptes.dossier(segments[0])
    const equipe = dossier?.equipe ?? null
    const permis = equipe ? peutModifierEquipe((await membre(equipe)).caps) : dossier?.personne === p.id
    if (!dossier || !permis) return err(res, 404, 'dossier-introuvable')
    const id = dossier.id
    if (methode === 'DELETE')
      return (await comptes.supprimerDossierVide(id)) ? ok(res) : err(res, 409, 'dossier-non-vide')
    if (methode !== 'PUT') return err(res, 405, 'methode-refusee')
    const corps = await lireCorps(req)
    // Tout est vérifié avant de rien changer (audit, 09/11/2026).
    const n = corps.nom === undefined ? null : nomDossier(corps.nom)
    if (n && !n.ok) return err(res, 400, n.code)
    if (corps.parent !== undefined) {
      const refus = await comptes.deplacerDossier(
        p.id,
        id,
        corps.parent,
        (dossiers) => refusDeplacementDossier(dossiers, id, corps.parent),
        equipe,
      )
      if (refus) return err(res, refus === 'dossier-introuvable' ? 404 : 409, refus)
    }
    if (n) await comptes.renommerDossier(id, n.nom)
    return ok(res)
  }

  return dossiers
}
