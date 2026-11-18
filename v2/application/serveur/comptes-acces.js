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
  extraitPourObjet,
  nomAvecAdresse,
} from '../../domaine/index.js'

/** @param {any} ctx  les aides et dépendances de `creerComptes` */
export function creerAcces(ctx) {
  const {
    CONF,
    comptes,
    courrier,
    lireCorps,
    t,
    nomDuRole,
    ok,
    err,
    revoir,
    envoyerLien,
    courrierSimple,
    envoiAutorise,
    noterEnvoi,
  } = ctx

  /** Les variables des textes d'un courrier de partage : qui invite (le nom seul pour l'objet,
   * « Nom (adresse) » dans le message, comme Docs), le document (son titre abrégé pour l'objet) et le rôle. */
  const varsDuCourrier = (p, doc, role) => {
    const titre = doc.titre || t('courriel.sansTitre')
    return {
      auteur: p.nom || t('courriel.quelquun'),
      qui: nomAvecAdresse(p.nom, p.courriel),
      titre,
      extrait: extraitPourObjet(titre, 60),
      role: nomDuRole(role),
    }
  }

  /** Le courrier d'invitation (adresse sans compte) : vrai s'il est parti. */
  async function envoyerInvitation(docId, courriel, vars) {
    try {
      await envoyerLien(courriel, docId, {
        dureeMs: DUREE_INVITATION_MS,
        sujet: t('courriel.invitation.sujet', vars),
        titre: t('courriel.invitation.titre'),
        intro: t('courriel.invitation.intro', vars),
        libelleLien: t('courriel.invitation.lien'),
      })
      return true
    } catch (e) {
      console.error("courrier d'invitation :", e.message)
      return false
    }
  }

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
      if (!envoiAutorise(p.id)) return err(res, 429, 'trop-d-invitations')
      const vars = varsDuCourrier(p, doc, corps.role)
      if (invite) {
        await comptes.donnerAcces(docId, invite.id, corps.role, p.id)
        await revoir(docId, invite.id)
        // L'accès est donné : un courrier qui ne part pas n'annule rien (la personne
        // retrouve le document dans sa liste) ; l'échec est au journal.
        await courrier
          .envoyer({
            a: a.courriel,
            sujet: t('courriel.acces.sujet', vars),
            ...courrierSimple(
              t('courriel.acces.titre'),
              t('courriel.acces.intro', vars),
              t('courriel.acces.lien'),
              `${CONF.adresse}/#${encodeURIComponent(docId)}`,
            ),
          })
          .catch((e) => console.error('courrier de partage :', e.message))
        noterEnvoi(p.id)
        return ok(res, { invitation: false })
      }
      // Le courrier d'abord : s'il ne part pas, rien n'est créé ni modifié (comme la v1, mieux vaut
      // pas d'invitation du tout qu'une entrée « en attente » jamais partie ; audit du 18/11/2026).
      if (!(await envoyerInvitation(docId, a.courriel, vars))) return err(res, 502, 'courrier-non-envoye')
      await comptes.inviter(docId, a.courriel, corps.role, p.id)
      noterEnvoi(p.id)
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
    // Renvoyer une invitation en attente : un nouveau courrier, un nouveau lien, une nouvelle
    // validité de 7 jours (Sylvain, 18/11/2026 ; Docs n'en a pas, écart justifié par la
    // connexion par lien magique : un courrier perdu bloque la personne).
    if (sous === 'invitations' && cible && methode === 'POST') {
      const courriel = decodeURIComponent(cible)
      const i = (await comptes.invitationsDuDocument(docId)).find(
        (x) => x.courriel === courriel && invitationValable(x.creeLe),
      )
      if (!i) return err(res, 404, 'introuvable')
      if (!envoiAutorise(p.id)) return err(res, 429, 'trop-d-invitations')
      if (!(await envoyerInvitation(docId, courriel, varsDuCourrier(p, doc, i.role)))) {
        return err(res, 502, 'courrier-non-envoye')
      }
      // Le courrier est parti : la validité repart de maintenant.
      await comptes.inviter(docId, courriel, i.role, p.id)
      noterEnvoi(p.id)
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
