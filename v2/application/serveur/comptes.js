// Les routes des comptes et du partage (couche application, étape 6a) : la
// connexion par lien magique (ADR 0005), les documents, les accès, les
// invitations et le lien de partage, sur le modèle de Docs et selon
// l'arbitrage de Sylvain (09/11/2026). Les règles sont dans le domaine ; le
// dépôt (adaptateur PostgreSQL) garde les données ; réponses en codes.
//
//   POST   /api/connexion                    { courriel, document? }  lien par courriel
//   GET    /api/connexion/:jeton             ouvre la session, puis le document
//   POST   /api/deconnexion
//   POST   /api/deconnexion-partout
//   PUT    /api/moi                          { nom }
//   GET    /api/documents                    { dossiers, documents } : Mes documents et Partagé avec moi
//   POST   /api/documents                    { titre?, dossier? }  nouveau document (je suis propriétaire)
//   DELETE /api/documents/:doc               à la corbeille (le propriétaire seul), 30 jours
//   POST   /api/documents/:doc/copie         dupliquer (qui lit) : le texte seul, à côté de l'original
//   GET    /api/corbeille                    les documents que je peux restaurer
//   POST   /api/corbeille/:doc               le restaurer
//   DELETE /api/corbeille/:doc               l'effacer définitivement
//   PUT    /api/documents/:doc/titre         { titre }  (qui écrit ; null : sans titre)
//   PUT    /api/documents/:doc/dossier       { dossier }  le ranger (null : racine de Mes documents)
//   DELETE /api/documents/:doc/moi           me retirer du document (Partagé avec moi)
//   POST   /api/dossiers                     { nom, parent? }  (étape 6c : rangement personnel)
//   PUT    /api/dossiers/:id                 { nom?, parent? }
//   DELETE /api/dossiers/:id                 seulement vide
//   POST   /api/equipes                      { nom }  nouvelle équipe (j'en suis gestionnaire), étape 6d
//   GET    /api/equipes/:id                  contenu, membres (et invitations pour le gestionnaire)
//   PUT    /api/equipes/:id                  { nom }
//   DELETE /api/equipes/:id                  seulement vide
//   DELETE /api/equipes/:id/moi              partir (jamais le dernier gestionnaire)
//   POST   /api/equipes/:id/membres          { courriel, role }  ajouter ou inviter
//   PUT    /api/equipes/:id/membres/:id      { role }
//   DELETE /api/equipes/:id/membres/:id
//   DELETE /api/equipes/:id/invitations/:courriel
//   POST   /api/equipes/:id/modeles          { nom, base }  modèle de mise en page (gestionnaire), étape 7
//   PUT    /api/equipes/:id/modeles/:id      { nom?, ecarts? }
//   DELETE /api/equipes/:id/modeles/:id      les documents qui l'avaient retombent sur le défaut
//   PUT    /api/equipes/:id/modele-defaut    { modele }  (null : le premier d'amend.ink)
//   GET    /api/documents/:doc/modeles       les modèles permis au document et celui retenu
//   PUT    /api/documents/:doc/modele        { modele }  (qui écrit ; null : celui par défaut)
// Dossiers et documents prennent un `equipe` facultatif (l'espace visé).
//   GET    /api/documents/:doc/acces         accès, invitations, lien (qui invite)
//   POST   /api/documents/:doc/acces         { courriel, role }  donner ou inviter
//   PUT    /api/documents/:doc/acces/:id     { role }
//   DELETE /api/documents/:doc/acces/:id
//   DELETE /api/documents/:doc/invitations/:courriel
//   PUT    /api/documents/:doc/lien          { role }  (null : lien fermé)
import { randomUUID } from 'node:crypto'
import {
  identifiantDocument,
  titreDocument,
  nomPersonne,
  capacites,
  roleEffectif,
  rolesDonnables,
  refusAcces,
  invitationValable,
  roleDuLienValide,
  peutRecevoirLienDeConnexion,
  adresseCourriel,
  nomDossier,
  refusDeplacementDossier,
  sectionDuDocument,
  refusRetrait,
  refusMembre,
  refusDepart,
  peutModifierEquipe,
  peutGererEquipe,
  peutGererModeles,
  peutChoisirModele,
  appliquerEcarts,
  modeleRetenu,
  deplacementDocument,
  DUREE_CORBEILLE_MS,
  dansLaCorbeille,
  joursRestants,
  titreDeCopie,
  lieuDeLaCopie,
  ROLES,
  DUREE_INVITATION_MS,
  DUREE_LIEN_CONNEXION_MS,
} from '../../domaine/index.js'
import { creerTraducteur, libelleDuRole, libelleDuRoleEquipe } from '../../i18n/index.js'
import { courrierAvecLien } from '../../adaptateurs/courrier/index.js'
import { MODELES_LIVRE, REGLES_MODELES } from '../../design/livre.js'

