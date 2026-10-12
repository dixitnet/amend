// La suppression d'un compte (point 7 de la feuille de route, 13/10/2026).
//
// Une personne qui s'en va doit pouvoir repartir sans rien laisser derrière
// elle qui la désigne, sans pour autant détruire le travail des autres. Ce
// module en tient les deux bouts :
//
//   - `apercuSuppression` dit ce qui va se passer, sans rien toucher : c'est
//     ce que la fenêtre de confirmation montre avant le geste ;
//   - `supprimerCompte` l'exécute.
//
// Ce que devient chaque document (le détail est dans `Storage.planSuppressionCompte`) :
// ceux qu'elle porte seule disparaissent ; ceux qu'elle porte avec d'autres
// passent à l'éditeur le plus ancien ; ceux qu'elle ne porte pas perdent
// simplement son accès. Si elle porte un document que seuls des lecteurs ou
// des correcteurs partagent, **on refuse** : elle choisit elle-même à qui le
// confier. Pas de décision silencieuse sur le travail d'autrui.
//
// Dans les documents conservés, ses commentaires et ses modifications en
// attente restent (ils font partie du travail des autres) mais ne portent
// plus son nom : « Compte supprimé » (voir `anonymiserDansDocument`).
//
// Ce qui n'est pas effacé, et que l'aperçu dit : les anciennes versions et
// les sauvegardes des documents conservés (elles gardent l'état d'alors, noms
// compris) ; les modifications **acceptées** (ce sont désormais du texte du
// document, plus des modifications de quelqu'un) ; et, dans un document où un
// autre membre porte le même nom, les marques de suivi — on ne devine pas à
// qui elles sont.

import * as Y from 'yjs'
import { ErreurHttp } from './erreurs.js'
import { supprimerDefinitivement } from './corbeille.js'
import { idCompte } from './users.js'
import { oublierAdresse } from './auth.js'
import { AUTEUR_AGENT, AUTEUR_INCONNU, NOM_COMMENTAIRES, NOM_TEXTE } from '../shared/protocole.js'

export const NOM_SUPPRIME = 'Compte supprimé'
export const NOM_AGENT_SUPPRIME = 'Claude (pour un compte supprimé)'

const cle = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .trim()
/** Le prénom que l'invitation d'un agent met dans son nom (routes/agents.js). */
const prenomDe = (nom, email) =>
  String(nom || String(email).split('@')[0])
    .trim()
    .split(/\s+/)[0]

/**
 * Efface le nom d'une personne d'un document : ses commentaires (par
 * identifiant) et ses marques de suivi en attente (par nom).
 *
 * @param {Y.Doc} doc
 * @param {object} qui
 * @param {string} qui.id          `idCompte` de la personne
 * @param {string|null} qui.nom    son nom affiché, s'il y en a un
 * @param {string[]} qui.etiquettesAgent  les « Claude (pour X) » qu'elle a pu faire naître
 * @param {boolean} qui.nomUnique  aucun autre membre du document ne porte ce nom
 * @param {boolean} qui.agentUnique  aucun autre membre n'a le même prénom
 * @returns {{commentaires: number, marques: number}}
 */
export function anonymiserDansDocument(doc, qui) {
  const bilan = { commentaires: 0, marques: 0 }
  const nom = cle(qui.nom)
  const remplacement = (user) => {
    const u = cle(user)
    if (nom && qui.nomUnique && u === nom) return NOM_SUPPRIME
    if (qui.agentUnique && qui.etiquettesAgent.includes(u)) return NOM_AGENT_SUPPRIME
    return null
  }

  doc.transact(() => {
    // Les commentaires : l'identifiant est la vérité. Ceux d'un agent invité
    // par la personne portent « Claude (pour Prénom) », pas son identifiant.
    const carte = doc.getMap(NOM_COMMENTAIRES)
    const aFaire = []
    carte.forEach((v, k) => {
      if (!v || typeof v !== 'object') return
      if (v.authorId === qui.id) aFaire.push([k, { ...v, author: NOM_SUPPRIME, authorId: AUTEUR_INCONNU }])
      else if (v.authorId === AUTEUR_AGENT && qui.agentUnique && qui.etiquettesAgent.includes(cle(v.author)))
        aFaire.push([k, { ...v, author: NOM_AGENT_SUPPRIME }])
    })
    for (const [k, v] of aFaire) {
      carte.set(k, v)
      bilan.commentaires++
    }

    // Les marques : il n'y a que le nom, on le compare tel quel.
    const parcourir = (parent) => {
      for (const enfant of parent.toArray()) {
        if (enfant instanceof Y.XmlText) {
          let position = 0
          for (const op of enfant.toDelta()) {
            const longueur = typeof op.insert === 'string' ? op.insert.length : 1
            if (op.attributes) {
              const changes = {}
              for (const [k, v] of Object.entries(op.attributes)) {
                const r = v && typeof v === 'object' && typeof v.user === 'string' ? remplacement(v.user) : null
                if (r) changes[k] = { ...v, user: r }
              }
              if (Object.keys(changes).length) {
                enfant.format(position, longueur, changes)
                bilan.marques++
              }
            }
            position += longueur
          }
        } else if (enfant instanceof Y.XmlElement) {
          for (const [k, v] of Object.entries(enfant.getAttributes())) {
            const r = v && typeof v === 'object' && typeof v.user === 'string' ? remplacement(v.user) : null
            if (r) {
              enfant.setAttribute(k, { ...v, user: r })
              bilan.marques++
            }
          }
          parcourir(enfant)
        }
      }
    }
    parcourir(doc.getXmlFragment(NOM_TEXTE))
  }, 'anonymisation')
  return bilan
}

