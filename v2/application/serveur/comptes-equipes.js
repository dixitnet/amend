// Les routes des équipes (étape 6d) : contenu, membres, invitations ; les
// modèles de mise en page de l'équipe sont dans `comptes-modeles.js`.
// Découpé de `comptes.js` sans changement de logique ; `ctx` porte les aides
// construites par `creerComptes`.
import {
  nomDossier,
  peutGererEquipe,
  invitationValable,
  roleEffectif,
  ROLES,
  refusDepart,
  adresseCourriel,
  refusMembre,
  DUREE_INVITATION_MS,
} from '../../domaine/index.js'

/** @param {any} ctx  les aides et dépendances de `creerComptes` */
export function creerEquipes(ctx) {
  const {
    CONF,
    comptes,
    courrier,
    lireCorps,
    t,
    nomDuRoleEquipe,
    courrierSimple,
    ok,
    err,
    statutDuRefus,
    revoir,
    revoirEquipe,
    envoyerLien,
    modelesEquipe,
    vueModelesEquipe,
  } = ctx

  /** Les routes des équipes (étape 6d) ; `p` est connecté. */
  async function equipes(req, res, p, segments, membre) {
    const methode = req.method
    if (!segments.length) {
      if (methode !== 'POST') return err(res, 405, 'methode-refusee')
      const n = nomDossier((await lireCorps(req)).nom)
      if (!n.ok) return err(res, 400, n.code)
      return ok(res, { id: await comptes.creerEquipe(n.nom, p.id) }, 201)
    }
    const [idEquipe, sous, cible, ...trop] = segments
    const equipe = await comptes.equipe(idEquipe)
    const moi = equipe ? await membre(equipe.id) : { role: null, caps: [] }
    if (!equipe || !moi.role) return err(res, 404, 'equipe-introuvable')
    if (trop.length) return err(res, 404, 'introuvable')
    const gestionnaire = peutGererEquipe(moi.caps)

    if (!sous) {
      if (methode === 'GET')
        return ok(res, {
          equipe: { id: equipe.id, nom: equipe.nom, role: moi.role },
          dossiers: await comptes.dossiersDe(p.id, equipe.id),
          documents: (await comptes.documentsDeLEquipe(equipe.id, p.id)).map((d) => ({
            id: d.id,
            titre: d.titre,
            creeLe: d.creeLe,
            modifieLe: d.modifieLe,
            dossier: d.dossier,
            createur: d.createur,
            role: roleEffectif(d.roles),
            favori: d.favori,
          })),
          membres: await comptes.membresDe(equipe.id),
          // Ses modèles complets, ceux de l'instance (bases possibles) et le défaut.
          ...(await vueModelesEquipe(equipe)),
          ...(gestionnaire
            ? {
                invitations: (await comptes.invitationsDeLEquipe(equipe.id)).filter((i) => invitationValable(i.creeLe)),
                rolesDonnables: [...ROLES],
              }
            : {}),
        })
      if (!gestionnaire) return err(res, 403, 'droit-insuffisant')
      if (methode === 'DELETE')
        return (await comptes.supprimerEquipeVide(equipe.id)) ? ok(res) : err(res, 409, 'equipe-non-vide')
      if (methode !== 'PUT') return err(res, 405, 'methode-refusee')
      const n = nomDossier((await lireCorps(req)).nom)
      if (!n.ok) return err(res, 400, n.code)
      await comptes.renommerEquipe(equipe.id, n.nom)
      return ok(res)
    }
    if (sous === 'moi' && !cible && methode === 'DELETE') {
      const refus = refusDepart(moi.role, await comptes.gestionnaires(equipe.id))
      // La liste des documents se lit tant que je suis encore membre.
      const docs = await comptes.documentsDeLEquipe(equipe.id, p.id)
      if (refus || (await comptes.modifierMembre(equipe.id, p.id, null))) return err(res, 409, 'dernier-gestionnaire')
      await Promise.all(docs.map((d) => revoir(d.id, p.id)))
      return ok(res)
    }
    if (sous === 'membres' && !cible && methode === 'POST') {
      const corps = await lireCorps(req)
      const a = adresseCourriel(corps.courriel)
      if (!a.ok) return err(res, 400, a.code)
      const invite = await comptes.personneParCourriel(a.courriel)
      const actuel = invite ? await comptes.roleMembre(equipe.id, invite.id) : null
      const nouveau = corps.role ?? null
      const refus = refusMembre(moi.caps, actuel, nouveau, await comptes.gestionnaires(equipe.id))
      if (refus || nouveau === null) return err(res, statutDuRefus(refus), refus ?? 'role-invalide')
      const vars = { auteur: p.nom || t('courriel.quelquun'), equipe: equipe.nom, role: nomDuRoleEquipe(nouveau) }
      if (invite) {
        if ((await comptes.modifierMembre(equipe.id, invite.id, nouveau, p.id)) === 'dernier-gestionnaire')
          return err(res, 409, 'dernier-gestionnaire')
        await revoirEquipe(equipe.id, p.id, invite.id)
        await courrier.envoyer({
          a: a.courriel,
          sujet: t('courriel.equipe.acces.sujet', vars),
          ...courrierSimple(
            t('courriel.equipe.acces.intro', vars),
            t('courriel.equipe.acces.lien'),
            `${CONF.adresse}/#/equipes/${encodeURIComponent(equipe.id)}`,
          ),
        })
        return ok(res, { invitation: false })
      }
      await comptes.inviterMembre(equipe.id, a.courriel, nouveau, p.id)
      await envoyerLien(a.courriel, null, {
        dureeMs: DUREE_INVITATION_MS,
        sujet: t('courriel.equipe.invitation.sujet', vars),
        intro: t('courriel.equipe.invitation.intro', vars),
        libelleLien: t('courriel.equipe.invitation.lien'),
      })
      return ok(res, { invitation: true })
    }
    if (sous === 'membres' && cible && (methode === 'PUT' || methode === 'DELETE')) {
      const actuel = await comptes.roleMembre(equipe.id, cible)
      if (!actuel) return err(res, 404, 'introuvable')
      const nouveau = methode === 'DELETE' ? null : ((await lireCorps(req)).role ?? undefined)
      if (nouveau === undefined) return err(res, 400, 'role-invalide')
      const refus = refusMembre(moi.caps, actuel, nouveau, await comptes.gestionnaires(equipe.id))
      if (refus) return err(res, statutDuRefus(refus), refus)
      if ((await comptes.modifierMembre(equipe.id, cible, nouveau, p.id)) === 'dernier-gestionnaire')
        return err(res, 409, 'dernier-gestionnaire')
      await revoirEquipe(equipe.id, p.id, cible)
      return ok(res)
    }
    if (sous === 'invitations' && cible && methode === 'DELETE') {
      if (!gestionnaire) return err(res, 403, 'droit-insuffisant')
      await comptes.retirerInvitationEquipe(equipe.id, cible)
      return ok(res)
    }
    if (sous === 'modeles' || sous === 'modele-defaut') return modelesEquipe(req, res, p, equipe, moi, sous, cible)
    return err(res, 404, 'introuvable')
  }

  return equipes
}
