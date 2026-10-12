// Qui peut se servir de l'IA, et jusqu'où — la vérification commune aux deux
// fonctions (Corrections IA et Margo), 13/10/2026.
//
// Quatre contrôles, tous sur les réglages d'instance (server/reglagesIa.js) :
//   1. l'accès : le niveau minimal réglé, jamais un lecteur ;
//   2. la taille de la demande, en signes, **avant tout envoi** ;
//   3. le plafond mensuel de signes de la personne ;
//   4. le nombre de demandes par heure (fenêtre glissante, en mémoire).
//
// Les administrateurs sont soumis aux mêmes limites que tout le monde.
// Les messages disent la règle en signes (espaces compris) et, quand c'est
// possible, quand la limite se libère.

import { ErreurHttp } from './erreurs.js'
import { Limiteur } from './limiteur.js'
import { FONCTIONS, NOMS_FONCTION } from './reglagesIa.js'
import { moisDe, moisSuivant } from './usageIa.js'
import { nombre, signes } from '../shared/signes.js'

export { nombre, signes }

const HEURE_MS = 3600_000
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

const heureDeParis = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })

/** Le droit d'accès : `niveau` est le **minimum** réglé pour la fonction ;
 * `role` le rôle de la personne sur le document (ou `null`). Quelqu'un qui n'a
 * pas le droit de proposer des modifications sur le document (lecteur, aucun
 * rôle) n'a jamais accès : l'IA écrit dans le document. */
export function accesIa(niveau, { admin = false, role = null } = {}) {
  if (role !== 'editeur' && role !== 'correcteur') return false
  if (niveau === 'admin') return !!admin
  if (niveau === 'editeur') return !!admin || role === 'editeur'
  if (niveau === 'correcteur') return true
  return false
}

export class QuotasIa {
  /** `registre` (facultatif) : les demandes de l'heure y sont gardées d'un redémarrage à l'autre. */
  constructor({ reglages, usage, maintenant = () => Date.now(), registre = null }) {
    this.reglages = reglages
    this.usage = usage
    this.maintenant = maintenant
    this.heure = Object.fromEntries(
      FONCTIONS.map((f) => {
        const l = new Limiteur({ max: 1, fenetreMs: HEURE_MS, maintenant: () => this.maintenant() })
        return [f, registre ? registre.adopter(`ia-${f}-heure`, l) : l]
      })
    )
  }

  acces(fonction, personne) {
    return accesIa(this.reglages.de(fonction).acces, personne)
  }

  /** Où en est cette personne, pour l'affichage (client et back-office). */
  etat(fonction, email) {
    const r = this.reglages.de(fonction)
    const limiteur = this.heure[fonction]
    limiteur.max = r.demandesParHeure
    const cle = String(email).toLowerCase()
    return {
      modele: r.modele,
      signesParDemande: r.signesParDemande,
      mois: { utilises: this.usage.signesDuMois(cle, fonction), max: r.signesParMois },
      heure: { utilisees: limiteur.compter(cle), max: r.demandesParHeure },
    }
  }

  /**
   * Contrôle une demande de `taille` signes et, si elle passe, **prend une
   * place** dans l'heure. Lève une `ErreurHttp` (413 pour la taille, 429 pour
   * les plafonds) dont le message dit la règle. Renvoie les réglages de la
   * fonction (le modèle à appeler en fait partie).
   */
  verifier({ fonction, email, taille }) {
    const r = this.reglages.de(fonction)
    const nom = NOMS_FONCTION[fonction]
    const cle = String(email).toLowerCase()

    if (taille > r.signesParDemande) {
      const conseil = fonction === 'margo' ? 'Choisissez une portée plus courte (une section ou une sélection).' : 'Sélectionnez un passage plus court.'
      throw new ErreurHttp(413, `${nom} : cette demande porte sur ${signes(taille)}, la limite est de ${signes(r.signesParDemande)} par demande. ${conseil}`)
    }

    const utilises = this.usage.signesDuMois(cle, fonction)
    if (utilises + taille > r.signesParMois) {
      const [a, m] = moisSuivant(moisDe(this.maintenant())).split('-').map(Number)
      const renouvellement = `1er ${MOIS[m - 1]}${m === 1 ? ` ${a}` : ''}`
      const reste = Math.max(0, r.signesParMois - utilises)
      throw new ErreurHttp(
        429,
        reste === 0
          ? `${nom} : votre limite mensuelle est atteinte (${nombre(utilises)} signes sur ${nombre(r.signesParMois)}). Elle se renouvelle le ${renouvellement}.`
          : `${nom} : cette demande (${signes(taille)}) dépasse ce qu’il vous reste ce mois-ci (${signes(reste)} sur ${nombre(r.signesParMois)}). Choisissez un passage plus court, ou attendez le ${renouvellement}.`
      )
    }

    const limiteur = this.heure[fonction]
    limiteur.max = r.demandesParHeure
    if (limiteur.atteint(cle)) {
      const quand = limiteur.libereA(cle)
      const apres = quand ? ` Une place se libère à ${heureDeParis.format(new Date(quand)).replace(':', ' h ')}.` : ''
      throw new ErreurHttp(429, `${nom} : limite atteinte, ${r.demandesParHeure} demande${r.demandesParHeure > 1 ? 's' : ''} par heure.${apres}`)
    }
    limiteur.noter(cle)
    return r
  }

  /** Une demande terminée : signes (si réussie) et jetons. */
  enregistrer(infos) {
    this.usage.enregistrer(infos)
  }
}
