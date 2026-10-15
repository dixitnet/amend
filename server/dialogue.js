// Le dialogue intégré (07/10/2026, claude/conception-dialogue-integre.md).
//
// Une conversation avec Claude, dans l'application, qui a le document sous
// les yeux. Ce n'est pas un second moteur : la boucle d'agent ci-dessous
// appelle l'API Anthropic avec **les mêmes outils que le connecteur**
// (server/mcp.js : plan, lire, chercher, proposer, ajouter, commenter…), les
// exécute en interne avec les droits d'un correcteur, et ne sait donc écrire
// que **en suivi de modifications** ou en commentaire — la personne accepte
// ou refuse, comme pour la proposition d'un collègue.
//
// Ce qui change par rapport au connecteur : c'est la clé Anthropic de
// l'instance qui paie, non l'abonnement de la personne. D'où une limite — une
// seule, **le nombre de signes** : celui de la demande (contrôlé avant l'envoi)
// et celui que Margo lit en route — et, depuis le 13/10/2026, les réglages
// d'instance de Margo (server/reglagesIa.js) : modèle, signes par demande,
// demandes par heure, signes par mois, niveau d'accès. Depuis le 14/10/2026,
// plus de plafond d'étapes ni de jetons, et la consigne est celle du
// connecteur (`instructionsDocument`, server/mcp.js) plus la portée. Les variables
// CLAUDE_DIALOGUE, DIALOGUE_MODEL et DIALOGUE_MESSAGES_PAR_HEURE du .env ne
// sont plus lues.
//
// Le journal `dialogue` dit qui, combien de jetons, quels outils — jamais le
// texte d'un message ni celui d'un document.

import { createHash } from 'node:crypto'
import { ErreurHttp } from './erreurs.js'
import { cleDe, envoyer, fournisseurDe, serviceDe } from './fournisseurs.js'
import { Mcp, COULEUR_AGENT, instructionsDocument } from './mcp.js'
import { blocsDuDocument } from './agentTexte.js'
import { capabilities } from './roles.js'
import { signes } from './quotasIa.js'
import { garde } from './garde-fous.js'

// Aucun seuil ici : les verrous contre l'emballement et les limites du modèle
// (étapes, reprises, simultanés, taille de la conversation, sortie d'un appel,
// marge de lecture, nouvelles tentatives) sont tous dans server/garde-fous.js,
// où l'administrateur les règle. La seule limite de produit est la taille de la
// demande en signes (server/quotasIa.js). Margo n'est informée d'aucun de ces
// seuils ; au-delà du nombre d'étapes, un dernier appel **sans outil** lui fait
// dire ce qui est fait et ce qui reste, au lieu d'une coupure sèche.
const LECTURES = new Set(['lire', 'chercher'])
const ARRETS_INCOMPLETS = new Set(['max_tokens', 'tours', 'erreur'])

/** `detail` : le texte technique, pour le journal du serveur seulement — la
 * personne ne reçoit que `message`, écrit pour elle. */
export class DialogueErreur extends ErreurHttp {
  constructor(status, message, detail = '') {
    super(status, message)
    this.detail = detail
  }
}

/** Ce que l'API Claude a refusé, dit simplement, avec ce que la personne peut
 * y faire. Le crédit épuisé et la clé refusée sont des affaires d'administrateur. */
export function messageApi(status, detail = '', service = 'Claude') {
  if (status === 401 || status === 403)
    return `Margo ne peut pas répondre : la clé d’accès à ${service} configurée sur cette instance est refusée. Prévenez l’administrateur.`
  if (/credit|balance|billing/i.test(detail))
    return `Margo ne peut pas répondre : le crédit du compte ${service} de cette instance est épuisé. Prévenez l’administrateur.`
  if (status === 429)
    return `Le service ${service} reçoit trop de demandes en ce moment. Réessayez dans quelques minutes.`
  if (status >= 500)
    return `Le service ${service} est momentanément indisponible. Réessayez dans quelques minutes ; vos modifications déjà posées restent à relire.`
  return `Le service ${service} a refusé cette demande. Reformulez-la ou choisissez un passage plus court ; si cela se répète, prévenez l’administrateur.`
}

