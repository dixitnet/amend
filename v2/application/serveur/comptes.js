// Les routes des comptes et du partage (couche application, étape 6a) : la
// connexion par lien magique (ADR 0005), les documents, les accès, les
// invitations et le lien de partage, sur le modèle de Docs et selon
// l'arbitrage de Sylvain (09/11/2026). Les règles sont dans le domaine ; le
// dépôt (adaptateur PostgreSQL) garde les données ; réponses en codes.
//
//   POST   /api/connexion                    { courriel, document? }  lien par courriel
//   GET    /api/connexion/:jeton             le lien du courrier : renvoie à la page, sans rien consommer
//   POST   /api/connexion/:jeton             ouvre la session (la page l'envoie) → { document }
//   POST   /api/deconnexion
//   POST   /api/deconnexion-partout
//   PUT    /api/moi                          { nom }
//   GET    /api/moi/suppression              aperçu : ce que deviendraient mes documents et équipes
//   DELETE /api/moi                          { courriel }  supprimer mon compte (adresse en toutes lettres)
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
//
// Ce fichier garde la construction des aides partagées et l'aiguillage ; les
// routes sont découpées par famille (sans changement de logique) :
// `comptes-connexion.js`, `comptes-moi.js`, `comptes-dossiers.js`,
// `comptes-equipes.js`, `comptes-modeles.js`, `comptes-documents.js`,
// `comptes-acces.js`.
import {
  identifiantDocument,
  capacites,
  roleEffectif,
  DUREE_CORBEILLE_MS,
  DUREE_INVITATION_MS,
  DUREE_JOURNAL_MS,
  DUREE_MESURES_MS,
} from '../../domaine/index.js'
import { creerTraducteur, libelleDuRole, libelleDuRoleEquipe } from '../../i18n/index.js'
import { courrierAvecLien } from '../../adaptateurs/courrier/index.js'
import { decoder } from './adresse.js'
import { creerConnexion } from './comptes-connexion.js'
import { creerMoi } from './comptes-moi.js'
import { creerDossiers } from './comptes-dossiers.js'
import { creerEquipes } from './comptes-equipes.js'
import { creerModeles } from './comptes-modeles.js'
import { creerDocuments } from './comptes-documents.js'
import { creerAcces } from './comptes-acces.js'

