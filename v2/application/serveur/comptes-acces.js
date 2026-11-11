// Les routes des accès d'un document : accès, invitations, lien de partage
// (qui peut inviter). Découpé de `comptes.js` sans changement de logique ;
// `ctx` porte les aides construites par `creerComptes`.
import {
  rolesDonnables,
  refusAcces,
  invitationValable,
  roleDuLienValide,
  adresseCourriel,
  DUREE_INVITATION_MS,
} from '../../domaine/index.js'
import { courrierAvecLien } from '../../adaptateurs/courrier/index.js'

/** @param {any} ctx  les aides et dépendances de `creerComptes` */
export function creerAcces(ctx) {
  const { CONF, comptes, courrier, lireCorps, t, nomDuRole, ok, err, revoir, envoyerLien } = ctx

  /** Les routes d'accès d'un document ; rend toujours une réponse (404 en dernier).
   * `cx` : { docId, caps, sous, cible } ; `p` est connecté. */
  async function acces(req, res, p, { docId, caps, sous, cible }) {
    const methode = req.method
    if (!caps.includes('inviter')) return err(res, 403, 'droit-insuffisant')

    const doc = await comptes.document(docId)
    const dansEquipe = Boolean(doc.equipe)
    /** Un document d'équipe appartient à l'équipe : on n'y nomme pas de propriétaire (6d). */
    const refusDansEquipe = (nouveau) => (dansEquipe && nouveau === 'proprietaire' ? 'role-invalide' : null)
    if (sous === 'acces' && !cible && methode === 'GET') {
      return ok(res, {
        acces: await comptes.accesDuDocument(docId),
        invitations: (await comptes.invitationsDuDocument(docId)).filter((i) => invitationValable(i.creeLe)),
        lien: doc.roleLien,
        rolesDonnables: rolesDonnables(caps, { dansEquipe }),
      })
    }
    if (sous === 'acces' && !cible && methode === 'POST') {
      const corps = await lireCorps(req)
      const a = adresseCourriel(corps.courriel)
      if (!a.ok) return err(res, 400, a.code)
      const invite = await comptes.personneParCourriel(a.courriel)
      const actuel = invite ? await comptes.acces(docId, invite.id) : null
      const refus =
        refusAcces(caps, actuel, corps.role ?? null, await comptes.proprietaires(docId)) ?? refusDansEquipe(corps.role)
      if (refus || corps.role === null || corps.role === undefined)
        return err(res, refus === 'droit-insuffisant' ? 403 : 400, refus ?? 'role-invalide')
      const vars = {
        auteur: p.nom || t('courriel.quelquun'),
        titre: doc.titre || t('courriel.sansTitre'),
        role: nomDuRole(corps.role),
      }
      if (invite) {
        await comptes.donnerAcces(docId, invite.id, corps.role, p.id)
        await revoir(docId, invite.id)
        await courrier.envoyer({
          a: a.courriel,
          sujet: t('courriel.acces.sujet', vars),
          ...(({ texte, html }) => ({ texte, html }))(
            courrierAvecLien({
              intro: t('courriel.acces.intro', vars),
              libelleLien: t('courriel.acces.lien'),
              lien: `${CONF.adresse}/#${encodeURIComponent(docId)}`,
              copier: t('courriel.copier'),
              apres: t('courriel.apres'),
            }),
          ),
        })
        return ok(res, { invitation: false })
      }
      await comptes.inviter(docId, a.courriel, corps.role, p.id)
      await envoyerLien(a.courriel, docId, {
        dureeMs: DUREE_INVITATION_MS,
        sujet: t('courriel.invitation.sujet', vars),
        intro: t('courriel.invitation.intro', vars),
        libelleLien: t('courriel.invitation.lien'),
      })
      return ok(res, { invitation: true })
    }
    if (sous === 'acces' && cible && (methode === 'PUT' || methode === 'DELETE')) {
      const actuel = await comptes.acces(docId, cible)
      if (!actuel) return err(res, 404, 'introuvable')
      const nouveau = methode === 'DELETE' ? null : ((await lireCorps(req)).role ?? undefined)
      if (nouveau === undefined) return err(res, 400, 'role-invalide')
      const refus = refusAcces(caps, actuel, nouveau, await comptes.proprietaires(docId)) ?? refusDansEquipe(nouveau)
      if (refus)
        return err(res, refus === 'droit-insuffisant' ? 403 : refus === 'dernier-proprietaire' ? 409 : 400, refus)
      // La règle est vérifiée ici (domaine), puis de nouveau dans la base, en
      // transaction : deux retraits simultanés ne laissent pas un document sans propriétaire.
      if ((await comptes.modifierAcces(docId, cible, nouveau)) === 'dernier-proprietaire')
        return err(res, 409, 'dernier-proprietaire')
      await revoir(docId, cible)
      return ok(res)
    }
    if (sous === 'invitations' && cible && methode === 'DELETE') {
      await comptes.retirerInvitation(docId, cible)
      return ok(res)
    }
    if (sous === 'lien' && !cible && methode === 'PUT') {
      const { role: roleLien } = await lireCorps(req)
      if (roleLien === undefined || !roleDuLienValide(roleLien)) return err(res, 400, 'role-invalide')
      await comptes.definirRoleLien(docId, roleLien)
      await revoir(docId)
      return ok(res)
    }
    return err(res, 404, 'introuvable')
  }

  return acces
}
