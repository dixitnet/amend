// Margo, l'IA d'amend.ink, côté serveur (couche application ; étape 8,
// docs/v2-etape-8-plan.md). Une demande d'un éditeur fait tourner la boucle :
// le modèle lit, cherche, propose des corrections et commente, avec quatre
// outils ; tout ce qu'il écrit devient une suggestion signée « margo » dans la
// branche des suggestions (y/hub), ou un fil de commentaires ancré dans le
// texte. Rien n'est écrit directement dans le texte. La conversation n'est pas
// gardée ici : le navigateur renvoie les échanges précédents à chaque demande.
//
//   POST /api/documents/:doc/margo   { demande, corriger?, historique?, selection? }
//
// Réponse en flux (une ligne JSON par événement) : `debut` (les identifiants
// des blocs dans l'ordre de leurs numéros), `etape` (un outil appelé),
// `texte` (ce que dit Margo), `repli` (le modèle a refusé : le modèle par
// défaut reprend la demande), `fin` (bilan en nombres et code d'arrêt).
// Journal : une ligne par demande, en nombres (jamais un mot du document).
import {
  AUTEUR_MARGO,
  GARDE_FOUS_MARGO,
  MARGO_DEMANDE_MAX_SIGNES,
  MARGO_HISTORIQUE_MAX_SIGNES,
  identifiantDocument,
  capacites,
  signes,
  texteNumerote,
  porteeMargo,
  normaliser,
  situerRemplacement,
  situerCitation,
  suiviDesRefus,
  typographier,
} from '../../domaine/index.js'
import { decoder } from './adresse.js'
import { consigne } from '../../i18n/consignes.js'

// BlockNote n'est chargé qu'à la première demande (comme pour l'ancre d'un
// commentaire, `commentaires.js`) : il pèse ~70 Mo, inutiles au serveur tant
// que personne ne parle à Margo (mesure du 11/11/2026 : 117 Mo au démarrage
// avec lui, pour un service plafonné à 200 Mo).
let adaptateur = null
const blocknote = async () => (adaptateur ??= await import('../../adaptateurs/blocknote/serveur.js'))

/** Une lecture rend au plus ce nombre de signes (le reste au prochain appel). */
const LECTURE_MAX_SIGNES = 40_000
/** Résultats d'une recherche, par texte cherché. */
const RECHERCHE_MAX = 20
const HISTORIQUE_MAX = 40

const SCHEMAS = {
  lire: {
    type: 'object',
    properties: { de: { type: 'integer', minimum: 1 }, a: { type: 'integer', minimum: 1 } },
    required: ['de', 'a'],
  },
  chercher: {
    type: 'object',
    properties: { textes: { type: 'array', items: { type: 'string' }, minItems: 1 } },
    required: ['textes'],
  },
  proposer: {
    type: 'object',
    properties: {
      corrections: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: { bloc: { type: 'integer' }, avant: { type: 'string' }, apres: { type: 'string' } },
          required: ['bloc', 'avant', 'apres'],
        },
      },
    },
    required: ['corrections'],
  },
  commenter: {
    type: 'object',
    properties: { bloc: { type: 'integer' }, citation: { type: 'string' }, texte: { type: 'string' } },
    required: ['bloc', 'citation', 'texte'],
  },
}
const OUTILS = Object.keys(SCHEMAS).map((nom) => ({
  nom,
  description: consigne(`outils.${nom}`),
  schema: SCHEMAS[nom],
}))

/** Les blocs numérotés (1, 2, …) dans l'ordre du document. */
const numeroter = (blocs) => blocs.map((b, i) => ({ ...b, n: i + 1 }))
const pourMargo = (b) => ({ n: b.n, texte: b.texte, titre: b.type === 'heading' ? b.niveau : null })

