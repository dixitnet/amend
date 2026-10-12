// Les réglages de l'IA, à l'échelle de l'instance (13/10/2026, refonte « à
// zéro » des limites d'usage ; claude/tarifs-amend.md).
//
// Deux fonctions, réglées chacune de son côté :
//   - `corrections` : « Corrections IA », le panneau de la barre latérale
//     (Haiku par défaut) ;
//   - `margo`       : Margo, la fenêtre de dialogue flottante (Sonnet par défaut).
//
// Pour chacune : le modèle, le nombre de signes envoyés au plus par demande,
// le nombre de demandes au plus par heure, le nombre de signes envoyés au plus
// par mois et par personne, et le niveau minimal d'accès. **Tout se compte en
// signes, espaces compris** — jamais en pages.
//
// Un fichier `data/reglages-ia.json`, modifié depuis le back-office. Ces
// réglages remplacent les variables AI_MODEL, DIALOGUE_MODEL,
// AI_SUGGESTIONS_PAR_HEURE, AI_SUGGESTIONS_PAR_JOUR, DIALOGUE_MESSAGES_PAR_HEURE
// et CLAUDE_DIALOGUE du .env, qui ne sont plus lues.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ErreurHttp } from './erreurs.js'
import { ecrireAtomique, lireJson } from './fichiers.js'

export const FONCTIONS = ['corrections', 'margo']
export const NOMS_FONCTION = { corrections: 'Corrections IA', margo: 'Margo' }

/** Les seuls modèles proposés (décision du 13/10/2026). */
export const MODELES = [
  { id: 'claude-haiku-5-5', nom: 'Haiku 5.5' },
  { id: 'claude-sonnet-5-5', nom: 'Sonnet 5.5' },
]

/** Niveaux d'accès, du plus fermé au plus ouvert. Le niveau est un **minimum** :
 * `editeur` ouvre aux éditeurs du document et aux administrateurs ;
 * `correcteur` y ajoute les correcteurs ; `admin` ne laisse que les
 * administrateurs de l'instance. Un lecteur n'y a jamais accès. */
export const NIVEAUX = ['admin', 'editeur', 'correcteur']

/** Bornes de chaque nombre (entiers, au moins 1 : pas de « 0 = illimité »). */
export const BORNES = {
  signesParDemande: { min: 100, max: 5_000_000 },
  demandesParHeure: { min: 1, max: 100_000 },
  signesParMois: { min: 1_000, max: 1_000_000_000 },
}

export const DEFAUTS = Object.freeze({
  corrections: Object.freeze({
    modele: 'claude-haiku-5-5',
    signesParDemande: 30_000,
    demandesParHeure: 100,
    signesParMois: 500_000,
    acces: 'editeur',
  }),
  margo: Object.freeze({
    modele: 'claude-sonnet-5-5',
    signesParDemande: 60_000,
    demandesParHeure: 30,
    signesParMois: 300_000,
    acces: 'editeur',
  }),
})

const CHAMPS_NOMBRE = Object.keys(BORNES)

/** Une valeur lue du disque rendue sûre : ce qui ne convient pas retombe sur
 * le défaut, champ par champ. */
function assainir(brut, defauts) {
  const r = { ...defauts }
  if (!brut || typeof brut !== 'object') return r
  if (MODELES.some((m) => m.id === brut.modele)) r.modele = brut.modele
  if (NIVEAUX.includes(brut.acces)) r.acces = brut.acces
  for (const champ of CHAMPS_NOMBRE) {
    const v = brut[champ]
    const { min, max } = BORNES[champ]
    if (Number.isInteger(v) && v >= min && v <= max) r[champ] = v
  }
  return r
}

const LIBELLES_CHAMP = {
  modele: 'le modèle',
  acces: 'le niveau d’accès',
  signesParDemande: 'le nombre de signes par demande',
  demandesParHeure: 'le nombre de demandes par heure',
  signesParMois: 'le nombre de signes par mois',
}

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** Valide une modification partielle ; lève une `ErreurHttp` 400 qui dit quoi
 * corriger. Renvoie les champs à appliquer. */
export function validerModification(fonction, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new ErreurHttp(400, 'réglages illisibles')
  const nom = NOMS_FONCTION[fonction]
  const sortie = {}
  for (const [champ, v] of Object.entries(patch)) {
    if (champ === 'modele') {
      if (!MODELES.some((m) => m.id === v))
        throw new ErreurHttp(400, `${nom} : modèle inconnu (${MODELES.map((m) => m.id).join(', ')} seulement).`)
    } else if (champ === 'acces') {
      if (!NIVEAUX.includes(v)) throw new ErreurHttp(400, `${nom} : niveau d’accès inconnu (${NIVEAUX.join(', ')}).`)
    } else if (CHAMPS_NOMBRE.includes(champ)) {
      const { min, max } = BORNES[champ]
      if (!Number.isInteger(v) || v < min || v > max) {
        throw new ErreurHttp(
          400,
          `${nom} : ${LIBELLES_CHAMP[champ]} doit être un entier entre ${fmt(min)} et ${fmt(max)}.`
        )
      }
    } else {
      throw new ErreurHttp(400, `${nom} : réglage inconnu « ${String(champ).slice(0, 40)} ».`)
    }
    sortie[champ] = v
  }
  return sortie
}

export class ReglagesIa {
  constructor(dataDir, { maintenant = () => Date.now() } = {}) {
    this.chemin = join(dataDir, 'reglages-ia.json')
    this.maintenant = maintenant
    this.etat = this._charger()
  }

  _charger() {
    let brut = {}
    if (existsSync(this.chemin)) {
      try {
        brut = lireJson(this.chemin, {})
      } catch {
        // Fichier abîmé : une copie en a été gardée (fichiers.js) ; on repart
        // des valeurs par défaut sans bloquer le service.
        brut = {}
      }
    }
    return {
      corrections: assainir(brut.corrections, DEFAUTS.corrections),
      margo: assainir(brut.margo, DEFAUTS.margo),
      modifieLe: Number.isFinite(brut.modifieLe) ? brut.modifieLe : null,
      modifiePar: typeof brut.modifiePar === 'string' ? brut.modifiePar : null,
    }
  }

  /** Les réglages d'une fonction (copie). */
  de(fonction) {
    if (!FONCTIONS.includes(fonction)) throw new Error(`fonction IA inconnue : ${fonction}`)
    return { ...this.etat[fonction] }
  }

  /** Tous les réglages (copie). */
  tous() {
    return {
      corrections: { ...this.etat.corrections },
      margo: { ...this.etat.margo },
      modifieLe: this.etat.modifieLe,
      modifiePar: this.etat.modifiePar,
    }
  }

  /** Applique une modification partielle `{ corrections: {...}, margo: {...} }`.
   * Tout ou rien : une valeur refusée n'en laisse aucune appliquée. */
  modifier(patch, par) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new ErreurHttp(400, 'réglages illisibles')
    const suivant = { corrections: { ...this.etat.corrections }, margo: { ...this.etat.margo } }
    for (const [fonction, champs] of Object.entries(patch)) {
      if (!FONCTIONS.includes(fonction))
        throw new ErreurHttp(400, `fonction inconnue : « ${String(fonction).slice(0, 40)} ».`)
      Object.assign(suivant[fonction], validerModification(fonction, champs))
    }
    const etat = { ...suivant, modifieLe: this.maintenant(), modifiePar: String(par || '') }
    ecrireAtomique(this.chemin, JSON.stringify(etat, null, 2))
    this.etat = etat
    return this.tous()
  }
}
