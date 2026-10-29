// Le back-office : diagnostic, vue d'ensemble, retours, sauvegarde, liste d'attente, embarquement.
// Extrait de server.js (point 43 de la feuille de route, 11/10/2026) : l'ordre des
// routes et leur comportement sont inchangés.

import { createGzip } from 'node:zlib'
import { apercu } from '../admin.js'
import { fluxTar } from '../archive.js'
import { analyserImages, purgerImages } from '../imagesOrphelines.js'
import { isAdminEmail, normalizeEmail, readSession } from '../auth.js'
import { etatDuCourrierEnMemoire, sendMail } from '../mailgun.js'
import { courrierBienvenue, courrierInvitation, quiInvite } from '../courriersInvitation.js'
import { supprimerDefinitivement } from '../corbeille.js'
import { TITRE_BIENVENUE, ecrireModele, estDocBienvenue } from '../modeleBienvenue.js'
import { cleDuRetour } from '../supportTraites.js'
import { sendJson, readJsonBody, decoderSegment, PAS_TRAITE } from '../http.js'
import { cleDe } from '../fournisseurs.js'
import { BORNES, DEFAUTS, FONCTIONS, MODELES, NIVEAUX, NOMS_FONCTION } from '../reglagesIa.js'
import { CORPS_JSON_OCTETS_MAX, GARDE_FOUS, GROUPES, gardeFousEnVigueur } from '../garde-fous.js'
import { TARIFS_EUR, TARIFS_USD, moisDe } from '../usageIa.js'

/** Le mode d'emploi glissé dans l'archive. Une sauvegarde qu'on retrouve
 * dans deux ans sans savoir quoi en faire ne sert à personne — et le jour
 * où l'on en a besoin est rarement le jour où l'on a l'esprit clair. */
function modeDEmploiRestauration(nom) {
  return `# Restaurer cette sauvegarde

Archive : ${nom}
Prise le : ${new Date().toISOString()}
Contenu  : le dossier \`data/\` de amend.ink — documents, images, comptes,
           accès, pages publiées, journaux d'événements.

## Ce qui n'est PAS dedans

Le fichier \`.env\` (clés Anthropic et Mailgun, SESSION_SECRET,
ADMIN_EMAILS), le Caddyfile et l'unité systemd. Ce sont des secrets : ils
n'ont pas à transiter par un navigateur.

**Restaurer \`data/\` sans son \`.env\` d'origine déconnecte tout le monde
(SESSION_SECRET change) et, si ADMIN_EMAILS manque, plus personne ne peut
entrer.** Sauvegardez ces fichiers séparément.

## La procédure

    sudo systemctl stop amend
    mv /opt/amend/data /opt/amend/data.avant-restauration
    tar xzf ${nom} -C /opt/amend
    sudo systemctl start amend
    systemctl status amend --no-pager | head -8

L'archive se déplie en un dossier \`data/\` : \`-C /opt/amend\` le met
donc au bon endroit. L'ancien dossier est conservé à côté — ne l'effacez
qu'après avoir vérifié que l'application répond et qu'un document s'ouvre.

## Une précaution qui vaut la peine

Cette sauvegarde a été prise pendant que l'application tournait. C'est sans
danger — les registres sont écrits de façon atomique, les journaux sont en
ajout seul — mais faites l'essai **une fois**, sur une instance jetable,
avant d'en avoir besoin. Une sauvegarde jamais restaurée n'est pas une
sauvegarde.
`
}

