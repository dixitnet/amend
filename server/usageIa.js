// La consommation d'IA, mois par mois (13/10/2026).
//
// Deux choses sont comptées, et pas de la même façon :
//
//  - les **signes** (espaces compris) envoyés par chaque personne, pour
//    chaque fonction, **uniquement pour les demandes réussies** : une demande
//    qui échoue, une réponse coupée ou un refus de limite ne coûtent rien à
//    la personne ;
//  - les **jetons**, par modèle et par personne, eux comptés **toujours** :
//    l'API les a facturés, qu'on ait pu s'en servir ou non. C'est ce qui donne
//    le coût réel dans le back-office, et le rapport jetons / signes qui
//    permettra de chiffrer les quotas FREE et PRO.
//
// Un fichier `data/usage-ia.json`, une entrée par mois civil (fuseau de
// Paris : la limite « mensuelle » se renouvelle le 1er à minuit en France).
// Les mois de plus de treize mois sont oubliés. Écrit de façon atomique, au
// mieux : une panne d'écriture ne doit pas empêcher de répondre.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ecrireAtomique, lireJson } from './fichiers.js'
import { FONCTIONS } from './reglagesIa.js'

const MOIS_GARDES = 13
const formatMois = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' })

/** « 2026-10 » : le mois civil (heure de Paris) d'un instant. */
export function moisDe(ts) {
  const p = Object.fromEntries(formatMois.formatToParts(new Date(ts)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}`
}

/** Le mois qui suit « AAAA-MM ». */
export function moisSuivant(mois) {
  const [a, m] = mois.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}

/** Dollars par million de jetons (entrée, sortie). Haiku 5.5 : 0,10 / 0,50 ;
 * Sonnet 5.5 : environ 2 / 10 (valeur de travail du 11/10/2026, à vérifier sur
 * la grille d'Anthropic). La lecture de cache coûte un dixième du prix
 * d'entrée, l'écriture de cache 1,25 fois. Ces tarifs ne servent qu'à
 * **estimer** le coût affiché dans le back-office : jamais à décider quoi que
 * ce soit. */
export const TARIFS_USD = {
  'claude-haiku-5-5': { entree: 0.1, sortie: 0.5 },
  'claude-sonnet-5-5': { entree: 2, sortie: 10 },
}

/** Le coût estimé, en dollars, d'une consommation de jetons. */
export function coutUsd(modele, j) {
  const t = TARIFS_USD[modele]
  if (!t || !j) return 0
  const m = 1e6
  return (
    ((j.entree || 0) * t.entree +
      (j.sortie || 0) * t.sortie +
      (j.cacheLu || 0) * t.entree * 0.1 +
      (j.cacheEcrit || 0) * t.entree * 1.25) /
    m
  )
}

const compteurVide = () => ({
  demandes: 0,
  passages: 0,
  signes: 0,
  echecs: 0,
  entree: 0,
  sortie: 0,
  cacheLu: 0,
  cacheEcrit: 0,
  usd: 0,
})
const jetonsVides = () => ({ appels: 0, entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0, usd: 0 })
const entier = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0)

export class UsageIa {
  constructor(dataDir, { maintenant = () => Date.now() } = {}) {
    this.chemin = join(dataDir, 'usage-ia.json')
    this.maintenant = maintenant
    this.mois = this._charger()
  }

  _charger() {
    if (!existsSync(this.chemin)) return {}
    try {
      const brut = lireJson(this.chemin, {})
      return brut && typeof brut === 'object' && brut.mois && typeof brut.mois === 'object' ? brut.mois : {}
    } catch {
      return {}
    }
  }

  _enregistrerSurDisque() {
    const cles = Object.keys(this.mois).sort()
    for (const ancienne of cles.slice(0, Math.max(0, cles.length - MOIS_GARDES))) delete this.mois[ancienne]
    try {
      ecrireAtomique(this.chemin, JSON.stringify({ version: 1, mois: this.mois }, null, 1))
    } catch (err) {
      console.error('[amend] usage IA non enregistré :', err.message)
    }
  }

  /** Les signes envoyés ce mois-ci (ou le mois `mois`) par cette personne pour cette fonction. */
  signesDuMois(email, fonction, mois = moisDe(this.maintenant())) {
    const e = this.mois[mois]?.utilisateurs?.[String(email).toLowerCase()]
    return (e && e[fonction] && e[fonction].signes) || 0
  }

  /**
   * Enregistre une demande terminée. `succes` : la demande a rendu un résultat
   * complet et utilisable — seule condition pour que les signes comptent.
   * `jetons` : ce que l'API a facturé (compté même en cas d'échec).
   */
  enregistrer({ email, fonction, modele, succes, signes = 0, passages = 0, jetons = null }) {
    if (!FONCTIONS.includes(fonction)) throw new Error(`fonction IA inconnue : ${fonction}`)
    const cle = moisDe(this.maintenant())
    const mois = (this.mois[cle] = this.mois[cle] || { utilisateurs: {}, modeles: {} })
    const adresse = String(email).toLowerCase()
    const utilisateur = (mois.utilisateurs[adresse] = mois.utilisateurs[adresse] || {})
    const c = (utilisateur[fonction] = utilisateur[fonction] || compteurVide())
    if (succes) {
      c.demandes += 1
      c.signes += entier(signes)
      c.passages += entier(passages)
    } else {
      c.echecs += 1
    }
    if (jetons) {
      // Les jetons de la personne, pour savoir ce qu'elle coûte vraiment : sans
      // eux, aucun rapport jetons / signes, donc aucun quota FREE ou PRO
      // chiffrable en euros.
      c.entree += entier(jetons.entree)
      c.sortie += entier(jetons.sortie)
      c.cacheLu += entier(jetons.cacheLu)
      c.cacheEcrit += entier(jetons.cacheEcrit)
      c.usd = Math.round((c.usd + coutUsd(modele, jetons)) * 1e6) / 1e6
    }
    if (jetons && modele) {
      const m = (mois.modeles[modele] = mois.modeles[modele] || { ...jetonsVides(), parFonction: {} })
      const f = (m.parFonction[fonction] = m.parFonction[fonction] || jetonsVides())
      for (const cible of [m, f]) {
        cible.appels += 1
        cible.entree += entier(jetons.entree)
        cible.sortie += entier(jetons.sortie)
        cible.cacheLu += entier(jetons.cacheLu)
        cible.cacheEcrit += entier(jetons.cacheEcrit)
        cible.usd = Math.round((cible.usd + coutUsd(modele, jetons)) * 1e6) / 1e6
      }
    }
    this._enregistrerSurDisque()
  }

  /**
   * Un clic sur un bouton de Corrections IA (13/10/2026) : un simple cumul, par
   * mois, de combien de fois chaque bouton a été cliqué — pour savoir dans un
   * mois lesquels servent. Compté à l'arrivée de la demande (avant les
   * contrôles de limite) : on mesure l'intention, pas la réussite ; ce qui est
   * refusé sur place (rien de sélectionné, sélection trop grosse) n'arrive pas
   * jusqu'ici. Anonyme : aucune adresse n'y figure.
   */
  compterBouton(cle) {
    const mois = (this.mois[moisDe(this.maintenant())] ||= { utilisateurs: {}, modeles: {} })
    mois.boutons = mois.boutons || {}
    mois.boutons[cle] = (mois.boutons[cle] || 0) + 1
    this._enregistrerSurDisque()
  }

  /** Les clics par bouton : `{ parMois: { '2026-10': { corriger: 12, … } }, cumul: { corriger: 40, … }, depuis: '2026-10' }`. */
  boutons() {
    const parMois = {}
    const cumul = {}
    for (const [m, v] of Object.entries(this.mois)) {
      if (!v.boutons) continue
      parMois[m] = { ...v.boutons }
      for (const [cle, n] of Object.entries(v.boutons)) cumul[cle] = (cumul[cle] || 0) + n
    }
    return { parMois, cumul, depuis: Object.keys(parMois).sort()[0] || null }
  }

  /** Efface la ligne de cette personne dans tous les mois (suppression de
   * compte). Les totaux par modèle restent : ils ne désignent personne et
   * c'est ce qui fait le coût réel de la clé. Renvoie le nombre de mois
   * où elle figurait. */
  oublier(email) {
    const adresse = String(email).toLowerCase()
    let n = 0
    for (const m of Object.values(this.mois)) {
      if (m && m.utilisateurs && Object.hasOwn(m.utilisateurs, adresse)) {
        delete m.utilisateurs[adresse]
        n++
      }
    }
    if (n) this._enregistrerSurDisque()
    return n
  }

  /** Les mois pour lesquels on a des données, du plus récent au plus ancien. */
  moisDisponibles() {
    return Object.keys(this.mois).sort().reverse()
  }

  /** Le détail d'un mois : une ligne par personne, et les jetons par modèle. */
  detail(mois = moisDe(this.maintenant())) {
    const m = this.mois[mois] || { utilisateurs: {}, modeles: {} }
    const vide = () => Object.fromEntries(FONCTIONS.map((f) => [f, compteurVide()]))
    const utilisateurs = Object.entries(m.utilisateurs).map(([email, u]) => {
      const ligne = { email, ...vide() }
      for (const f of FONCTIONS) if (u[f]) ligne[f] = { ...compteurVide(), ...u[f] }
      return ligne
    })
    return { mois, utilisateurs, modeles: JSON.parse(JSON.stringify(m.modeles)) }
  }
}