const LIBELLES = {
  plan: () => 'consulte le plan',
  lire: (a) => {
    const de = Number.isInteger(a.de) ? a.de : 1
    const n = Number.isInteger(a.nombre) ? a.nombre : 40
    return `lit les blocs ${de} à ${de + n - 1}`
  },
  chercher: (a) => `cherche « ${String(a.texte || '').slice(0, 40)} »`,
  commentaires: () => 'relit les commentaires',
  proposer: (a) => `prépare ${taille(a.remplacements)} correction(s)`,
  ajouter: (a) => `prépare ${taille(a.ajouts)} ajout(s)`,
  ajouter_note: (a) => `prépare ${taille(a.notes)} note(s)`,
  commenter: (a) => `rédige ${taille(a.commentaires)} commentaire(s)`,
  repondre: () => 'répond à un commentaire',
}
const taille = (x) => (Array.isArray(x) ? x.length : 0)
const libelle = (nom, args) => (LIBELLES[nom] ? LIBELLES[nom](args || {}) : nom)

const COMPTE_MODIFS = new Set(['proposer', 'ajouter', 'ajouter_note'])
const COMPTE_COMMENTAIRES = new Set(['commenter', 'repondre'])

/** La consigne de Margo : la même que celle du connecteur « inviter Claude »
 * (`instructionsDocument`), plus son nom, la portée de la demande et quelques
 * lignes sur la manière de répondre. Rien sur le nombre d'étapes ni sur la façon
 * de lire ou de grouper les appels : c'est l'affaire du modèle, comme pour
 * Claude invité depuis son propre client. La **manière de répondre** (ton,
 * longueur, ce qu'elle dit ou tait) est le texte libre que l'administrateur
 * règle pour l'instance (server/reglagesIa.js, `maniere`). */
export function consigne({ prenom, titre, portee, maniere = '' }) {
  let lieu = 'le document entier'
  if (portee && portee.type === 'section')
    lieu = `la section autour du bloc ${portee.de} (blocs ${portee.de} à ${portee.a})`
  else if (portee && portee.type === 'selection') lieu = `le passage sélectionné (blocs ${portee.de} à ${portee.a})`
  const texteManiere = typeof maniere === 'string' ? maniere.trim() : ''
  return (
    `Tu t’appelles Margo : tu es l’IA d’amend.ink, un éditeur de texte collaboratif avec suivi des modifications (tu t’appuies sur un modèle de langage d’Anthropic, et tu le dis si on te le demande). ` +
    `Tu dialogues avec ${prenom}.\n\n` +
    `${instructionsDocument({ titre, role: 'correcteur', droits: capabilities('correcteur') })}\n\n` +
    `Portée de la demande : ${lieu}. Tu peux lire ailleurs si la question l’exige. ` +
    `Ne propose des modifications que si la personne le demande clairement (« corrige », « harmonise », « propose »…) : une question, un avis, un résumé appellent une réponse, sans toucher au document. ` +
    `Respecte la voix, le style et la typographie de l’auteur. Cite les blocs par leur numéro entre crochets, par exemple [34] : la personne peut cliquer dessus pour s’y rendre.` +
    (texteManiere
      ? `\n\nManière de répondre (réglage de cette instance : elle règle le ton, la longueur et ce que tu dis, pas tes outils ni les règles ci-dessus) :\n${texteManiere}`
      : '')
  )
}

/** Ce que Margo doit faire d'un outil en erreur : la raison est dans le
 * résultat ; elle la traduit pour la personne, qui ne voit pas ces textes. */
const CONDUITE_ERREUR =
  'La personne ne voit pas ce message. Si cela empêche d’aller au bout, dis-lui en une phrase simple ce qui n’a pas marché, pourquoi, et ce qu’elle peut faire (reformuler, choisir un passage plus court, réessayer plus tard).'

const CONSIGNE_COUPURE =
  'Consigne du service : ta réponse précédente a été coupée parce qu’elle était trop longue ; elle a été jetée et aucun des appels qu’elle contenait n’a été exécuté. ' +
  'Refais-les en plus petit : une quinzaine de corrections au plus par appel de `proposer`, et les commentaires dans des étapes à part, après les corrections. Ne répète pas ce que tu as déjà posé.'

const CONSIGNE_BILAN =
  'Consigne du service : cette demande a atteint la limite technique d’étapes, tu ne peux plus appeler d’outil. ' +
  'En deux ou trois phrases, dis ce que tu as déjà fait (les modifications et commentaires posés restent en suivi dans le document) ' +
  'et ce qu’il reste à faire, puis invite la personne à relancer la demande pour la suite, de préférence sur un passage plus court.'