/**
 * @param {object} o
 * @param {(req: any) => Promise<{ id: string, nom: string } | null>} o.personneDe
 * @param {(docId: string, idPersonne: string) => Promise<string | null>} o.roleSur
 * @param {(docId: string) => Promise<{ titre?: string | null } | null>} o.documentDe
 * @param {any} o.ia             l'adaptateur IA (`creerIA`)
 * @param {string | (() => Promise<string>)} o.modele  le modèle de Margo (lu à chaque demande :
 *   le back-office peut le changer)
 * @param {string} o.modeleRepli le modèle qui reprend quand un autre refuse
 * @param {any} o.collaboration  l'accès de notre serveur à y/hub
 * @param {any} o.depot          le dépôt des commentaires
 * @param {(docId: string) => void} [o.prevenirFils] prévient les navigateurs d'un nouveau fil
 * @param {(res: any, statut: number, corps: any) => void} o.json
 * @param {(req: any, max?: number) => Promise<any>} o.lireCorps
 * @param {(ligne: object) => void} [o.journal]
 */
export function creerMargo({
  personneDe,
  roleSur,
  documentDe,
  ia,
  modele: modeleDeMargo,
  modeleRepli,
  collaboration,
  depot,
  prevenirFils = () => {},
  json,
  lireCorps,
  journal = (l) => console.log(`[margo] ${JSON.stringify(l)}`),
}) {
  /** Les personnes dont une demande est en cours : une à la fois par personne
   * (chaque demande relit le texte entier à chaque outil ; audit du 11/11/2026). */
  const enCours = new Set()
  return async function traiter(req, res, url) {
    const m = /^\/api\/documents\/([^/]+)\/margo$/.exec(url.pathname)
    if (!m) return false
    if (req.method !== 'POST') return (json(res, 405, { code: 'methode-refusee' }), true)
    const p = await personneDe(req)
    if (!p) return (json(res, 401, { code: 'session-absente' }), true)
    const brut = decoder(m[1])
    if (brut === null) return (json(res, 400, { code: 'requete-invalide' }), true)
    const doc = identifiantDocument(brut)
    if (!doc.ok) return (json(res, 400, { code: doc.code }), true)
    const docId = doc.id
    const role = await roleSur(docId, p.id)
    if (!role) return (json(res, 404, { code: 'document-introuvable' }), true)
    if (!capacites(role).includes('utiliserMargo')) return (json(res, 403, { code: 'droit-insuffisant' }), true)
    const corps = await lireCorps(req, 200_000)
    const demande = typeof corps.demande === 'string' ? corps.demande.trim() : ''
    const corriger = corps.corriger === true
    if ((!demande && !corriger) || signes(demande) > MARGO_DEMANDE_MAX_SIGNES)
      return (json(res, 400, { code: 'demande-invalide' }), true)
    if (!ia || !collaboration || !depot) return (json(res, 503, { code: 'margo-indisponible' }), true)
    const modele = typeof modeleDeMargo === 'function' ? await modeleDeMargo() : modeleDeMargo
    if (!ia.disponible(modele)) return (json(res, 503, { code: 'margo-indisponible' }), true)

    if (enCours.has(p.id)) return (json(res, 429, { code: 'margo-occupee' }), true)
    enCours.add(p.id)
    try {
      return await repondre()
    } finally {
      enCours.delete(p.id)
    }

    async function repondre() {
      let etat
      try {
        etat = await lireEtat(collaboration, docId)
      } catch {
        return (json(res, 503, { code: 'collaboration-indisponible' }), true)
      }
      const portee = porteeDeLaSelection(corps.selection, etat.blocs)
      if (corriger && portee.type !== 'selection') return (json(res, 400, { code: 'selection-absente' }), true)

      res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' })
      const envoyer = (evenement) => res.write(`${JSON.stringify(evenement)}\n`)
      const abandon = new AbortController()
      res.on('close', () => abandon.abort())
      envoyer({ type: 'debut', blocs: etat.blocs.map((b) => b.id) })

      const titre = (await documentDe(docId).catch(() => null))?.titre || ''
      const premier = premierMessage({
        prenom: p.nom,
        demande: corriger ? consigne('corriger') : demande,
        historique: corps.historique,
        portee,
        blocs: etat.blocs,
      })
      const systeme = consigne('margo', {
        prenom: p.nom,
        titre,
        portee: portee.type,
        de: portee.de ?? 0,
        a: portee.a ?? 0,
      })
      const bilan = { corrections: 0, commentaires: 0, refus: 0 }
      // Les signes lus comptent aussi le passage sélectionné, envoyé d'emblée.
      const signesSelection =
        portee.type === 'selection'
          ? etat.blocs.slice(portee.de - 1, portee.a).reduce((n, b) => n + signes(b.texte), 0)
          : 0
      // Le premier message compte aussi : échanges précédents compris (A2).
      const compte = {
        etapes: 0,
        signesDemande: signes(premier),
        signesLus: signesSelection,
        entree: 0,
        sortie: 0,
        cacheLu: 0,
      }
      const debut = Date.now()
      let modeleEnCours = modele
      let arret = 'fin'
      try {
        const outils = creerOutils({ docId, collaboration, depot, prevenirFils, bilan, compte })
        let conversation = ia.conversation({ modele, consigne: systeme, outils: OUTILS, signal: abandon.signal })
        let entree = { texte: premier }
        const refus = suiviDesRefus()
        let derniereEtape = false
        for (;;) {
          compte.etapes++
          const tour = await conversation.tour(entree)
          compte.entree += tour.jetons.entree
          compte.sortie += tour.jetons.sortie
          compte.cacheLu += tour.jetons.cacheLu
          if (tour.texte.trim()) envoyer({ type: 'texte', texte: tour.texte })
          if (tour.arret === 'refus' && modeleEnCours !== modeleRepli && ia.disponible(modeleRepli)) {
            // Le modèle refuse : le modèle par défaut reprend la demande depuis
            // le début (ce qui est déjà posé reste posé).
            modeleEnCours = modeleRepli
            envoyer({ type: 'repli' })
            conversation = ia.conversation({
              modele: modeleRepli,
              consigne: systeme,
              outils: OUTILS,
              signal: abandon.signal,
            })
            entree = { texte: premier }
            continue
          }
          if (tour.arret !== 'outils' || derniereEtape) {
            if (!derniereEtape) arret = tour.arret
            break
          }
          const resultats = []
          let ecrituresAcceptees = null
          for (const appel of tour.appels) {
            envoyer({ type: 'etape', outil: SCHEMAS[appel.nom] ? appel.nom : 'inconnu' })
            const r = await outils.executer(appel.nom, appel.entree)
            if (r.ecriture) ecrituresAcceptees = (ecrituresAcceptees ?? false) || r.acceptee
            resultats.push({ id: appel.id, contenu: r.contenu, erreur: r.erreur === true })
          }
          entree = { resultats }
          if (ecrituresAcceptees !== null) {
            const suite = refus.noter(ecrituresAcceptees)
            if (suite === 'avertir')
              entree.texte = consigne('service.refusEnSerie', { n: GARDE_FOUS_MARGO.refusEnSerie })
            if (suite === 'arreter') {
              entree.texte = consigne('service.bilanRefus')
              arret = 'refus-en-serie'
              derniereEtape = true
            }
          }
          if (!derniereEtape && compte.etapes >= GARDE_FOUS_MARGO.etapes) {
            entree.texte = consigne('service.bilanEtapes')
            arret = 'etapes'
            derniereEtape = true
          }
        }
      } catch (err) {
        arret = err.code === 'ia-annulee' || abandon.signal.aborted ? 'annulee' : 'erreur'
        if (arret === 'erreur') console.error('[margo] demande interrompue :', err.code ?? err.message)
      }
      if (!abandon.signal.aborted) {
        envoyer({ type: 'fin', arret, ...bilan })
        res.end()
      }
      journal({
        document: docId,
        modele: modeleEnCours,
        corriger,
        portee: portee.type,
        arret,
        ...bilan,
        ...compte,
        duree: Date.now() - debut,
      })
      return true
    }
  }
}

