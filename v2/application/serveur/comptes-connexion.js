// Les routes de la connexion par lien magique (ADR 0005) : envoi du lien par
// courriel, lien du courrier, ouverture de la session. Découpé de `comptes.js`
// sans changement de logique ; `ctx` porte les aides construites par `creerComptes`.
import {
  identifiantDocument,
  invitationValable,
  peutRecevoirLienDeConnexion,
  adresseCourriel,
  DUREE_LIEN_CONNEXION_MS,
} from '../../domaine/index.js'

/** Le code montré quand un lien de connexion a servi ou expiré. */
const LIEN_INVALIDE = 'lien-invalide'

/** Liens de connexion envoyés au plus, par adresse, dans la fenêtre. */
const LIENS_MAX = 5
const FENETRE_LIENS_MS = 15 * 60 * 1000

/** @param {any} ctx  les aides et dépendances de `creerComptes` */
export function creerConnexion(ctx) {
  const { comptes, lireCorps, json, t, err, ok, envoyerLien, cookieDeSession } = ctx

  /** Rend `undefined` quand la requête n'est pas une route de connexion. */
  async function connexion(req, res, racine, segments, methode) {
    // --- Connexion par lien magique (service fermé : domaine) ---
    if (racine === 'connexion' && !segments.length && methode === 'POST') {
      const corps = await lireCorps(req)
      const a = adresseCourriel(corps.courriel)
      if (!a.ok) return err(res, 400, a.code)
      let document = null
      if (corps.document !== undefined && corps.document !== null) {
        const d = identifiantDocument(corps.document)
        if (!d.ok) return err(res, 400, d.code)
        document = d.id
      }
      if ((await comptes.jetonsRecents(a.courriel, FENETRE_LIENS_MS)) >= LIENS_MAX)
        return err(res, 429, 'trop-de-liens')
      const compte = (await comptes.personneParCourriel(a.courriel)) !== null
      const invitation = [
        ...(await comptes.invitationsDe(a.courriel)),
        ...(await comptes.invitationsEquipeDe(a.courriel)),
      ].some((i) => invitationValable(i.creeLe))
      const doc = document ? await comptes.document(document) : null
      const lienDeDocument = doc?.roleLien !== null && doc?.roleLien !== undefined
      // Même réponse que l'adresse soit admise ou non : on ne révèle pas qui a un compte.
      if (peutRecevoirLienDeConnexion({ compte, invitation, lienDeDocument }))
        await envoyerLien(a.courriel, doc ? doc.id : null, {
          dureeMs: DUREE_LIEN_CONNEXION_MS,
          sujet: t('courriel.connexion.sujet'),
          intro: t('courriel.connexion.intro'),
          libelleLien: t('courriel.connexion.lien'),
        })
      return ok(res)
    }
    // Le lien du courrier ne consomme rien : une passerelle de messagerie qui le
    // visite avant la personne ne le brûle pas. Il renvoie à la page, qui envoie
    // le jeton par POST (comme la v1, `/api/auth/verify` ; audit du 11/11/2026).
    if (racine === 'connexion' && segments.length === 1 && methode === 'GET') {
      res.writeHead(303, {
        location: `/#/connexion/${encodeURIComponent(segments[0])}`,
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      })
      return (res.end(), true)
    }
    if (racine === 'connexion' && segments.length === 1 && methode === 'POST') {
      const j = await comptes.consommerJeton(segments[0])
      if (!j) return err(res, 400, LIEN_INVALIDE)
      const p = await comptes.personneOuNouvelle(j.courriel)
      // Les invitations valables deviennent des accès (comme Docs, à la connexion).
      for (const i of await comptes.invitationsDe(j.courriel)) {
        // Le dépôt refuse de retirer son rôle au dernier propriétaire : une invitation
        // plus ancienne ne peut pas abaisser le rôle de qui tient seul le document.
        if (invitationValable(i.creeLe)) await comptes.donnerAcces(i.document, p.id, i.role, i.auteur)
        await comptes.retirerInvitation(i.document, j.courriel)
      }
      // De même pour les invitations dans une équipe (étape 6d), sans baisser un rôle déjà donné.
      for (const i of await comptes.invitationsEquipeDe(j.courriel)) {
        if (invitationValable(i.creeLe) && !(await comptes.roleMembre(i.equipe, p.id)))
          await comptes.modifierMembre(i.equipe, p.id, i.role, i.auteur)
        await comptes.retirerInvitationEquipe(i.equipe, j.courriel)
      }
      if (j.document && (await comptes.document(j.document))?.roleLien)
        await comptes.noterPassageParLien(j.document, p.id)
      return (
        json(
          res,
          200,
          { document: j.document ?? null },
          { 'set-cookie': cookieDeSession({ id: p.id, nom: p.nom ?? '' }) },
        ),
        true
      )
    }
  }

  return connexion
}