function outilsApi(mcp, acces) {
  const defs = mcp
    ._outilsPour(acces)
    .map(({ name, description, inputSchema }) => ({ name, description, input_schema: inputSchema }))
  if (defs.length) defs[defs.length - 1] = { ...defs[defs.length - 1], cache_control: { type: 'ephemeral' } }
  return defs
}

/** Pose le point de cache sur le dernier bloc du dernier message : à chaque
 * étape de la boucle, tout ce qui précède est relu au dixième du prix. */
function avecCache(messages) {
  const copie = messages.slice()
  const dernier = copie[copie.length - 1]
  const blocs =
    typeof dernier.content === 'string' ? [{ type: 'text', text: dernier.content }] : dernier.content.slice()
  blocs[blocs.length - 1] = { ...blocs[blocs.length - 1], cache_control: { type: 'ephemeral' } }
  copie[copie.length - 1] = { ...dernier, content: blocs }
  return copie
}

export class Dialogue {
  constructor({
    storage,
    rooms,
    quotas,
    estAdmin = () => false,
    metrics = null,
    presence = null,
    fetch: fetcher = null,
    maintenant = () => Date.now(),
    pause = (ms) => new Promise((r) => setTimeout(r, ms)),
  }) {
    this.storage = storage
    this.rooms = rooms
    this.quotas = quotas
    this.metrics = metrics
    this.fetcher = fetcher
    this.maintenant = maintenant
    this.pause = pause
    this.collecteurs = new Map()
    this.enCours = new Set()
    this.reflexion = new Map()
    // Le même moteur que le connecteur, au nom d'un agent qui n'existe que
    // le temps de la conversation : vérifié à chaque appel d'outil (le
    // document existe, la personne a encore accès à Margo).
    const verifierAgent = (agent, stockage) =>
      !!stockage.getDoc(agent.docId) &&
      quotas.acces('margo', { admin: estAdmin(agent.par), role: stockage.roleFor(agent.docId, agent.par) })
    const collecteur = {
      log: (_flux, donnees) => {
        const liste = this.collecteurs.get(donnees.agent)
        if (liste) liste.push(donnees)
      },
    }
    this.mcp = new Mcp({
      agents: { verifier: verifierAgent, noterUsage: () => {} },
      storage,
      rooms,
      metrics: collecteur,
      presence,
      maintenant,
    })
  }

  /** Les contrôles d'avant le flux : tout ce qui se refuse avec un vrai code
   * HTTP. Renvoie la session à passer à `converser`. */
  async preparer({ email, prenom, docId, corps }) {
    const doc = this.storage.getDoc(docId)
    if (!doc) throw new DialogueErreur(404, 'document inconnu')
    const modeleRegle = this.quotas.reglages.de('margo').modele
    if (!cleDe(modeleRegle))
      throw new DialogueErreur(
        501,
        `Margo n’est pas disponible sur cette instance : la clé d’accès à ${serviceDe(modeleRegle)} n’est pas configurée. Prévenez l’administrateur.`
      )
    const messages = Array.isArray(corps && corps.messages) ? corps.messages : null
    if (!messages || !messages.length) throw new DialogueErreur(400, 'aucun message')
    if (messages.length > garde('margoMessages'))
      throw new DialogueErreur(413, 'La conversation est trop longue : commencez-en une nouvelle.')
    let total = 0
    const propres = messages.map((m, i) => {
      const role = m && m.role
      const contenu = m && typeof m.content === 'string' ? m.content.trim() : ''
      if ((role !== 'user' && role !== 'assistant') || !contenu)
        throw new DialogueErreur(400, `message ${i + 1} invalide`)
      total += contenu.length
      return { role, content: contenu }
    })
    if (propres[propres.length - 1].role !== 'user')
      throw new DialogueErreur(400, 'le dernier message doit venir de la personne')
    if (propres[0].role !== 'user') throw new DialogueErreur(400, 'la conversation doit commencer par la personne')
    if (total > garde('margoHistorique'))
      throw new DialogueErreur(413, 'La conversation est trop longue : commencez-en une nouvelle.')
    for (let i = 1; i < propres.length; i++) {
      if (propres[i].role === propres[i - 1].role) throw new DialogueErreur(400, 'les messages doivent alterner')
    }

    const portee = this._portee(corps.portee)
    const id = `dialogue-${createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 10)}-${docId}`
    if (this.enCours.has(id)) throw new DialogueErreur(429, 'Une réponse est déjà en cours pour ce document.')
    if (this.enCours.size >= garde('margoSimultanes'))
      throw new DialogueErreur(429, 'Margo a beaucoup de demandes en ce moment : réessayez dans un instant.')
    // La taille de la demande, en signes (espaces compris) : le message de la
    // personne et le texte de la portée, connus **avant** tout envoi. C'est ce
    // chiffre que le client affiche, que le serveur contrôle et que le compteur
    // mensuel retient si la réponse arrive entière.
    const taille = (await this._taillePortee(docId, portee)) + propres[propres.length - 1].content.length
    const reglages = this.quotas.verifier({ fonction: 'margo', email, taille })

    const agent = { id, docId, nom: 'Margo (IA)', role: 'correcteur', par: email }
    return {
      email,
      prenom,
      docId,
      titre: doc.title || 'sans titre',
      messages: propres,
      portee,
      agent,
      taille,
      modele: reglages.modele,
      signesParDemande: reglages.signesParDemande,
      maniere: reglages.maniere || '',
      acces: { agent, capabilities: capabilities('correcteur') },
    }
  }