export async function routesAdmin(req, res, url, ctx) {
  const { pathname } = url
  const {
    metrics,
    repliques,
    reglagesIa,
    rooms,
    storage,
    supportTraites,
    uploads,
    usageIa,
    users,
    APP_BASE_URL,
    DATA_DIR,
    invitationAutorisee,
  } = ctx

  // Point de diagnostic temporaire pour le test de charge du 13/09/2026
  // (voir README.md, section dédiée) : mémoire du processus et un indicateur
  // simple de latence de la boucle d'événements Node (le temps qu'un
  // setImmediate mette à s'exécuter — un indicateur direct de "combien de
  // travail est déjà en attente" pendant une rafale de modifications).
  // Aucune information sensible, laissé en place après le test comme un
  // petit outil de diagnostic auto-hébergé de plus, dans le même esprit que
  // le reste de l'appli.
  if (pathname === '/api/debug/stats' && req.method === 'GET') {
    if (!isAdminEmail(readSession(req))) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    const start = process.hrtime.bigint()
    return new Promise((resolve) => {
      setImmediate(() => {
        const loopLagMs = Number(process.hrtime.bigint() - start) / 1e6
        sendJson(res, 200, {
          pid: process.pid,
          uptimeSec: process.uptime(),
          memory: process.memoryUsage(),
          loopLagMs,
          connexions: rooms.totalConnexions(),
          salles: rooms.rooms.size,
          repliques: rooms.repliques ? rooms.repliques.repliques.size : 0,
        })
        resolve()
      })
    })
  }

  // Réglages de l'IA et consommation (13/10/2026) : une page dédiée du
  // back-office. GET donne les réglages d'instance de Corrections IA et de Margo,
  // et, pour un mois (le mois en cours par défaut), la consommation de chaque
  // personne et les jetons par modèle. PUT modifie les réglages (tout ou rien).
  // Tout se compte en signes, espaces compris.
  if (pathname === '/api/admin/ia' && (req.method === 'GET' || req.method === 'PUT')) {
    const admin = readSession(req)
    if (!isAdminEmail(admin)) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    if (req.method === 'PUT') {
      // La manière de répondre de Margo n'a plus de longueur réglée (22/10/2026) :
      // le corps accepté est celui des requêtes de l'interface (le défaut de 20 Ko la refuserait).
      const body = await readJsonBody(req, CORPS_JSON_OCTETS_MAX)
      reglagesIa.modifier(body, admin)
    }
    const demande = url.searchParams.get('mois')
    const courant = moisDe(Date.now())
    const mois = demande && /^\d{4}-(0[1-9]|1[0-2])$/.test(demande) ? demande : courant
    const detail = usageIa.detail(mois)
    const comptes = users ? users.tous() : {}
    const disponibles = [...new Set([courant, ...usageIa.moisDisponibles()])].sort().reverse()
    const utilisateurs = detail.utilisateurs
      .map((u) => ({ ...u, nom: (comptes[u.email] || {}).nom || null }))
      .sort((a, b) => b.corrections.signes + b.margo.signes - (a.corrections.signes + a.margo.signes))
    return sendJson(res, 200, {
      reglages: reglagesIa.tous(),
      defauts: DEFAUTS,
      bornes: BORNES,
      // Les garde-fous (server/garde-fous.js) : leur liste documentée, et la valeur en vigueur de chacun.
      gardeFous: { groupes: GROUPES, definitions: GARDE_FOUS, valeurs: gardeFousEnVigueur() },
      // `cle` : la clé du fournisseur est-elle dans le .env ? (jamais sa valeur)
      modeles: MODELES.map((m) => ({ ...m, cle: Boolean(cleDe(m.id)) })),
      niveaux: NIVEAUX,
      fonctions: FONCTIONS.map((id) => ({ id, nom: NOMS_FONCTION[id] })),
      mois: detail.mois,
      moisDisponibles: disponibles,
      utilisateurs,
      jetonsParModele: detail.modeles,
      tarifsUsd: TARIFS_USD,
      tarifsEur: TARIFS_EUR,
      boutons: usageIa.boutons(),
    })
  }

  // Tarifs du modèle, en euros par million de jetons — lus du .env comme le
  // reste des réglages (voir .env.example). Ils ne servent qu'à traduire les
  // jetons déjà journalisés en une somme lisible : rien dans l'application ne
  // s'appuie dessus pour décider quoi que ce soit, un tarif périmé fausse un
  // affichage, jamais un comportement.
  const TARIFS_IA = {
    modele: 'claude-haiku-5-5',
    entreeEurParMTok: Number(process.env.AI_PRICE_INPUT_EUR) || 0.087,
    sortieEurParMTok: Number(process.env.AI_PRICE_OUTPUT_EUR) || 0.434,
  }

  // Vue d'ensemble du back-office (voir claude/conception-backoffice.md) :
  // lecture seule, réservée aux administrateurs comme le diagnostic. Elle
  // n'ouvre aucune action et ne renvoie aucun contenu de document.
  if (pathname === '/api/admin/overview' && req.method === 'GET') {
    if (!isAdminEmail(readSession(req))) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    return sendJson(
      res,
      200,
      apercu({
        storage,
        rooms,
        repliques,
        metrics,
        uploads,
        users,
        tarifsIA: TARIFS_IA,
        dataDir: DATA_DIR,
        waitlistPath: storage.waitlistPath,
        supportTraites,
      })
    )
  }

  // Marquer un retour comme traité, ou le rouvrir (22/09/2026). C'est la
  // **première action** du back-office, resté jusqu'ici en lecture seule :
  // elle ne touche ni aux documents ni aux comptes, et n'écrit que dans une
  // table annexe — le journal des retours, lui, reste en ajout seul, et rien
  // de ce qu'une personne a signalé n'est jamais effacé. C'est aussi
  // pourquoi « traiter » plutôt que « supprimer » : un bug revient parfois
  // trois semaines plus tard, et il faut pouvoir retrouver son signalement.
  const supportTraiteMatch = pathname.match(/^\/api\/admin\/support\/([^/]{1,60})\/traite$/)
  if (supportTraiteMatch && req.method === 'POST') {
    if (!isAdminEmail(readSession(req))) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    const body = await readJsonBody(req)
    const cle = decoderSegment(supportTraiteMatch[1])
    // Le retour doit exister : sans cette vérification, la table se
    // remplirait de clés inventées, et l'on ne s'en apercevrait jamais.
    const connus = new Set(metrics.read('support', 0).map((r) => cleDuRetour(r)))
    if (!connus.has(cle)) return sendJson(res, 404, { error: 'retour introuvable' })
    supportTraites.marquer(cle, readSession(req), body.traite !== false)
    return sendJson(res, 200, { ok: true, traite: body.traite !== false })
  }

  // --- Authentification (voir claude/conception-gestion-utilisateurs.md,
  // projet Amend) : reconnexion par lien magique, valable pour toute
  // adresse (pas seulement celles ayant déjà accès à un document — créer
  // un nouveau document, dont on devient éditeur, ne demande rien de plus). ---

  // --- Liste d'attente publique (page d'accueil pour les visiteurs non
  // connectés) : juste stocker l'email pour l'instant, pas de gestion —
  // voir claude/conception-gestion-utilisateurs.md (projet Amend). ---
  // Rien de la liste d'attente ne sort sans être administrateur — ni les
  // adresses, ni même leur nombre (décision du 17/09 : le compteur ne sera
  // pas public). L'écriture reste ouverte, c'est tout l'intérêt du
  // formulaire ; la lecture, non.
  // --- Images orphelines (23/10/2026) : celles que plus rien ne référence. ---
  //
  // GET analyse sans rien toucher ; POST supprime, après avoir refait
  // l'analyse (ce qui s'affiche à l'écran peut avoir changé depuis). Les
  // écritures en attente partent d'abord sur le disque : le journal d'un
  // document actif retient jusqu'à 200 ms de frappe. Voir imagesOrphelines.js
  // pour ce qu'est une image « encore utilisée » et pourquoi on ne supprime
  // rien de plus récent que le délai de grâce.
  if (pathname === '/api/admin/images-orphelines' && (req.method === 'GET' || req.method === 'POST')) {
    const admin = readSession(req)
    if (!isAdminEmail(admin)) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    await storage.flushAll()
    if (req.method === 'POST') {
      const resultat = purgerImages(DATA_DIR)
      if (!resultat.ok) {
        return sendJson(res, 409, {
          error: `Une source n'a pas pu être lue (${resultat.illisibles.length}) : rien n'a été supprimé.`,
        })
      }
      metrics.log('images', { type: 'purge', email: admin, supprimees: resultat.supprimees, octets: resultat.octets })
      return sendJson(res, 200, resultat)
    }
    const analyse = analyserImages(DATA_DIR)
    return sendJson(res, 200, {
      ...analyse,
      // Le titre n'est qu'une aide à la lecture ; un document disparu n'en a plus.
      documents: analyse.documents.map((d) => ({ ...d, titre: (storage.getDoc(d.docId) || {}).title || null })),
    })
  }

  // --- Sauvegarde : télécharger tout `data/` (18/09/2026) ---
  //
  // C'est **la route la plus sensible de l'application** : une requête, et
  // l'on obtient tous les documents, toutes les adresses, toutes les
  // images. Administrateurs seuls, par cookie de session (jamais un jeton
  // dans l'URL : une adresse se recopie, se colle, se retrouve dans un
  // historique — un cookie non), et chaque usage laisse une trace.
  //
  // Ce qui n'y est **jamais** : `.env`. Les secrets ne transitent pas par
  // un navigateur. Ils doivent être sauvegardés, mais ailleurs et
  // autrement — voir claude/conception-sauvegarde.md.
  if (pathname === '/api/admin/sauvegarde' && req.method === 'GET') {
    const email = readSession(req)
    if (!isAdminEmail(email)) return sendJson(res, 403, { error: 'réservé aux administrateurs' })

    // Les écritures en attente d'abord : `appendUpdate` garde les mises à
    // jour en mémoire jusqu'à 200 ms. Sans ça l'archive rate la dernière
    // fraction de seconde — la seule qu'on regretterait vraiment.
    await storage.flushAll()

    const horodatage = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
    const nom = `amend-${horodatage}.tar.gz`
    metrics.log('sauvegarde', { email })

    res.writeHead(200, {
      'content-type': 'application/gzip',
      'content-disposition': `attachment; filename="${nom}"`,
      // La taille n'est pas connue d'avance (on compresse au fil de l'eau)
      // et c'est assumé : le navigateur affichera une progression sans
      // total plutôt qu'on ne fabrique l'archive en mémoire pour compter.
      'cache-control': 'no-store',
    })

    const tar = fluxTar(DATA_DIR, {
      prefixe: 'data',
      // Un `.tmp` est une écriture en cours : ce n'est jamais un état
      // cohérent, et il n'a rien à faire dans une sauvegarde.
      ignorer: (rel) => rel.endsWith('.tmp') || rel === '.pid',
      supplements: [{ nom: 'RESTAURATION.md', contenu: modeDEmploiRestauration(nom) }],
    })
    const gzip = createGzip({ level: 6 })
    tar.on('error', (err) => {
      console.error('Sauvegarde interrompue :', err.message)
      res.destroy()
    })
    tar.pipe(gzip).pipe(res)
    return
  }

  if (pathname === '/api/admin/waitlist' && req.method === 'GET') {
    if (!isAdminEmail(readSession(req))) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    // `inscrits` : le fichier tel quel (doublons compris). `file` : une ligne
    // par adresse, la plus ancienne d'abord, avec son statut (attente,
    // embarque, acces) ; `enAttente` : combien attendent vraiment.
    return sendJson(res, 200, { inscrits: storage.waitlist(), ...storage.fileAttente() })
  }

  // --- Embarquer un testeur (01/10/2026) ---
  //
  // Un clic du back-office : on crée **pour cette personne** un premier
  // document à contenu type, dont elle est la propriétaire (décision de
  // Sylvain : c'est son document — pas dans la liste de l'administrateur,
  // et pas lisible par lui), et on lui envoie l'invitation comme éditrice.
  //
  // Ordre pensé pour qu'un échec ne laisse rien derrière lui : le document
  // est créé, rempli, puis le courrier part en dernier ; s'il échoue, le
  // document est supprimé — mieux vaut rien qu'un document que personne ne
  // sait ouvrir. La liste d'attente n'est touchée qu'à la réussite.
  if (pathname === '/api/admin/embarquer' && req.method === 'POST') {
    const admin = readSession(req)
    if (!isAdminEmail(admin)) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    const body = await readJsonBody(req)
    const email = normalizeEmail(body.email)
    if (!email) return sendJson(res, 400, { error: 'adresse email invalide' })
    if (storage.emailHasAnyAccess(email)) {
      return sendJson(res, 409, { error: 'cette adresse a déjà accès à un document' })
    }
    const doc = storage.createDoc(TITRE_BIENVENUE, email)
    const annuler = () => {
      storage.deleteDoc(doc.id)
      uploads.supprimerDocument(doc.id)
    }
    const { token } = storage.inviteEmail(doc.id, email, 'editeur', admin)
    try {
      await rooms.ecrireDocument(doc.id, (ydoc) => ecrireModele(ydoc))
    } catch (err) {
      console.error("Échec de l'écriture du document de bienvenue :", err.message)
      annuler()
      return sendJson(res, 500, { error: "le document de bienvenue n'a pas pu être créé" })
    }
    const lien = `${APP_BASE_URL}/#/invite/${token}`
    const de = users.nomDe(admin) || admin
    try {
      await sendMail({ to: email, ...courrierBienvenue({ de, lien }) })
      metrics.log('mail', { type: 'embarquement', ok: true })
    } catch (err) {
      console.error("Échec d'envoi du courrier d'embarquement :", err.message)
      metrics.log('mail', { type: 'embarquement', ok: false, erreur: err.message })
      annuler()
      return sendJson(res, 502, { error: "le courrier n'a pas pu être envoyé : rien n'a été créé" })
    }
    const surListe = storage.marquerEmbarque(email, doc.id, admin) > 0
    metrics.log('embarquements', { docId: doc.id, surListe })
    return sendJson(res, 200, { email, docId: doc.id, titre: doc.title, surListe })
  }

  // --- Les invitations en attente, au back-office (23/10/2026) ---
  //
  // Les mêmes gestes que dans le panneau de partage d'un document (où en est le
  // courrier, copier le lien, renvoyer), plus « supprimer » : l'administrateur
  // voit toutes les invitations sans réponse, y compris celles qu'il n'a pas
  // envoyées et sur des documents où il n'a aucun accès. Le contenu des
  // documents, lui, reste hors de sa vue.
  //
  // Une invitation d'embarquement n'est pas une ligne d'accès comme les
  // autres : la personne est propriétaire d'un document de bienvenue que
  // l'administrateur a créé pour elle. La supprimer, c'est supprimer ce
  // document (que personne n'a ouvert) et remettre l'adresse dans la liste
  // d'attente.

  /** L'invitation en attente de `email` sur `docId`, ou null. */
  const invitationEnAttente = (docId, email) => {
    const doc = typeof docId === 'string' && storage.getDoc(docId)
    if (!doc) return null
    const entree = storage.getAccess(docId).find((a) => a.email === email && a.status === 'invite')
    return entree ? { doc, entree, bienvenue: estDocBienvenue(doc, email, storage.ownerOf(docId)) } : null
  }

  if (pathname === '/api/admin/invitations/courrier' && req.method === 'GET') {
    if (!isAdminEmail(readSession(req))) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    const lignes = []
    for (const d of storage.allDocs()) {
      for (const a of d.access || []) {
        if (a.status === 'invite' && a.invitedAt) {
          lignes.push({
            docId: d.id,
            email: a.email,
            invitedAt: a.invitedAt,
            bienvenue: estDocBienvenue(d, a.email, storage.ownerOf(d.id)),
          })
        }
      }
    }
    // Les plus récentes d'abord : ce sont celles que le fournisseur a encore.
    lignes.sort((a, b) => b.invitedAt - a.invitedAt)
    const etats = {}
    await Promise.all(
      lignes.slice(0, 40).map(async (l) => {
        etats[`${l.docId}|${l.email}`] = await etatDuCourrierEnMemoire(
          l.email,
          l.invitedAt,
          l.bienvenue ? /^Bienvenue/i : undefined
        )
      })
    )
    return sendJson(res, 200, { etats })
  }

  const invGesteMatch = pathname.match(/^\/api\/admin\/invitations\/(lien|renvoyer)$/)
  if (invGesteMatch && req.method === 'POST') {
    const admin = readSession(req)
    if (!isAdminEmail(admin)) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    const body = await readJsonBody(req)
    const email = normalizeEmail(body.email)
    const inv = email && invitationEnAttente(body.docId, email)
    if (!inv) return sendJson(res, 404, { error: 'aucune invitation en attente pour cette adresse' })
    res.setHeader('cache-control', 'no-store')

    if (invGesteMatch[1] === 'lien') {
      const nouveau = storage.renouvelerLien(body.docId, email)
      if (!nouveau) return sendJson(res, 404, { error: 'aucune invitation en attente pour cette adresse' })
      return sendJson(res, 200, { lien: `${APP_BASE_URL}/#/invite/${nouveau.token}` })
    }

    if (!invitationAutorisee(admin, email)) {
      return sendJson(res, 429, { error: 'trop d’invitations envoyées pour le moment : réessayez plus tard' })
    }
    // Un nouveau lien (l'ancien cesse de marcher) et un nouveau courrier. La
    // personne qui avait invité reste celle que le courrier nomme ; pour un
    // embarquement, c'est l'administrateur qui renvoie.
    const { token } = storage.inviteEmail(body.docId, email, inv.entree.role, inv.entree.invitedBy)
    const lien = `${APP_BASE_URL}/#/invite/${token}`
    const type = inv.bienvenue ? 'embarquement' : 'invitation'
    try {
      const courrier = inv.bienvenue
        ? courrierBienvenue({ de: users.nomDe(admin) || admin, lien })
        : courrierInvitation({
            qui: quiInvite(inv.entree.invitedBy || admin, users.nomDe(inv.entree.invitedBy || admin)),
            titre: inv.doc.title,
            role: inv.entree.role,
            lien,
          })
      await sendMail({ to: email, ...courrier })
      metrics.log('mail', { type, ok: true, renvoi: true })
    } catch (err) {
      console.error("Échec du renvoi de l'invitation :", err.message)
      metrics.log('mail', { type, ok: false, erreur: err.message, renvoi: true })
      return sendJson(res, 502, { error: "le courrier n'a pas pu être envoyé : le nouveau lien reste valable" })
    }
    return sendJson(res, 200, { email, renvoyee: true })
  }

  if (pathname === '/api/admin/invitations' && req.method === 'DELETE') {
    const admin = readSession(req)
    if (!isAdminEmail(admin)) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    const body = await readJsonBody(req)
    const email = normalizeEmail(body.email)
    const inv = email && invitationEnAttente(body.docId, email)
    if (!inv) return sendJson(res, 404, { error: 'aucune invitation en attente pour cette adresse' })
    if (inv.bienvenue) {
      supprimerDefinitivement(ctx, body.docId, admin)
      const remiseEnAttente = storage.annulerEmbarquement(email) > 0
      metrics.log('invitation_supprimee', { docId: body.docId, bienvenue: true, remiseEnAttente })
      return sendJson(res, 200, { ok: true, documentSupprime: true, remiseEnAttente })
    }
    if (!storage.revokeAccess(body.docId, email)) {
      return sendJson(res, 409, {
        error: 'cette invitation ne peut pas être supprimée : la personne porte le document',
      })
    }
    metrics.log('invitation_supprimee', { docId: body.docId, bienvenue: false })
    return sendJson(res, 200, { ok: true })
  }

  return PAS_TRAITE
}