async function lireEtat(collaboration, docId) {
  const [texte, suggestions] = await Promise.all([collaboration.lireTexte(docId), collaboration.lireSuggestions(docId)])
  const { blocsATexteDe } = await blocknote()
  return { texte, suggestions, blocs: numeroter(blocsATexteDe(texte, suggestions)) }
}

/** La sélection envoyée par le navigateur (identifiants du premier et du
 * dernier bloc), en numéros ; sinon tout le texte. */
function porteeDeLaSelection(selection, blocs) {
  const n = (id) => blocs.find((b) => b.id === id)?.n
  return porteeMargo(
    { type: selection ? 'selection' : 'document', de: n(selection?.de), a: n(selection?.a) },
    blocs.length,
  )
}

/** Le premier message : les échanges précédents (renvoyés par le navigateur),
 * le passage sélectionné, puis la demande. */
function premierMessage({ prenom, demande, historique, portee, blocs }) {
  const parties = []
  // Les échanges précédents, des plus récents aux plus anciens, tant qu'ils
  // tiennent dans la borne en signes (audit du 10/11/2026, A2).
  const echanges = []
  let total = 0
  for (const e of (Array.isArray(historique) ? historique : []).slice(-HISTORIQUE_MAX).reverse()) {
    if (!e || typeof e.texte !== 'string' || (e.auteur !== 'personne' && e.auteur !== 'margo')) continue
    total += signes(e.texte)
    if (total > MARGO_HISTORIQUE_MAX_SIGNES) break
    echanges.unshift(consigne(e.auteur === 'margo' ? 'demande.margo' : 'demande.personne', { prenom, texte: e.texte }))
  }
  if (echanges.length) parties.push(consigne('demande.historique', { echanges: echanges.join('\n') }))
  if (portee.type === 'selection')
    parties.push(
      consigne('demande.selection', {
        texte: texteNumerote(blocs.slice(portee.de - 1, portee.a).map(pourMargo)),
      }),
    )
  parties.push(consigne('demande.texte', { prenom, texte: demande }))
  return parties.join('\n\n')
}