  /** Les signes (espaces compris) du texte de la portée : ceux des blocs
   * numérotés qu'elle couvre — tout le document, une section ou une sélection. */
  async _taillePortee(docId, portee) {
    return this.rooms.lireDocument(docId, (ydoc) => {
      let total = 0
      for (const b of blocsDuDocument(ydoc)) {
        if (portee.type !== 'document' && (b.n < portee.de || b.n > portee.a)) continue
        total += b.texte.length
      }
      return total
    })
  }

  _portee(p) {
    if (!p || typeof p !== 'object') return { type: 'document' }
    const entier = (x) => (Number.isInteger(x) && x >= 1 && x <= 1_000_000 ? x : null)
    if (p.type === 'section' || p.type === 'selection') {
      const de = entier(p.de)
      const a = entier(p.a)
      if (de && a && a >= de) return { type: p.type, de, a }
    }
    return { type: 'document' }
  }

  /**
   * La boucle. `emettre(evenement)` écrit une ligne dans le flux ;
   * `annule()` dit si le navigateur a coupé la connexion. Ne lève rien
   * après le début du flux : une erreur devient un événement `erreur`.
   */
  async converser(session, sortie, annule = () => false) {
    const { agent, acces } = session
    // Une réponse est **réussie** si aucune erreur n'a été dite à la personne et
    // que la connexion n'a pas été coupée : seule une réponse réussie compte
    // dans les signes du mois.
    let reussi = true
    const emettre = (evt) => {
      if (evt.type === 'erreur') reussi = false
      sortie(evt)
    }
    let lus = 0
    const plafondLecture = Math.ceil((session.signesParDemande * garde('margoMargeLecture')) / 100)
    this.enCours.add(agent.id)
    this.collecteurs.set(agent.id, [])
    const debut = this.maintenant()
    const modele = session.modele
    const cumul = { entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0, tours: 0 }
    const outils = {}
    let coupures = 0
    let arret = null
    try {
      const messages = session.messages.map((m) => ({ ...m }))
      const systeme = [
        {
          type: 'text',
          text: consigne({
            prenom: session.prenom,
            titre: session.titre,
            portee: session.portee,
            maniere: session.maniere,
          }),
          cache_control: { type: 'ephemeral' },
        },
      ]
      const definitions = outilsApi(this.mcp, acces)

      for (let tour = 1; ; tour++) {
        if (annule()) {
          arret = 'annule'
          break
        }
        // Après `margoEtapes` étapes, un dernier appel **sans outil** : Margo dit
        // ce qui est fait et ce qui reste, au lieu d'être coupée net.
        const bilanFinal = tour > garde('margoEtapes')
        if (bilanFinal) {
          arret = 'tours'
          const dernier = messages[messages.length - 1]
          dernier.content = [
            ...(Array.isArray(dernier.content) ? dernier.content : [{ type: 'text', text: String(dernier.content) }]),
            { type: 'text', text: CONSIGNE_BILAN },
          ]
        }
        const reponse = await this._appel({
          modele,
          systeme,
          definitions,
          messages: avecCache(messages),
          sansOutil: bilanFinal,
        })
        cumul.tours = tour
        const u = reponse.usage || {}
        cumul.entree += u.input_tokens || 0
        cumul.sortie += u.output_tokens || 0
        cumul.cacheLu += u.cache_read_input_tokens || 0
        cumul.cacheEcrit += u.cache_creation_input_tokens || 0
        arret = reponse.stop_reason || null
        // Réponse coupée par le budget de sortie : elle est jetée (ses appels
        // d'outils, tronqués, ne sont pas exécutés) et Margo recommence en plus
        // petit, au lieu d'abandonner la demande à moitié faite.
        if (reponse.stop_reason === 'max_tokens' && !bilanFinal && coupures < garde('margoCoupures')) {
          coupures++
          const dernier = messages[messages.length - 1]
          dernier.content = [
            ...(Array.isArray(dernier.content) ? dernier.content : [{ type: 'text', text: String(dernier.content) }]),
            { type: 'text', text: CONSIGNE_COUPURE },
          ]
          continue
        }
        const blocs = Array.isArray(reponse.content) ? reponse.content : []
        // Les blocs repartent tels quels (la réflexion, s’il y en a, doit
        // être renvoyée intacte avec les résultats d’outils).
        messages.push({ role: 'assistant', content: blocs })
        let ditQuelqueChose = false
        for (const b of blocs) {
          if (b.type === 'text' && b.text && b.text.trim()) {
            emettre({ type: 'texte', texte: b.text })
            ditQuelqueChose = true
          }
        }
        if (bilanFinal) {
          arret = 'tours'
          if (!ditQuelqueChose)
            emettre({
              type: 'erreur',
              message:
                'La demande s’arrête ici : elle demande trop d’étapes pour une seule réponse. Les modifications déjà posées restent à relire dans le panneau ; reformulez la demande plus précisément, ou sur un passage plus court.',
            })
          break
        }
        if (reponse.stop_reason === 'max_tokens') {
          emettre({
            type: 'erreur',
            message:
              'La réponse a été coupée avant la fin parce qu’elle était trop longue. Demandez-lui un passage plus court.',
          })
          break
        }
        const demandes = blocs.filter((b) => b.type === 'tool_use')
        if (!demandes.length) break
        const resultats = []
        for (const d of demandes) {
          if (annule()) break
          emettre({ type: 'outil', nom: d.name, libelle: libelle(d.name, d.input) })
          outils[d.name] = (outils[d.name] || 0) + 1
          let contenu
          let enErreur = false
          try {
            const r = await this.mcp._appeler({ name: d.name, arguments: d.input }, acces)
            contenu = (r.content || []).map((c) => c.text).join('\n')
            enErreur = !!r.isError
            if (enErreur) contenu = `${contenu}\n${CONDUITE_ERREUR}`
            if (LECTURES.has(d.name) && !enErreur) {
              if (lus + contenu.length > plafondLecture) {
                contenu = `Limite de lecture atteinte pour cette demande : l’instance autorise ${signes(session.signesParDemande)} de lecture au plus par demande. Travaille avec ce que tu as déjà lu. Si cela ne suffit pas pour répondre, dis à la personne que la demande dépasse cette limite et qu’elle peut choisir une section ou une sélection plus courte.`
                enErreur = true
              } else {
                lus += contenu.length
              }
            }
          } catch (err) {
            contenu = `L’outil « ${d.name} » n’a pas pu s’exécuter (incident interne du service). Rien n’a été modifié par cet appel. ${CONDUITE_ERREUR}`
            enErreur = true
          }
          emettre({ type: 'outil_fin', nom: d.name, ok: !enErreur })
          resultats.push({
            type: 'tool_result',
            tool_use_id: d.id,
            content: contenu,
            ...(enErreur ? { is_error: true } : {}),
          })
        }
        if (annule()) {
          arret = 'annule'
          break
        }
        messages.push({ role: 'user', content: resultats })
      }
    } catch (err) {
      arret = 'erreur'
      emettre({
        type: 'erreur',
        message:
          err instanceof DialogueErreur
            ? err.message
            : 'Margo n’a pas pu répondre pour le moment. Réessayez dans un instant.',
      })
      if (!(err instanceof DialogueErreur)) console.error('[dialogue]', err && err.message)
      else if (err.detail) console.error('[dialogue]', err.detail)
    } finally {
      const bilan = this._bilan(this.collecteurs.get(agent.id) || [])
      this.collecteurs.delete(agent.id)
      this.enCours.delete(agent.id)
      if (annule()) reussi = false
      // « incomplet » : la demande s'est arrêtée avant d'être menée à bien
      // (coupure, étapes ou lecture épuisées, incident) — l'interface le dit.
      const incomplet = ARRETS_INCOMPLETS.has(arret)
      sortie({ type: 'fin', ...bilan, ...(incomplet ? { incomplet: true } : {}), usage: { ...cumul } })
      try {
        this.quotas.enregistrer({
          email: session.email,
          fonction: 'margo',
          modele,
          succes: reussi,
          signes: session.taille,
          jetons: cumul.tours
            ? { entree: cumul.entree, sortie: cumul.sortie, cacheLu: cumul.cacheLu, cacheEcrit: cumul.cacheEcrit }
            : null,
        })
      } catch (err) {
        console.error('[dialogue] usage non enregistré :', err && err.message)
      }
      if (this.metrics) {
        this.metrics.log('dialogue', {
          email: session.email,
          docId: session.docId,
          modele,
          ...cumul,
          arret,
          outils,
          modifs: bilan.modifications,
          commentaires: bilan.commentaires,
          refus: bilan.refus,
          ms: this.maintenant() - debut,
        })
      }
    }
  }