/**
 * @param {object} o
 * @param {object} o.CONF
 * @param {any} o.comptes  le dépôt des comptes
 * @param {any} [o.commentaires]  le dépôt des commentaires (effacés avec le document)
 * @param {{ envoyer: Function }} o.courrier
 * @param {{ supprimerDocument: (docId: string) => Promise<void>, revoirAcces?: (docId: string, personne?: string | null) => Promise<void> } | null} o.collaboration
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

  /**
   * Les droits sur un document ont changé : ses connexions ouvertes les
   * redemandent (montage de Docs, `reset-connections`), pour `personne` ou pour
   * tous. Un échec ne fait pas échouer le changement : la personne garde au pire
   * ses anciens droits jusqu'à son prochain rechargement (journal).
   */
  async function revoir(docId, personne = null) {
    if (!collaboration?.revoirAcces) return
    await collaboration.revoirAcces(docId, personne).catch((e) => console.error('revoir les accès :', e.message))
  }
  /** De même pour tous les documents d'une équipe (le rôle d'un membre a changé). */
  async function revoirEquipe(equipe, membreQuiVoit, personne) {
    // En parallèle : une demande par document (y/hub n'en connaît pas pour une équipe).
    await Promise.all((await comptes.documentsDeLEquipe(equipe, membreQuiVoit)).map((d) => revoir(d.id, personne)))
  }

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
    await effacerContenu(docId)
  }
  /** Ce qui reste d'un document effacé de la base : ses fils et son texte dans y/hub. */
  async function effacerContenu(docId) {
    await commentaires
      ?.supprimerFilsDuDocument(docId)
      .catch((e) => console.error(`[serveur] suppression des fils de ${docId} :`, e))
    if (collaboration)
      await collaboration
        .supprimerDocument(docId)
        .catch((e) => console.error(`[serveur] suppression dans y/hub de ${docId} :`, e))
  }
  /** L'équipe visée par une requête : `null` (Mes documents) ou un identifiant. */
  const equipeVisee = (v) => (v === undefined || v === null ? null : String(v))

  // Les aides partagées avec les modules de routes.
  const ctx = {
    CONF,
    comptes,
    courrier,
    collaboration,
    json,
    lireCorps,
    cookieDeSession,
    cookieEfface,
    t,
    nomDuRole,
    nomDuRoleEquipe,
    courrierSimple,
    ok,
    err,
    statutDuRefus,
    revoir,
    revoirEquipe,
    envoyerLien,
    roleSur,
    effacer,
    effacerContenu,
    equipeVisee,
  }
  const connexion = creerConnexion(ctx)
  const moi = creerMoi(ctx)
  const dossiers = creerDossiers(ctx)
  const { modelesEquipe, modelesDocument } = creerModeles(ctx)
  const equipes = creerEquipes({ ...ctx, modelesEquipe })
  const { corbeille, listeEtCreation, document } = creerDocuments(ctx)
  const acces = creerAcces(ctx)

  /** Efface pour de bon les documents restés plus de 30 jours dans la corbeille. */
  async function purger(maintenant = Date.now()) {
    for (const id of await comptes.corbeilleExpiree(maintenant - DUREE_CORBEILLE_MS)) await effacer(id)
    // Les jetons de connexion expirés ou utilisés et les invitations périmées
    // (la durée d'une invitation est une règle du domaine ; audit du 11/11/2026).
    await comptes.purgerPerimes(maintenant, { invitationsAvant: maintenant - DUREE_INVITATION_MS })
    // Le journal et les relevés de mémoire du back-office (durées : domaine).
    await comptes.purgerSuivi({
      journalAvant: maintenant - DUREE_JOURNAL_MS,
      mesuresAvant: maintenant - DUREE_MESURES_MS,
    })
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
    const connexionRendue = await connexion(req, res, racine, segments, methode)
    if (connexionRendue !== undefined) return connexionRendue
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

    // --- Supprimer mon compte, mon nom ---
    const moiRendu = await moi(req, res, p, racine, segments, methode)
    if (moiRendu !== undefined) return moiRendu

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

    // --- Dossiers : les miens (étape 6c) et ceux de mes équipes (6d) ---
    if (racine === 'dossiers') return dossiers(req, res, p, segments, membre, dossierDe)

    // --- Équipes (dossiers d'équipe, étape 6d) ---
    if (racine === 'equipes') return equipes(req, res, p, segments, membre)

    // --- Corbeille (lots du 11/11/2026, comme Docs : \`trashbin\`, \`restore\`) ---
    if (racine === 'corbeille') return corbeille(req, res, p, segments)

    // --- Mes documents et Partagé avec moi (et la liste de mes équipes) ---
    // (Une autre racine sans segment, « GET /api/connexion » par exemple, ne
    // rend pas la liste des documents : 404.)
    if (racine !== 'documents') return err(res, 404, 'introuvable')
    if (!segments.length) return listeEtCreation(req, res, p, membre, dossierDe)

    const d = identifiantDocument(segments[0])
    if (!d.ok) return err(res, 400, d.code)
    const docId = d.id
    const { role, caps } = await roleSur(docId, p.id)
    if (!role) return err(res, 404, 'document-introuvable')
    const [, sous, cible, ...trop] = segments
    if (trop.length) return err(res, 404, 'introuvable')

    const cx = { docId, role, caps, sous, cible }
    const documentRendu = await document(req, res, p, cx, membre, dossierDe)
    if (documentRendu !== undefined) return documentRendu
    const modelesRendus = await modelesDocument(req, res, p, cx)
    if (modelesRendus !== undefined) return modelesRendus
    return acces(req, res, p, cx)
  }
}
