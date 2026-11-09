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
//   DELETE /api/documents/:doc               le propriétaire seul, tout de suite
//   PUT    /api/documents/:doc/dossier       { dossier }  le ranger (null : racine de Mes documents)
//   DELETE /api/documents/:doc/moi           me retirer du document (Partagé avec moi)
//   POST   /api/dossiers                     { nom, parent? }  (étape 6c : rangement personnel)
//   PUT    /api/dossiers/:id                 { nom?, parent? }
//   DELETE /api/dossiers/:id                 seulement vide
//   GET    /api/documents/:doc/acces         accès, invitations, lien (qui invite)
//   POST   /api/documents/:doc/acces         { courriel, role }  donner ou inviter
//   PUT    /api/documents/:doc/acces/:id     { role }
//   DELETE /api/documents/:doc/acces/:id
//   DELETE /api/documents/:doc/invitations/:courriel
//   PUT    /api/documents/:doc/lien          { role }  (null : lien fermé)
import { randomUUID } from 'node:crypto'
import {
  identifiantDocument,
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
  peutRanger,
  refusRetrait,
  DUREE_INVITATION_MS,
  DUREE_LIEN_CONNEXION_MS,
} from '../../domaine/index.js'
import { creerTraducteur, libelleDuRole } from '../../i18n/index.js'
import { courrierAvecLien } from '../../adaptateurs/courrier/index.js'

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
  const ok = (res, corps = {}, statut = 200) => (json(res, statut, corps), true)
  const err = (res, statut, code) => (json(res, statut, { code }), true)

  async function envoyerLien(courriel, document, { dureeMs, sujet, intro, libelleLien }) {
    const jeton = await comptes.creerJeton(courriel, document, dureeMs)
    const lien = `${CONF.adresse}/api/connexion/${jeton}`
    const m = courrierAvecLien({ intro, libelleLien, lien, copier: t('courriel.copier'), apres: t('courriel.apres') })
    await courrier.envoyer({ a: courriel, sujet, texte: m.texte, html: m.html })
  }

  /** Le rôle effectif d'une personne sur un document, et ses capacités. */
  async function roleSur(docId, idPersonne) {
    const role = roleEffectif(await comptes.rolesDe(docId, idPersonne))
    return { role, caps: capacites(role) }
  }

  return async function traiter(req, res, url) {
    const m = url.pathname.match(
      /^\/api\/(connexion|deconnexion|deconnexion-partout|moi|documents|dossiers)(?:\/(.*))?$/,
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
      const invitation = (await comptes.invitationsDe(a.courriel)).some((i) => invitationValable(i.creeLe))
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

    /** Un dossier à moi (ou la racine, `null`), sinon `undefined`. */
    const monDossier = async (id) => {
      if (id === null || id === undefined) return null
      const d = await comptes.dossier(id)
      return d && d.personne === p.id ? d.id : undefined
    }

    // --- Mes dossiers (rangement personnel, étape 6c) ---
    if (racine === 'dossiers') {
      if (!segments.length) {
        if (methode !== 'POST') return err(res, 405, 'methode-refusee')
        const corps = await lireCorps(req)
        const n = nomDossier(corps.nom)
        if (!n.ok) return err(res, 400, n.code)
        const parent = await monDossier(corps.parent)
        if (parent === undefined) return err(res, 404, 'dossier-introuvable')
        return ok(res, { id: await comptes.creerDossier(p.id, n.nom, parent) }, 201)
      }
      if (segments.length > 1) return err(res, 404, 'introuvable')
      const id = await monDossier(segments[0])
      if (!id) return err(res, 404, 'dossier-introuvable')
      if (methode === 'DELETE')
        return (await comptes.supprimerDossierVide(id)) ? ok(res) : err(res, 409, 'dossier-non-vide')
      if (methode !== 'PUT') return err(res, 405, 'methode-refusee')
      const corps = await lireCorps(req)
      // Tout est vérifié avant de rien changer (audit, 09/11/2026).
      const n = corps.nom === undefined ? null : nomDossier(corps.nom)
      if (n && !n.ok) return err(res, 400, n.code)
      if (corps.parent !== undefined) {
        const refus = await comptes.deplacerDossier(p.id, id, corps.parent, (dossiers) =>
          refusDeplacementDossier(dossiers, id, corps.parent),
        )
        if (refus) return err(res, refus === 'dossier-introuvable' ? 404 : 409, refus)
      }
      if (n) await comptes.renommerDossier(id, n.nom)
      return ok(res)
    }

    // --- Mes documents et Partagé avec moi ---
    if (!segments.length) {
      if (methode === 'GET')
        return ok(res, {
          dossiers: await comptes.dossiersDe(p.id),
          documents: (await comptes.documentsDe(p.id)).map((d) => {
            const section = sectionDuDocument(d.emplacement, p.id)
            return {
              id: d.id,
              titre: d.titre,
              creeLe: d.creeLe,
              role: roleEffectif(d.roles),
              section,
              ...(section === 'mes-documents'
                ? { dossier: d.dossier }
                : { partagePar: d.partagePar, parLien: d.parLien, partageLe: d.partageLe }),
            }
          }),
        })
      if (methode !== 'POST') return err(res, 405, 'methode-refusee')
      const { titre, dossier } = await lireCorps(req)
      if (titre !== undefined && titre !== null && (typeof titre !== 'string' || titre.length > 200))
        return err(res, 400, 'titre-invalide')
      const rangement = await monDossier(dossier)
      if (rangement === undefined) return err(res, 404, 'dossier-introuvable')
      const id = randomUUID()
      await comptes.creerDocument(id, p.id, titre?.normalize('NFC').trim() || null, rangement)
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

    // DELETE /api/documents/:doc : le propriétaire seul, tout de suite (pas de corbeille).
    if (!sous) {
      if (methode !== 'DELETE') return err(res, 405, 'methode-refusee')
      if (!caps.includes('supprimer')) return err(res, 403, 'droit-insuffisant')
      // D'abord la base (le document disparaît pour tous), puis le contenu dans
      // y/hub : un échec de y/hub laisse un contenu inaccessible, pas un document
      // listé mais vidé (audit, 09/11/2026).
      await comptes.supprimerDocument(docId)
      await commentaires?.supprimerFilsDuDocument(docId)
      if (collaboration)
        await collaboration
          .supprimerDocument(docId)
          .catch((e) => console.error(`[serveur] suppression dans y/hub de ${docId} :`, e))
      return ok(res)
    }
    // PUT /api/documents/:doc/dossier : le propriétaire le range dans ses dossiers.
    if (sous === 'dossier' && !cible && methode === 'PUT') {
      const doc = await comptes.document(docId)
      if (!peutRanger(caps, doc.emplacement, p.id)) return err(res, 403, 'droit-insuffisant')
      const rangement = await monDossier((await lireCorps(req)).dossier)
      if (rangement === undefined) return err(res, 404, 'dossier-introuvable')
      await comptes.rangerDocument(docId, rangement)
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
    if (!caps.includes('inviter')) return err(res, 403, 'droit-insuffisant')

    if (sous === 'acces' && !cible && methode === 'GET') {
      const doc = await comptes.document(docId)
      return ok(res, {
        acces: await comptes.accesDuDocument(docId),
        invitations: (await comptes.invitationsDuDocument(docId)).filter((i) => invitationValable(i.creeLe)),
        lien: doc.roleLien,
        rolesDonnables: rolesDonnables(caps),
      })
    }
    if (sous === 'acces' && !cible && methode === 'POST') {
      const corps = await lireCorps(req)
      const a = adresseCourriel(corps.courriel)
      if (!a.ok) return err(res, 400, a.code)
      const invite = await comptes.personneParCourriel(a.courriel)
      const actuel = invite ? await comptes.acces(docId, invite.id) : null
      const refus = refusAcces(caps, actuel, corps.role ?? null, await comptes.proprietaires(docId))
      if (refus || corps.role === null || corps.role === undefined)
        return err(res, refus === 'droit-insuffisant' ? 403 : 400, refus ?? 'role-invalide')
      const doc = await comptes.document(docId)
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
      const refus = refusAcces(caps, actuel, nouveau, await comptes.proprietaires(docId))
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
