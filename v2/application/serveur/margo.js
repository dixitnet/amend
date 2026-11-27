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
  compter as compterTextes,
  avecAppels,
  sansAtomes,
  sansAppels,
  porteUnAppel,
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
/** Textes comptés en un appel de `compter`. */
const COMPTAGE_MAX = 20
/** Résultats d'une recherche, par texte cherché. */
const RECHERCHE_MAX = 20
const HISTORIQUE_MAX = 40

/** Les outils sur un document, les mêmes pour Margo et pour le connecteur Claude (Sylvain, 25/11/2026 :
 * « les outils de Margo et du connecteur Claude doivent être identiques ») : le connecteur y ajoute
 * seulement le document visé, et la liste des documents de la personne. */
export const SCHEMAS = {
  plan: { type: 'object', properties: {} },
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
  compter: {
    type: 'object',
    properties: {
      de: { type: 'integer', minimum: 1 },
      a: { type: 'integer', minimum: 1 },
      textes: { type: 'array', items: { type: 'string' }, minItems: 1 },
      notes: { type: 'boolean' },
    },
  },
  proposer: {
    type: 'object',
    properties: {
      corrections: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            bloc: { type: 'integer' },
            note: { type: 'integer' },
            avant: { type: 'string' },
            apres: { type: 'string' },
          },
          required: ['avant', 'apres'],
        },
      },
    },
    required: ['corrections'],
  },
  ajouter_note: {
    type: 'object',
    properties: {
      notes: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: { bloc: { type: 'integer' }, passage: { type: 'string' }, texte: { type: 'string' } },
          required: ['bloc', 'passage', 'texte'],
        },
      },
    },
    required: ['notes'],
  },
  supprimer: {
    type: 'object',
    properties: { notes: { type: 'array', minItems: 1, items: { type: 'integer', minimum: 1 } } },
    required: ['notes'],
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
// Les notes de bas de page aussi, dans l'ordre du texte, comme à l'écran (27/11/2026).
const numeroter = (blocs) => {
  let k = 0
  return blocs.map((b, i) => ({ ...b, n: i + 1, notes: (b.notes ?? []).map((note) => ({ ...note, k: ++k })) }))
}
/** Un bloc tel qu'il est montré : ses appels de note en repères « ⟦k⟧ », ses notes dessous. */
const pourMargo = (b) => ({
  n: b.n,
  texte: avecAppels(b.texte, b.notes),
  titre: b.type === 'heading' ? b.niveau : null,
  notes: b.notes,
})
/** Ce qui se compte d'un bloc : son texte, sans le signe qui tient la place d'un appel de note. */
const texteNu = (b) => sansAtomes(b.texte)
/** Les signes envoyés au modèle pour un bloc : son texte et ses notes. */
const signesMontres = (b) => signes(texteNu(b)) + (b.notes ?? []).reduce((n, note) => n + signes(note.texte), 0)

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
      // La taille du passage sélectionné : dite à Margo, et comptée parmi les signes lus (il est envoyé d'emblée).
      const signesSelection =
        portee.type === 'selection' ? compterTextes(etat.blocs.slice(portee.de - 1, portee.a).map(texteNu)).signes : 0
      const systeme = consigne('margo', {
        prenom: p.nom,
        titre,
        portee: portee.type,
        de: portee.de ?? 0,
        a: portee.a ?? 0,
        // Les tailles, données d'emblée (25/11/2026) : Margo ne sait pas compter seule.
        blocs: etat.blocs.length,
        signes: compterTextes(etat.blocs.map(texteNu)).signes,
        signesSelection,
      })
      const bilan = { corrections: 0, commentaires: 0, refus: 0 }
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

export async function lireEtat(collaboration, docId, auteur = AUTEUR_MARGO) {
  const [texte, suggestions] = await Promise.all([
    collaboration.lireTexte(docId),
    collaboration.lireSuggestions(docId, auteur),
  ])
  const { blocsATexteDe } = await blocknote()
  return { texte, suggestions, blocs: numeroter(blocsATexteDe(texte, suggestions)) }
}

/** La sélection envoyée par le navigateur (identifiants du premier et du
 * dernier bloc), en numéros ; sinon tout le texte. */
function porteeDeLaSelection(selection, blocs) {
  // Un tableau sélectionné : de sa première à sa dernière cellule (leurs identifiants commencent par le sien).
  const duBloc = (id) => blocs.filter((b) => b.id === id || b.id.startsWith(`${id}/`))
  return porteeMargo(
    { type: selection ? 'selection' : 'document', de: duBloc(selection?.de)[0]?.n, a: duBloc(selection?.a).at(-1)?.n },
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

/** Les outils de Margo, sur un document. Chaque exécution rend
 * `{ contenu, erreur?, ecriture?, acceptee? }`. `auteur` signe les suggestions
 * et les commentaires (Margo, ou Claude par le connecteur du back-office). */
export function creerOutils({ docId, collaboration, depot, prevenirFils, bilan, compte, auteur = AUTEUR_MARGO }) {
  const entier = (v) => Number.isSafeInteger(v)
  const parametres = (nom) => ({
    contenu: consigne('outils.parametres', { attendu: JSON.stringify(SCHEMAS[nom]) }),
    erreur: true,
  })

  async function lire({ de, a }) {
    // Le schéma annonce des numéros à partir de 1, dans l'ordre (audit du 16/11/2026).
    if (!entier(de) || !entier(a) || de < 1 || a < de) return parametres('lire')
    const { blocs } = await lireEtat(collaboration, docId, auteur)
    const choisis = []
    let total = 0
    for (const b of blocs.slice(Math.max(0, de - 1), Math.max(0, a))) {
      if (choisis.length && total + signesMontres(b) > LECTURE_MAX_SIGNES) break
      choisis.push(b)
      total += signesMontres(b)
    }
    if (!choisis.length) return { contenu: consigne('outils.aucun') }
    compte.signesLus += total
    const dernier = choisis[choisis.length - 1].n
    // En tête, la taille de ce qui est rendu : Margo ne sait pas compter seule (25/11/2026).
    // La taille annoncée est celle du texte, sans les notes (comme le compteur du bandeau).
    const signesDuTexte = compterTextes(choisis.map(texteNu)).signes
    let contenu = `${consigne('outils.lu', { de: choisis[0].n, a: dernier, signes: signesDuTexte })}\n${texteNumerote(choisis.map(pourMargo))}`
    if (dernier < Math.min(a, blocs.length))
      contenu += `\n${consigne('outils.suite', { dernier, suivant: dernier + 1 })}`
    return { contenu }
  }

  /** Le plan : la taille du document, et ses titres avec leur numéro de bloc. */
  async function plan() {
    const { blocs } = await lireEtat(collaboration, docId, auteur)
    const { signes: total, mots } = compterTextes(blocs.map(texteNu))
    return {
      contenu: [
        consigne('outils.planEntete', { blocs: blocs.length, signes: total, mots }),
        ...blocs
          .filter((b) => b.type === 'heading')
          .map((b) => `${'  '.repeat(Math.max(0, (b.niveau ?? 1) - 1))}[${b.n}] ${texteNu(b)}`),
      ].join('\n'),
    }
  }

  /** Le compte exact, en signes (espaces compris) et en mots : d'une plage de blocs, sans la lire, ou de
   * textes donnés (une reformulation à vérifier avant de la proposer). */
  async function compter({ de, a, textes, notes }) {
    const plage = de !== undefined || a !== undefined
    const donnes = textes !== undefined
    if (!plage && !donnes) return parametres('compter')
    if (plage && (!entier(de) || !entier(a) || de < 1 || a < de)) return parametres('compter')
    if (donnes && (!Array.isArray(textes) || !textes.length || !textes.every((t) => typeof t === 'string')))
      return parametres('compter')
    if (notes !== undefined && typeof notes !== 'boolean') return parametres('compter')
    const lignes = []
    if (plage) {
      const { blocs } = await lireEtat(collaboration, docId, auteur)
      const choisis = blocs.slice(de - 1, a)
      if (!choisis.length) return { contenu: consigne('outils.aucun') }
      // Le texte seul, comme le compteur du bandeau ; avec `notes`, le texte des notes en plus.
      const c = compterTextes(choisis.map(texteNu))
      lignes.push(consigne('outils.compte', { de: choisis[0].n, a: choisis.at(-1).n, signes: c.signes, mots: c.mots }))
      if (notes) {
        const desNotes = choisis.flatMap((b) => b.notes.map((note) => note.texte))
        const n = compterTextes(desNotes)
        lignes.push(
          consigne('outils.compteNotes', {
            notes: desNotes.length,
            signes: n.signes,
            mots: n.mots,
            total: c.signes + n.signes,
          }),
        )
      }
    }
    if (donnes) {
      textes.slice(0, COMPTAGE_MAX).forEach((t, i) => {
        const c = compterTextes([t])
        lignes.push(consigne('outils.compteTexte', { n: i + 1, signes: c.signes, mots: c.mots }))
      })
      if (textes.length > COMPTAGE_MAX) lignes.push(consigne('outils.compteSuite', { max: COMPTAGE_MAX }))
    }
    return { contenu: lignes.join('\n') }
  }

  async function chercher({ textes }) {
    if (!Array.isArray(textes) || !textes.length || !textes.every((t) => typeof t === 'string'))
      return parametres('chercher')
    const { blocs } = await lireEtat(collaboration, docId, auteur)
    const parties = []
    for (const t of textes.slice(0, 20)) {
      const motif = normaliser(t).toLocaleLowerCase('fr')
      const trouves = motif
        ? blocs
            .filter((b) =>
              // Dans le texte du bloc, ou dans celui d'une de ses notes (27/11/2026).
              [texteNu(b), ...b.notes.map((note) => note.texte)].some((t2) =>
                normaliser(t2).toLocaleLowerCase('fr').includes(motif),
              ),
            )
            .slice(0, RECHERCHE_MAX)
        : []
      for (const b of trouves) compte.signesLus += signesMontres(b)
      parties.push(`« ${t} » :\n${trouves.length ? texteNumerote(trouves.map(pourMargo)) : consigne('outils.aucun')}`)
    }
    return { contenu: parties.join('\n\n') }
  }

  /** Les notes de bas de page du document, par numéro : leur bloc et leur place dans son texte. */
  const notesDe = (blocs) => new Map(blocs.flatMap((b) => b.notes.map((note) => [note.k, { ...note, bloc: b }])))

  /** Le compte rendu d'une écriture : une ligne par demande (« posée », ou le motif du refus), et le bilan. */
  function rendre(motifs, poses) {
    const lignes = motifs.map((m, i) => `${i + 1}. ${consigne(`refus.${typeof m === 'number' ? poses[m] : m}`)}`)
    const nombre = motifs.filter((m) => typeof m === 'number' && poses[m] === 'posee').length
    bilan.corrections += nombre
    bilan.refus += motifs.length - nombre
    return { contenu: lignes.join('\n'), ecriture: true, acceptee: nombre > 0 }
  }

  async function proposer({ corrections }) {
    if (!Array.isArray(corrections) || !corrections.length) return parametres('proposer')
    const etat = await lireEtat(collaboration, docId, auteur)
    const notes = notesDe(etat.blocs)
    const motifs = []
    // Les corrections du texte, puis celles du texte d'une note : deux écritures, un seul compte rendu.
    const aPoser = []
    const notesAPoser = []
    const plages = new Map()
    const notesVues = new Set()
    for (const c of corrections) {
      if (typeof c?.avant !== 'string' || typeof c?.apres !== 'string') {
        motifs.push('vide')
        continue
      }
      // Un appel de note recopié dans le nouveau texte s'écrirait tel quel dans le livre.
      if (porteUnAppel(c.apres)) {
        motifs.push('appel')
        continue
      }
      if (c.note !== undefined) {
        // Le texte d'une note : la note entière est remplacée (27/11/2026).
        const note = entier(c.note) ? notes.get(c.note) : null
        if (!note) {
          motifs.push('note')
          continue
        }
        const r = situerRemplacement(note.texte, c.avant, c.apres)
        if (!r.ok) {
          motifs.push(r.motif)
          continue
        }
        if (notesVues.has(note.k)) {
          motifs.push('chevauche')
          continue
        }
        notesVues.add(note.k)
        motifs.push({ note: notesAPoser.length })
        notesAPoser.push({
          op: 'remplacer',
          blocId: note.bloc.id,
          decalage: note.i,
          texte: note.texte.slice(0, r.debut) + r.apres + note.texte.slice(r.fin),
        })
        continue
      }
      const bloc = entier(c.bloc) ? etat.blocs[c.bloc - 1] : null
      if (!bloc) {
        motifs.push('bloc')
        continue
      }
      const r = situerRemplacement(bloc.texte, sansAppels(c.avant), c.apres)
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
    const { suggererRemplacements, suggererNotes } = await blocknote()
    // Les notes d'abord : remplacer une note laisse son appel à la même place, le texte des blocs ne bouge
    // pas, et les corrections du texte, situées avant, restent justes dans l'état relu.
    let notesPosees = []
    let suggestions = etat.suggestions
    if (notesAPoser.length) {
      const { resultats, mise } = suggererNotes(etat.texte, suggestions, notesAPoser)
      if (mise) await collaboration.ecrireSuggestions(docId, mise, auteur)
      notesPosees = resultats
      if (aPoser.length) suggestions = (await lireEtat(collaboration, docId, auteur)).suggestions
    }
    let poses = []
    if (aPoser.length) {
      const { resultats, mise } = suggererRemplacements(etat.texte, suggestions, aPoser)
      if (mise) await collaboration.ecrireSuggestions(docId, mise, auteur)
      poses = resultats
    }
    // Un seul tableau de résultats, dans l'ordre des demandes.
    const tous = [...poses, ...notesPosees]
    return rendre(
      motifs.map((m) => (typeof m === 'object' ? poses.length + m.note : m)),
      tous,
    )
  }

  async function ajouter_note({ notes: demandees }) {
    if (!Array.isArray(demandees) || !demandees.length) return parametres('ajouter_note')
    const etat = await lireEtat(collaboration, docId, auteur)
    const motifs = []
    const aPoser = []
    for (const d of demandees) {
      const bloc = entier(d?.bloc) ? etat.blocs[d.bloc - 1] : null
      if (!bloc) {
        motifs.push('bloc')
        continue
      }
      const texte = typeof d.texte === 'string' ? typographier(d.texte.trim().normalize('NFC')) : ''
      if (!texte || typeof d.passage !== 'string') {
        motifs.push('vide')
        continue
      }
      if (porteUnAppel(texte)) {
        motifs.push('appel')
        continue
      }
      const ou = situerCitation(bloc.texte, sansAppels(d.passage))
      if (!ou.ok) {
        motifs.push(ou.motif)
        continue
      }
      motifs.push(aPoser.length)
      aPoser.push({ op: 'ajouter', blocId: bloc.id, decalage: ou.fin, texte })
    }
    let poses = []
    if (aPoser.length) {
      const { suggererNotes } = await blocknote()
      const { resultats, mise } = suggererNotes(etat.texte, etat.suggestions, aPoser)
      if (mise) await collaboration.ecrireSuggestions(docId, mise, auteur)
      poses = resultats
    }
    return rendre(motifs, poses)
  }

  /** Propose de supprimer des notes de bas de page, par leur numéro. */
  async function supprimer({ notes: numeros }) {
    if (!Array.isArray(numeros) || !numeros.length) return parametres('supprimer')
    const etat = await lireEtat(collaboration, docId, auteur)
    const notes = notesDe(etat.blocs)
    const motifs = []
    const aPoser = []
    const vues = new Set()
    for (const k of numeros) {
      const note = entier(k) ? notes.get(k) : null
      if (!note) {
        motifs.push('note')
        continue
      }
      if (vues.has(k)) {
        motifs.push('chevauche')
        continue
      }
      vues.add(k)
      motifs.push(aPoser.length)
      aPoser.push({ op: 'supprimer', blocId: note.bloc.id, decalage: note.i })
    }
    let poses = []
    if (aPoser.length) {
      const { suggererNotes } = await blocknote()
      const { resultats, mise } = suggererNotes(etat.texte, etat.suggestions, aPoser)
      if (mise) await collaboration.ecrireSuggestions(docId, mise, auteur)
      poses = resultats
    }
    return rendre(motifs, poses)
  }

  async function commenter({ bloc, citation, texte }) {
    if (!entier(bloc) || typeof citation !== 'string' || typeof texte !== 'string' || !texte.trim())
      return parametres('commenter')
    const etat = await lireEtat(collaboration, docId, auteur)
    const vise = etat.blocs[bloc - 1]
    const refuser = (code) => (bilan.refus++, { contenu: consigne(`refus.${code}`), ecriture: true, acceptee: false })
    if (!vise) return refuser('bloc')
    // L'ancre se pose dans le texte principal, sans les suggestions en cours.
    const { blocsATexteDe, ancreCommentaire } = await blocknote()
    const principal = blocsATexteDe(etat.texte).find((b) => b.id === vise.id)
    if (!principal) return refuser('ancre')
    const ou = situerCitation(principal.texte, sansAppels(citation))
    if (!ou.ok) return refuser(ou.motif)
    const fil = await depot.creerFil(
      docId,
      auteur,
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
      await collaboration.ecrireTexte(docId, ancre.mise, auteur)
    } catch (err) {
      // Pas de fil sans ancre (audit du 10/11/2026, A3).
      await depot.supprimerFil(fil.id).catch(() => {})
      throw err
    }
    prevenirFils(docId)
    bilan.commentaires++
    return { contenu: consigne('refus.posee'), ecriture: true, acceptee: true }
  }

  const ACTIONS = { plan, lire, chercher, compter, proposer, ajouter_note, supprimer, commenter }
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
