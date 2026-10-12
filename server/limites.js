// Les plafonds en mémoire (point 43 de la feuille de route, 11/10/2026),
// sortis de server.js. Créés par `creerLimites()` **après** le chargement du
// .env : les seuils réglables y sont lus à ce moment-là.

import { Limiteur } from './limiteur.js'
import { origineDe } from './http.js'

/**
 * `registre` (facultatif, server/limiteurs.js) : s'il est donné, les compteurs
 * survivent aux redémarrages et aux déploiements ; sans lui (les tests), ils
 * restent en mémoire.
 */
export function creerLimites({ registre = null } = {}) {
  const adopter = (nom, limiteur) => (registre ? registre.adopter(nom, limiteur) : limiteur)

  // Limitation des messages de contact : cinq par heure et par compte. Les
  // compteurs sont gardés d'un redémarrage à l'autre (server/limiteurs.js).
  // Suffisant contre un doigt qui reste appuyé, pas contre quelqu'un de
  // déterminé ; le but est d'éviter le formulaire envoyé quinze fois de suite
  // parce que rien ne semble se passer.
  // Deviner une adresse de page publiée ne doit pas être gratuit.
  //
  // Le nom d'une page — trois mots — vaut 8,4 milliards de combinaisons : de
  // quoi décourager quelqu'un qui essaie au hasard, **à condition que chaque
  // essai lui coûte quelque chose**. Sans ça, un balayage tourne à pleine
  // vitesse et la seule protection d'une page publique devient une question
  // de patience. On ne compte que les essais qui ne mènent nulle part :
  // consulter cent fois une page qu'on connaît reste libre.
  //
  // Les compteurs survivent aux redémarrages (server/limiteurs.js) : un
  // déploiement ne rend pas ses trente essais à qui balaie. Ça n'arrête pas
  // un adversaire distribué ; ça change l'échelle de temps d'un balayage
  // depuis une machine, qui est le cas réaliste.
  const ESSAIS_PUBLICATION = 30
  const ESSAIS_FENETRE_MS = 10 * 60_000
  const essaisPublication = adopter(
    'essais-publication',
    new Limiteur({ max: ESSAIS_PUBLICATION, fenetreMs: ESSAIS_FENETRE_MS })
  )

  function essaiPublicationAutorise(req) {
    // Derrière Caddy, `remoteAddress` vaut toujours 127.0.0.1 : sans
    // `origineDe`, tous les visiteurs partageaient un seul compteur (audit du
    // 10/10/2026, A9). Ici chaque tentative compte, y compris refusée.
    return essaisPublication.noter(origineDe(req)) <= ESSAIS_PUBLICATION
  }

  const INSCRIPTIONS_PAR_ORIGINE_HEURE = 5
  const INSCRIPTIONS_TOTAL_HEURE = 100
  const inscriptionsParOrigine = adopter(
    'inscriptions-par-origine',
    new Limiteur({ max: INSCRIPTIONS_PAR_ORIGINE_HEURE, fenetreMs: 3600_000 })
  )
  const inscriptionsTotal = adopter(
    'inscriptions-total',
    new Limiteur({ max: INSCRIPTIONS_TOTAL_HEURE, fenetreMs: 3600_000 })
  )
  function inscriptionAutorisee(origine) {
    if (inscriptionsTotal.atteint('tous') || inscriptionsParOrigine.atteint(origine)) return false
    inscriptionsTotal.noter('tous')
    inscriptionsParOrigine.noter(origine)
    return true
  }

  const SUPPORT_PAR_HEURE = 5
  const supportRecents = adopter('contact', new Limiteur({ max: SUPPORT_PAR_HEURE, fenetreMs: 3600_000 }))
  function supportAutorise(email) {
    return supportRecents.essayer(email)
  }

  // Quotas du 10/10/2026 (audit, S9 + S10 + S11). Ceux de l'IA ont quitté ce
  // fichier le 13/10/2026 : ils se règlent dans le back-office et se comptent
  // en signes par personne (server/reglagesIa.js, server/quotasIa.js).

  // Invitations : le titre du document part dans l'objet et le corps d'un
  // courriel envoyé depuis le domaine d'amend.ink vers n'importe quelle
  // adresse — un relais d'hameçonnage et un risque pour la réputation
  // Mailgun. Trois plafonds : par personne qui invite (heure et jour), et par
  // destinataire (personne ne doit recevoir dix invitations à la suite).
  const INVITATIONS_PAR_INVITANT_HEURE = 30
  const INVITATIONS_PAR_INVITANT_JOUR = 100
  const INVITATIONS_PAR_DESTINATAIRE_HEURE = 5
  const invitationsHeure = adopter(
    'invitations-heure',
    new Limiteur({ max: INVITATIONS_PAR_INVITANT_HEURE, fenetreMs: 3600_000 })
  )
  const invitationsJour = adopter(
    'invitations-jour',
    new Limiteur({ max: INVITATIONS_PAR_INVITANT_JOUR, fenetreMs: 24 * 3600_000 })
  )
  const invitationsDestinataire = adopter(
    'invitations-destinataire',
    new Limiteur({ max: INVITATIONS_PAR_DESTINATAIRE_HEURE, fenetreMs: 3600_000 })
  )
  function invitationAutorisee(invitant, destinataire) {
    if (
      invitationsHeure.atteint(invitant) ||
      invitationsJour.atteint(invitant) ||
      invitationsDestinataire.atteint(destinataire)
    )
      return false
    invitationsHeure.noter(invitant)
    invitationsJour.noter(invitant)
    invitationsDestinataire.noter(destinataire)
    return true
  }

  // Demandes de lien de connexion : par adresse (5 par heure, dans auth.js) et
  // par origine. Le refus est **silencieux** — la réponse reste « ok » — pour
  // ne rien apprendre à quelqu'un qui balaie des adresses.
  const LIENS_PAR_ORIGINE_HEURE = 20
  const liensParOrigine = adopter(
    'liens-par-origine',
    new Limiteur({ max: LIENS_PAR_ORIGINE_HEURE, fenetreMs: 3600_000 })
  )

  return {
    essaiPublicationAutorise,
    inscriptionAutorisee,
    supportAutorise,
    invitationAutorisee,
    liensParOrigine,
    LIENS_PAR_ORIGINE_HEURE,
  }
}
