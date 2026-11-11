// Les routes « moi » : mon nom, l'aperçu et la suppression de mon compte.
// Découpé de `comptes.js` sans changement de logique ; `ctx` porte les aides
// construites par `creerComptes`.
import { nomPersonne, planSuppressionCompte, confirmationSuppressionValide } from '../../domaine/index.js'

/** @param {any} ctx  les aides et dépendances de `creerComptes` */
export function creerMoi(ctx) {
  const { comptes, lireCorps, json, err, ok, effacerContenu, cookieDeSession, cookieEfface } = ctx

  /** Ce que deviendraient les documents et les équipes d'une personne si elle
   * supprimait son compte (domaine : planSuppressionCompte). */
  async function planDe(moi) {
    const equipesDeMoi = await comptes.equipesDe(moi)
    const plan = planSuppressionCompte({
      moi,
      documents: await comptes.documentsEnPropre(moi),
      equipes: await Promise.all(
        equipesDeMoi.map(async (e) => ({ id: e.id, nom: e.nom, membres: await comptes.membresDe(e.id) })),
      ),
    })
    // Le nom (ou l'adresse) de qui recevra un document, pour l'aperçu.
    const noms = new Map((await comptes.noms(plan.documents.map((d) => d.a).filter(Boolean))).map((x) => [x.id, x]))
    for (const d of plan.documents) if (d.a) d.aNom = noms.get(d.a)?.nom || noms.get(d.a)?.courriel || null
    return plan
  }

  /** Rend `undefined` quand la requête n'est pas une route « moi » ; `p` est connecté. */
  async function moi(req, res, p, racine, segments, methode) {
    // --- Supprimer mon compte (lots du 11/11/2026, lot D ; règle de la v1) ---
    if (racine === 'moi' && segments.length === 1 && segments[0] === 'suppression' && methode === 'GET')
      return ok(res, await planDe(p.id))
    if (racine === 'moi' && !segments.length && methode === 'DELETE') {
      const courriel = (await comptes.personne(p.id))?.courriel
      if (!confirmationSuppressionValide((await lireCorps(req)).courriel, courriel))
        return err(res, 400, 'confirmation-invalide')
      const plan = await planDe(p.id)
      if (!plan.peut) return (json(res, 409, { code: 'suppression-refusee', ...plan }), true)
      // Tout ou rien (audit du 11/11/2026) : accès confiés, documents et équipes
      // effacés, puis le compte, en une seule transaction. Si le plan a vieilli
      // entre-temps (un retrait laisserait un document sans propriétaire), rien
      // n'est fait. Le contenu des documents effacés (fils, texte dans y/hub)
      // part ensuite, une fois la base écrite.
      const effaces = []
      const VIEILLI = 'suppression-refusee'
      try {
        await comptes.enTransaction(async (c) => {
          for (const d of plan.documents) {
            if (d.sort === 'confie') await c.modifierAcces(d.id, d.a, 'proprietaire')
            if (d.sort === 'supprime') {
              await c.supprimerDocument(d.id)
              effaces.push(d.id)
            } else if ((await c.modifierAcces(d.id, p.id, null)) === 'dernier-proprietaire')
              throw Object.assign(new Error(VIEILLI), { code: VIEILLI })
          }
          for (const e of plan.equipes) {
            if (e.sort === 'quitte') {
              await c.modifierMembre(e.id, p.id, null)
              continue
            }
            for (const id of await c.idsDocumentsDeLEquipe(e.id)) {
              await c.supprimerDocument(id)
              effaces.push(id)
            }
            await c.supprimerEquipe(e.id)
          }
          await c.supprimerPersonne(p.id, courriel)
        })
      } catch (e) {
        if (e.code === VIEILLI) return err(res, 409, VIEILLI)
        throw e
      }
      for (const id of effaces) await effacerContenu(id)
      return (json(res, 200, {}, { 'set-cookie': cookieEfface }), true)
    }

    // --- Mon nom ---
    if (racine === 'moi') {
      if (segments.length || methode !== 'PUT') return false
      const n = nomPersonne((await lireCorps(req)).nom)
      if (!n.ok) return err(res, 400, n.code)
      await comptes.definirNom(p.id, n.nom)
      return (
        json(res, 200, { id: p.id, nom: n.nom }, { 'set-cookie': cookieDeSession({ id: p.id, nom: n.nom }) }),
        true
      )
    }
  }

  return moi
}