/** Les quatre outils de Margo, sur un document. Chaque exécution rend
 * `{ contenu, erreur?, ecriture?, acceptee? }`. */
function creerOutils({ docId, collaboration, depot, prevenirFils, bilan, compte }) {
  const entier = (v) => Number.isSafeInteger(v)
  const parametres = (nom) => ({
    contenu: consigne('outils.parametres', { attendu: JSON.stringify(SCHEMAS[nom]) }),
    erreur: true,
  })

  async function lire({ de, a }) {
    if (!entier(de) || !entier(a)) return parametres('lire')
    const { blocs } = await lireEtat(collaboration, docId)
    const choisis = []
    let total = 0
    for (const b of blocs.slice(Math.max(0, de - 1), Math.max(0, a))) {
      if (choisis.length && total + signes(b.texte) > LECTURE_MAX_SIGNES) break
      choisis.push(b)
      total += signes(b.texte)
    }
    if (!choisis.length) return { contenu: consigne('outils.aucun') }
    compte.signesLus += total
    let contenu = texteNumerote(choisis.map(pourMargo))
    const dernier = choisis[choisis.length - 1].n
    if (dernier < Math.min(a, blocs.length))
      contenu += `\n${consigne('outils.suite', { dernier, suivant: dernier + 1 })}`
    return { contenu }
  }

  async function chercher({ textes }) {
    if (!Array.isArray(textes) || !textes.length || !textes.every((t) => typeof t === 'string'))
      return parametres('chercher')
    const { blocs } = await lireEtat(collaboration, docId)
    const parties = []
    for (const t of textes.slice(0, 20)) {
      const motif = normaliser(t).toLocaleLowerCase('fr')
      const trouves = motif
        ? blocs.filter((b) => normaliser(b.texte).toLocaleLowerCase('fr').includes(motif)).slice(0, RECHERCHE_MAX)
        : []
      for (const b of trouves) compte.signesLus += signes(b.texte)
      parties.push(`« ${t} » :\n${trouves.length ? texteNumerote(trouves.map(pourMargo)) : consigne('outils.aucun')}`)
    }
    return { contenu: parties.join('\n\n') }
  }

  async function proposer({ corrections }) {
    if (!Array.isArray(corrections) || !corrections.length) return parametres('proposer')
    const etat = await lireEtat(collaboration, docId)
    const motifs = []
    const aPoser = []
    const plages = new Map()
    for (const c of corrections) {
      const bloc = entier(c?.bloc) ? etat.blocs[c.bloc - 1] : null
      if (!bloc || typeof c.avant !== 'string' || typeof c.apres !== 'string') {
        motifs.push(bloc ? 'vide' : 'bloc')
        continue
      }
      const r = situerRemplacement(bloc.texte, c.avant, c.apres)
      if (!r.ok) {
        motifs.push(r.motif)
        continue
      }
      const deja = plages.get(bloc.id) ?? []
      if (deja.some((p) => r.debut < p.fin && p.debut < r.fin)) {
        motifs.push('chevauche')
        continue
      }
      deja.push(r)
      plages.set(bloc.id, deja)
      motifs.push(aPoser.length)
      aPoser.push({ blocId: bloc.id, debut: r.debut, fin: r.fin, apres: r.apres })
    }
    let poses = []
    if (aPoser.length) {
      const { suggererRemplacements } = await blocknote()
      const { resultats, mise } = suggererRemplacements(etat.texte, etat.suggestions, aPoser)
      if (mise) await collaboration.ecrireSuggestions(docId, mise)
      poses = resultats
    }
    const lignes = motifs.map((m, i) => {
      const code = typeof m === 'number' ? poses[m] : m
      return `${i + 1}. ${consigne(`refus.${code}`)}`
    })
    const nombre = motifs.filter((m) => typeof m === 'number' && poses[m] === 'posee').length
    bilan.corrections += nombre
    bilan.refus += corrections.length - nombre
    return { contenu: lignes.join('\n'), ecriture: true, acceptee: nombre > 0 }
  }

  async function commenter({ bloc, citation, texte }) {
    if (!entier(bloc) || typeof citation !== 'string' || typeof texte !== 'string' || !texte.trim())
      return parametres('commenter')
    const etat = await lireEtat(collaboration, docId)
    const vise = etat.blocs[bloc - 1]
    const refuser = (code) => (bilan.refus++, { contenu: consigne(`refus.${code}`), ecriture: true, acceptee: false })
    if (!vise) return refuser('bloc')
    // L'ancre se pose dans le texte principal, sans les suggestions en cours.
    const { blocsATexteDe, ancreCommentaire } = await blocknote()
    const principal = blocsATexteDe(etat.texte).find((b) => b.id === vise.id)
    if (!principal) return refuser('ancre')
    const ou = situerCitation(principal.texte, citation)
    if (!ou.ok) return refuser(ou.motif)
    const fil = await depot.creerFil(
      docId,
      AUTEUR_MARGO,
      [{ type: 'paragraph', content: typographier(texte.trim().normalize('NFC')) }],
      null,
    )
    const ancre = ancreCommentaire(etat.texte, {
      debut: { blocId: vise.id, decalage: ou.debut },
      fin: { blocId: vise.id, decalage: ou.fin },
      citation: principal.texte.slice(ou.debut, ou.fin),
      fil: fil.id,
    })
    if (ancre.code !== 'ok') {
      await depot.supprimerFil(fil.id)
      return refuser('ancre')
    }
    try {
      await collaboration.ecrireTexte(docId, ancre.mise, AUTEUR_MARGO)
    } catch (err) {
      // Pas de fil sans ancre (audit du 10/11/2026, A3).
      await depot.supprimerFil(fil.id).catch(() => {})
      throw err
    }
    prevenirFils(docId)
    bilan.commentaires++
    return { contenu: consigne('refus.posee'), ecriture: true, acceptee: true }
  }

  const ACTIONS = { lire, chercher, proposer, commenter }
  return {
    async executer(nom, entree) {
      const action = ACTIONS[nom]
      if (!action) return { contenu: consigne('outils.inconnu'), erreur: true }
      try {
        return await action(entree ?? {})
      } catch (err) {
        if (err.code === 'collaboration-indisponible' || err.code === 'document-illisible')
          return { contenu: consigne('outils.indisponible'), erreur: true }
        throw err
      }
    },
  }
}