/** Ce qui va arriver à ce compte, sans rien modifier. */
export function apercuSuppression(ctx, email) {
  const { agents, storage, users } = ctx
  const plan = storage.planSuppressionCompte(email)
  const nomDe = (e) => users.nomDe(e) || null
  const agentsActifs = agents.lister().filter((a) => a.par === email && a.etat === 'active').length
  const modeles = storage.styles.modeles.lister(email).filter((m) => m.portee === 'perso').length
  return {
    supprimes: plan.supprimes.map((d) => ({ id: d.id, title: d.title, corbeille: d.corbeille })),
    transferes: plan.transferes.map((d) => ({ id: d.id, title: d.title, vers: d.vers, versNom: nomDe(d.vers) })),
    quittes: plan.quittes.map((d) => ({ id: d.id, title: d.title, corbeille: d.corbeille })),
    bloquants: plan.bloquants.map((d) => ({ id: d.id, title: d.title })),
    agents: agentsActifs,
    modeles,
    possible: plan.bloquants.length === 0,
  }
}

const enCours = new Set()

/**
 * Supprime le compte. Lève `ErreurHttp(409)` si un document que la personne
 * porte n'a que des lecteurs ou des correcteurs, ou si une suppression de
 * cette adresse est déjà en route.
 *
 * L'ordre compte :
 *   1. les noms sont retirés des documents conservés **tant que la personne
 *      en est encore membre** (le rattachement des vieux commentaires, au
 *      chargement d'un document, a besoin de la voir) ;
 *   2. les documents qu'elle portait seule sont supprimés (fichiers compris) ;
 *   3. les transferts et les départs s'inscrivent au registre, en une fois ;
 *   4. ses connexions sont coupées, ses agents révoqués, ses données
 *      personnelles effacées de chaque fichier qui en garde ;
 *   5. ses sessions sont révoquées, en dernier : le marqueur est ce qui empêche
 *      un cookie encore valide de rouvrir une session.
 * Une étape qui échoue sur un document conservé est rapportée (`echecs`) mais
 * n'arrête pas le reste : la personne a demandé à partir.
 */
export async function supprimerCompte(ctx, email) {
  const {
    agents,
    metrics,
    presenceAgents,
    rangements,
    registreLimiteurs,
    rooms,
    sessionsRevoquees,
    storage,
    usageIa,
    users,
  } = ctx
  if (enCours.has(email)) throw new ErreurHttp(409, 'une suppression est déjà en cours')
  enCours.add(email)
  try {
    const plan = storage.planSuppressionCompte(email)
    if (plan.bloquants.length) {
      throw new ErreurHttp(
        409,
        `vous portez ${plan.bloquants.length} document(s) que seuls des lecteurs ou correcteurs partagent : confiez-les à un éditeur, ou supprimez-les, avant de supprimer votre compte`
      )
    }

    const id = idCompte(email)
    const nom = users.nomDe(email)
    const prenom = prenomDe(nom, email)
    const etiquettesAgent = [...new Set([`Claude (pour ${prenom})`, `Claude (pour ${prenomDe(null, email)})`])]
    const bilan = {
      documentsSupprimes: 0,
      documentsTransferes: 0,
      documentsQuittes: 0,
      commentaires: 0,
      marques: 0,
      echecs: [],
    }

    // 1. Les noms, dans les documents qui restent.
    for (const d of [...plan.transferes, ...plan.quittes]) {
      try {
        const autres = storage
          .getAccess(d.id)
          .filter((a) => a.email !== email)
          .map((a) => ({ nom: cle(users.nomDe(a.email)), prenom: prenomDe(users.nomDe(a.email), a.email) }))
        const qui = {
          id,
          nom,
          etiquettesAgent,
          nomUnique: !autres.some((a) => a.nom && a.nom === cle(nom)),
          agentUnique: !autres.some((a) => etiquettesAgent.includes(`Claude (pour ${a.prenom})`)),
        }
        const r = await rooms.ecrireDocument(d.id, (doc) => anonymiserDansDocument(doc, qui))
        bilan.commentaires += r.commentaires
        bilan.marques += r.marques
      } catch (err) {
        console.error(`[amend] suppression de compte : noms de ${d.id} non effacés :`, err.message)
        bilan.echecs.push(d.id)
      }
    }

    // 2. Les documents portés seule.
    for (const d of plan.supprimes) {
      if (supprimerDefinitivement(ctx, d.id, email)) bilan.documentsSupprimes++
    }

    // 3. Transferts et départs.
    storage.retirerCompte(email, plan)
    bilan.documentsTransferes = plan.transferes.length
    bilan.documentsQuittes = plan.quittes.length

    // 4. Les connexions, les agents, les données personnelles.
    rooms.expulserPartout(email)
    for (const a of agents.lister()) if (a.par === email) presenceAgents.retirer(a.id)
    agents.retirerPar(email)
    users.supprimer(email)
    rangements.supprimer(email)
    usageIa.oublier(email)
    storage.styles.modeles.supprimerPersonnels(email)
    storage.listeAttente.retirer(email)
    registreLimiteurs.oublier(email)
    oublierAdresse(email)
    metrics.effacer(email)

    // 5. Les sessions.
    sessionsRevoquees.revoquer(email)

    console.log(
      `[amend] compte supprimé : ${bilan.documentsSupprimes} document(s) supprimé(s), ${bilan.documentsTransferes} transféré(s), ${bilan.documentsQuittes} quitté(s)` +
        (bilan.echecs.length ? `, noms non effacés dans ${bilan.echecs.length} document(s)` : '')
    )
    return bilan
  } finally {
    enCours.delete(email)
  }
}