  _bilan(lignes) {
    let modifications = 0
    let commentaires = 0
    let refus = 0
    for (const l of lignes) {
      if (COMPTE_MODIFS.has(l.outil)) modifications += l.appliques || 0
      if (COMPTE_COMMENTAIRES.has(l.outil)) commentaires += l.appliques || 0
      refus += l.refuses || 0
    }
    return { modifications, commentaires, refus }
  }

  /** Un appel à l’API, avec le repli de réglage de la réflexion (Sonnet 5
   * accepte `disabled`, Sonnet 5.5 veut `between_tools`) mémorisé par modèle,
   * et deux nouvelles tentatives sur 429 / 5xx. */
  async _appel({ modele, systeme, definitions, messages, sansOutil = false }) {
    const fetcher = this.fetcher || globalThis.fetch
    const service = serviceDe(modele)
    const connu = this.reflexion.get(modele)
    // Mistral : la réflexion est coupée d'emblée (`disabled` devient
    // `reasoning_effort: none`, server/fournisseurs.js) ; pas de repli à tenter.
    const chaine = fournisseurDe(modele) === 'mistral' ? ['disabled'] : ['between_tools', 'disabled', null]
    // Le réglage qui a marché d'abord ; les autres seulement s'il est refusé un jour.
    const reglages = connu !== undefined ? [connu, ...chaine.filter((r) => r !== connu)] : chaine
    let derniereErreur = ''
    for (const reglage of reglages) {
      const corps = {
        model: modele,
        max_tokens: garde('sortieMaxJetons'),
        system: systeme,
        tools: definitions,
        messages,
      }
      if (sansOutil) corps.tool_choice = { type: 'none' } // les outils restent déclarés : l'historique en contient
      if (reglage) corps.thinking = { type: reglage }
      for (let essai = 0; ; essai++) {
        let reponse
        try {
          reponse = await envoyer({ corps, fetcher })
        } catch (err) {
          throw new DialogueErreur(
            502,
            `Margo n’arrive pas à joindre le service ${service} (connexion impossible). Réessayez dans quelques minutes.`,
            `joindre : ${err.message}`
          )
        }
        if ((reponse.status === 429 || reponse.status >= 500) && essai < garde('margoRelances')) {
          await this.pause(1000 * (essai + 1) * (essai + 1))
          continue
        }
        let data = null
        try {
          data = await reponse.json()
        } catch {
          data = null
        }
        if (reponse.ok) {
          this.reflexion.set(modele, reglage)
          return data
        }
        derniereErreur = (data && data.error && data.error.message) || ''
        if (reponse.status === 400 && /thinking/i.test(derniereErreur)) break // essayer le réglage suivant
        throw new DialogueErreur(
          502,
          messageApi(reponse.status, derniereErreur, service),
          `API ${reponse.status} : ${derniereErreur}`
        )
      }
    }
    throw new DialogueErreur(502, messageApi(400, derniereErreur, service), `réflexion refusée : ${derniereErreur}`)
  }
}

export { COULEUR_AGENT }