/** Les modèles de mise en page d'amend.ink (design), par identifiant. */
const MAISON = new Map(MODELES_LIVRE.map((m) => [m.id, m]))
const IDS_MAISON = MODELES_LIVRE.map((m) => m.id)
/** Un modèle d'équipe tel que le client le reçoit (il calcule le modèle complet). */
const modeleVu = (m) => ({ id: m.id, nom: m.nom, base: m.base, ecarts: m.ecarts })

/** Le code montré quand un lien de connexion a servi ou expiré. */
const LIEN_INVALIDE = 'lien-invalide'

/** Liens de connexion envoyés au plus, par adresse, dans la fenêtre. */
const LIENS_MAX = 5
const FENETRE_LIENS_MS = 15 * 60 * 1000

function decoder(segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

/**
 * @param {object} o
 * @param {object} o.CONF
 * @param {any} o.comptes  le dépôt des comptes
 * @param {any} [o.commentaires]  le dépôt des commentaires (effacés avec le document)
 * @param {{ envoyer: Function }} o.courrier
 * @param {{ supprimerDocument: (docId: string) => Promise<void> } | null} o.collaboration
 * @param {(req: any) => Promise<{ id: string, nom: string } | null>} o.personneDe
 * @param {(res: any, statut: number, corps: any, entetes?: object) => void} o.json
 * @param {(req: any, max?: number) => Promise<any>} o.lireCorps
 * @param {(personne: { id: string, nom: string }) => string} o.cookieDeSession
 * @param {string} o.cookieEfface
 */
export function creerComptes({
  CONF,
  comptes,
  commentaires,
  courrier,
  collaboration,
  personneDe,
  json,
  lireCorps,
  cookieDeSession,
  cookieEfface,
}) {
  const t = creerTraducteur('fr') // langue des courriers : celle des documents d'ici l'étape 6b
  const nomDuRole = (role) => libelleDuRole(t, role)
  const nomDuRoleEquipe = (role) => libelleDuRoleEquipe(t, role)
  const courrierSimple = (intro, libelleLien, lien) =>
    (({ texte, html }) => ({ texte, html }))(
      courrierAvecLien({ intro, libelleLien, lien, copier: t('courriel.copier'), apres: t('courriel.apres') }),
    )
  const ok = (res, corps = {}, statut = 200) => (json(res, statut, corps), true)
  const err = (res, statut, code) => (json(res, statut, { code }), true)
  /** Le statut HTTP d'un refus du domaine (les mêmes partout, audit du 09/11/2026). */
  const statutDuRefus = (code) =>
    code === 'droit-insuffisant' ? 403 : code === 'dernier-gestionnaire' || code === 'dernier-proprietaire' ? 409 : 400

  async function envoyerLien(courriel, document, { dureeMs, sujet, intro, libelleLien }) {
    const jeton = await comptes.creerJeton(courriel, document, dureeMs)
    const lien = `${CONF.adresse}/api/connexion/${jeton}`
    const m = courrierAvecLien({ intro, libelleLien, lien, copier: t('courriel.copier'), apres: t('courriel.apres') })
    await courrier.envoyer({ a: courriel, sujet, texte: m.texte, html: m.html })
  }

  /** Le rôle effectif d'une personne sur un document, et ses capacités
   * (aucun sur un document à la corbeille, sauf avec \`{ corbeille: true }\`). */
  async function roleSur(docId, idPersonne, options) {
    const role = roleEffectif(await comptes.rolesDe(docId, idPersonne, options))
    return { role, caps: capacites(role) }
  }

  /** Efface un document pour de bon : la base, les fils, puis le contenu dans
   * y/hub. D'abord la base (le document disparaît pour tous) : un échec de
   * y/hub laisse un contenu inaccessible, pas un document listé mais vidé
   * (audit, 09/11/2026) ; un échec des fils n'empêche pas d'effacer le texte
   * (audit du 10/11/2026). */
  async function effacer(docId) {
    await comptes.supprimerDocument(docId)
    await commentaires
      ?.supprimerFilsDuDocument(docId)
      .catch((e) => console.error(`[serveur] suppression des fils de ${docId} :`, e))
    if (collaboration)
      await collaboration
        .supprimerDocument(docId)
        .catch((e) => console.error(`[serveur] suppression dans y/hub de ${docId} :`, e))
  }

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
          modeles: await comptes.modelesDe(equipe.id),
          modeleDefaut: equipe.modeleDefaut ?? null,
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
      if (refus || (await comptes.modifierMembre(equipe.id, p.id, null))) return err(res, 409, 'dernier-gestionnaire')
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

  /** Les modèles de mise en page d'une équipe (étape 7, ADR 0011) : le
   * gestionnaire les crée, les règle, les supprime et choisit le défaut. */
  async function modelesEquipe(req, res, p, equipe, moi, sous, cible) {
    const methode = req.method
    if (!peutGererModeles(moi.caps)) return err(res, 403, 'droit-insuffisant')
    /** Un modèle de cette équipe, ou un modèle d'amend.ink. */
    const permis = async (id) => MAISON.has(id) || (await comptes.modele(id))?.equipe === equipe.id
    if (sous === 'modele-defaut') {
      if (cible || methode !== 'PUT') return err(res, 405, 'methode-refusee')
      const { modele } = await lireCorps(req)
      if (modele !== null && (typeof modele !== 'string' || !(await permis(modele))))
        return err(res, 404, 'modele-introuvable')
      await comptes.definirModeleDefaut(equipe.id, modele)
      return ok(res)
    }
    if (!cible) {
      if (methode !== 'POST') return err(res, 405, 'methode-refusee')
      const corps = await lireCorps(req)
      const n = nomDossier(corps.nom)
      if (!n.ok) return err(res, 400, n.code)
      if (!MAISON.has(corps.base)) return err(res, 400, 'modele-introuvable')
      return ok(res, { id: await comptes.creerModele(equipe.id, n.nom, corps.base, {}, p.id) }, 201)
    }
    const modele = await comptes.modele(cible)
    if (!modele || modele.equipe !== equipe.id) return err(res, 404, 'modele-introuvable')
    if (methode === 'DELETE') return ok(res, { documents: await comptes.supprimerModele(modele.id) })
    if (methode !== 'PUT') return err(res, 405, 'methode-refusee')
    const corps = await lireCorps(req)
    // Tout est vérifié avant de rien changer.
    const n = corps.nom === undefined ? null : nomDossier(corps.nom)
    if (n && !n.ok) return err(res, 400, n.code)
    let ecarts
    if (corps.ecarts !== undefined) {
      const r = appliquerEcarts(MAISON.get(modele.base), corps.ecarts, REGLES_MODELES)
      if (!r.ok) return (json(res, 400, { code: r.code, reglage: r.reglage ?? null, raison: r.raison ?? null }), true)
      ecarts = r.ecarts
    }
    await comptes.modifierModele(modele.id, { nom: n?.nom, ecarts })
    return ok(res, ecarts === undefined ? {} : { ecarts })
  }

  /** Efface pour de bon les documents restés plus de 30 jours dans la corbeille. */
  async function purger(maintenant = Date.now()) {
    for (const id of await comptes.corbeilleExpiree(maintenant - DUREE_CORBEILLE_MS)) await effacer(id)
  }

  return Object.assign(traiter, { purger })

  async function traiter(req, res, url) {
    const m = url.pathname.match(
      /^\/api\/(connexion|deconnexion|deconnexion-partout|moi|documents|dossiers|equipes|corbeille)(?:\/(.*))?$/,
    )
    if (!m) return false
    const [, racine, reste] = m
    const segments = (reste ?? '').split('/').filter(Boolean).map(decoder)
    if (segments.includes(null)) return err(res, 400, 'requete-invalide')
    const methode = req.method

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
    if (racine === 'connexion' && segments.length === 1 && methode === 'GET') {
      const j = await comptes.consommerJeton(segments[0])
      if (!j) {
        res.writeHead(303, { location: `/#!${LIEN_INVALIDE}`, 'cache-control': 'no-store' })
        return (res.end(), true)
      }
      const p = await comptes.personneOuNouvelle(j.courriel)
      // Les invitations valables deviennent des accès (comme Docs, à la connexion).
      for (const i of await comptes.invitationsDe(j.courriel)) {
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
      res.writeHead(303, {
        location: j.document ? `/#${encodeURIComponent(j.document)}` : '/',
        'set-cookie': cookieDeSession({ id: p.id, nom: p.nom ?? '' }),
        'cache-control': 'no-store',
      })
      return (res.end(), true)
    }
    const p = await personneDe(req)
    if (racine === 'deconnexion' || racine === 'deconnexion-partout') {
      if (methode !== 'POST') return err(res, 405, 'methode-refusee')
      if (racine === 'deconnexion-partout') {
        if (!p) return err(res, 401, 'session-absente')
        await comptes.revoquerSessions(p.id)
      }
      return (json(res, 200, {}, { 'set-cookie': cookieEfface }), true)
    }
    if (!p) return err(res, 401, 'session-absente')

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

    /** Mon rôle de membre d'une équipe et ses capacités (aucune si je n'en suis pas). */
    const membre = async (equipe) => {
      const r = equipe ? await comptes.roleMembre(equipe, p.id) : null
      return { role: r, caps: capacites(r) }
    }
    /** Un dossier de l'espace visé (mes dossiers si `equipe` est nul, sinon
     * ceux de l'équipe) ; `null` pour la racine ; `undefined` s'il n'en est pas. */
    const dossierDe = async (id, equipe = null) => {
      if (id === null || id === undefined) return null
      const d = await comptes.dossier(id)
      if (!d) return undefined
      return (equipe ? d.equipe === equipe : d.personne === p.id) ? d.id : undefined
    }
    /** L'équipe visée par une requête : `null` (Mes documents) ou un identifiant. */
    const equipeVisee = (v) => (v === undefined || v === null ? null : String(v))

    // --- Dossiers : les miens (étape 6c) et ceux de mes équipes (6d) ---
    if (racine === 'dossiers') {
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

    // --- Équipes (dossiers d'équipe, étape 6d) ---
    if (racine === 'equipes') return equipes(req, res, p, segments, membre)

    // --- Corbeille (lots du 11/11/2026, comme Docs : \`trashbin\`, \`restore\`) ---
    if (racine === 'corbeille') {
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

    // --- Mes documents et Partagé avec moi (et la liste de mes équipes) ---
    if (!segments.length) {
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
    if (racine !== 'documents') return err(res, 404, 'introuvable')

    const d = identifiantDocument(segments[0])
    if (!d.ok) return err(res, 400, d.code)
    const docId = d.id
    const { role, caps } = await roleSur(docId, p.id)
    if (!role) return err(res, 404, 'document-introuvable')
    const [, sous, cible, ...trop] = segments
    if (trop.length) return err(res, 404, 'introuvable')

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
      return ok(res)
    }
    // Les modèles de mise en page du document (étape 7, ADR 0011) : ceux
    // d'amend.ink et ceux de son équipe ; le modèle suit le document (un
    // correcteur extérieur reçoit celui retenu, pas la liste de l'équipe).
    if ((sous === 'modeles' && methode === 'GET') || (sous === 'modele' && methode === 'PUT')) {
      if (cible) return err(res, 404, 'introuvable')
      const doc = await comptes.document(docId)
      const equipe = doc.equipe ? await comptes.equipe(doc.equipe) : null
      const deLEquipe = equipe ? await comptes.modelesDe(equipe.id) : []
      const permis = [...IDS_MAISON, ...deLEquipe.map((m) => m.id)]
      if (sous === 'modele') {
        if (!peutChoisirModele(caps)) return err(res, 403, 'droit-insuffisant')
        const { modele } = await lireCorps(req)
        if (modele !== null && !permis.includes(modele)) return err(res, 404, 'modele-introuvable')
        await comptes.definirModeleDocument(docId, modele)
        return ok(res)
      }
      const retenu = modeleRetenu({ choisi: doc.modele, defautEquipe: equipe?.modeleDefaut, permis })
      const membre = equipe ? Boolean(await comptes.roleMembre(equipe.id, p.id)) : false
      return ok(res, {
        modeles: [
          ...IDS_MAISON.map((id) => ({ id, maison: true })),
          ...deLEquipe.filter((m) => membre || m.id === retenu).map(modeleVu),
        ],
        equipe: equipe ? equipe.nom : null,
        choisi: doc.modele && permis.includes(doc.modele) ? doc.modele : null,
        retenu,
        peutChoisir: peutChoisirModele(caps),
      })
    }
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
      return ok(res)
    }
    return err(res, 404, 'introuvable')
  }
}
