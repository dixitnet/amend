// Les plafonds en mémoire (point 43 de la feuille de route, 11/10/2026),
// sortis de server.js. Créés par `creerLimites()` **après** le chargement du
// .env : les seuils réglables y sont lus à ce moment-là.

import { Limiteur } from './limiteur.js'
import { limiteEnv } from './dialogue.js'
import { origineDe } from './http.js'

export function creerLimites() {
  // Limitation des messages de contact : cinq par heure et par compte. En
  // mémoire, donc remise à zéro à chaque redémarrage — même limite connue
  // que pour les liens magiques. Suffisant contre un doigt qui reste appuyé,
  // pas contre quelqu'un de déterminé ; le but est d'éviter le formulaire
  // envoyé quinze fois de suite parce que rien ne semble se passer.
  // Deviner une adresse de page publiée ne doit pas être gratuit.
  //
  // Le nom d'une page — trois mots — vaut 8,4 milliards de combinaisons : de
  // quoi décourager quelqu'un qui essaie au hasard, **à condition que chaque
  // essai lui coûte quelque chose**. Sans ça, un balayage tourne à pleine
  // vitesse et la seule protection d'une page publique devient une question
  // de patience. On ne compte que les essais qui ne mènent nulle part :
  // consulter cent fois une page qu'on connaît reste libre.
  //
  // En mémoire, donc remis à zéro au redémarrage — même limite connue que
  // pour les liens magiques. Ça n'arrête pas un adversaire distribué ; ça
  // change l'échelle de temps d'un balayage depuis une machine, qui est le
  // cas réaliste.
  const ESSAIS_PUBLICATION = 30
  const ESSAIS_FENETRE_MS = 10 * 60_000
  const essaisPublication = new Limiteur({ max: ESSAIS_PUBLICATION, fenetreMs: ESSAIS_FENETRE_MS })

  function essaiPublicationAutorise(req) {
    // Derrière Caddy, `remoteAddress` vaut toujours 127.0.0.1 : sans
    // `origineDe`, tous les visiteurs partageaient un seul compteur (audit du
    // 10/10/2026, A9). Ici chaque tentative compte, y compris refusée.
    return essaisPublication.noter(origineDe(req)) <= ESSAIS_PUBLICATION
  }

  const INSCRIPTIONS_PAR_ORIGINE_HEURE = 5
  const INSCRIPTIONS_TOTAL_HEURE = 100
  const inscriptionsParOrigine = new Limiteur({ max: INSCRIPTIONS_PAR_ORIGINE_HEURE, fenetreMs: 3600_000 })
  const inscriptionsTotal = new Limiteur({ max: INSCRIPTIONS_TOTAL_HEURE, fenetreMs: 3600_000 })
  function inscriptionAutorisee(origine) {
    if (inscriptionsTotal.atteint('tous') || inscriptionsParOrigine.atteint(origine)) return false
    inscriptionsTotal.noter('tous')
    inscriptionsParOrigine.noter(origine)
    return true
  }

  const SUPPORT_PAR_HEURE = 5
  const supportRecents = new Limiteur({ max: SUPPORT_PAR_HEURE, fenetreMs: 3600_000 })
  function supportAutorise(email) {
    return supportRecents.essayer(email)
  }

  // Quotas du 10/10/2026 (audit, S9 + S10 + S11). Tous en mémoire, par compte.
  //
  // IA : sans quota, un compte (et un compte s'obtient par une invitation)
  // pouvait se servir de la clé Anthropic de l'instance comme d'un modèle
  // gratuit. Même plafond horaire que le dialogue, plus un plafond
  // journalier.
  //
  // Ces plafonds sont ceux de la barre latérale « Demander à Margo » (Haiku
  // 5.5). Ils sont indépendants de ceux de la fenêtre flottante (dialogue,
  // Sonnet 5.5 : DIALOGUE_MESSAGES_PAR_HEURE, server/dialogue.js). Réglés dans
  // le .env, ouverts très largement le 11/10/2026 (avant : 30 par heure et 150
  // par jour) puisqu'un appel à Haiku coûte moins d'un centime.
  const SUGGESTIONS_PAR_HEURE = limiteEnv('AI_SUGGESTIONS_PAR_HEURE', 1000)
  const SUGGESTIONS_PAR_JOUR = limiteEnv('AI_SUGGESTIONS_PAR_JOUR', 5000)
  const suggestionsParHeure = new Limiteur({ max: SUGGESTIONS_PAR_HEURE, fenetreMs: 3600_000 })
  const suggestionsParJour = new Limiteur({ max: SUGGESTIONS_PAR_JOUR, fenetreMs: 24 * 3600_000 })
  function suggestionAutorisee(email) {
    if (suggestionsParHeure.atteint(email) || suggestionsParJour.atteint(email)) return false
    suggestionsParHeure.noter(email)
    suggestionsParJour.noter(email)
    return true
  }

  // Invitations : le titre du document part dans l'objet et le corps d'un
  // courriel envoyé depuis le domaine d'amend.ink vers n'importe quelle
  // adresse — un relais d'hameçonnage et un risque pour la réputation
  // Mailgun. Trois plafonds : par personne qui invite (heure et jour), et par
  // destinataire (personne ne doit recevoir dix invitations à la suite).
  const INVITATIONS_PAR_INVITANT_HEURE = 30
  const INVITATIONS_PAR_INVITANT_JOUR = 100
  const INVITATIONS_PAR_DESTINATAIRE_HEURE = 5
  const invitationsHeure = new Limiteur({ max: INVITATIONS_PAR_INVITANT_HEURE, fenetreMs: 3600_000 })
  const invitationsJour = new Limiteur({ max: INVITATIONS_PAR_INVITANT_JOUR, fenetreMs: 24 * 3600_000 })
  const invitationsDestinataire = new Limiteur({ max: INVITATIONS_PAR_DESTINATAIRE_HEURE, fenetreMs: 3600_000 })
  function invitationAutorisee(invitant, destinataire) {
    if (invitationsHeure.atteint(invitant) || invitationsJour.atteint(invitant) || invitationsDestinataire.atteint(destinataire)) return false
    invitationsHeure.noter(invitant)
    invitationsJour.noter(invitant)
    invitationsDestinataire.noter(destinataire)
    return true
  }

  // Demandes de lien de connexion : par adresse (5 par heure, dans auth.js) et
  // par origine. Le refus est **silencieux** — la réponse reste « ok » — pour
  // ne rien apprendre à quelqu'un qui balaie des adresses.
  const LIENS_PAR_ORIGINE_HEURE = 20
  const liensParOrigine = new Limiteur({ max: LIENS_PAR_ORIGINE_HEURE, fenetreMs: 3600_000 })

  return {
    essaiPublicationAutorise,
    inscriptionAutorisee,
    supportAutorise,
    suggestionAutorisee,
    SUGGESTIONS_PAR_HEURE,
    SUGGESTIONS_PAR_JOUR,
    invitationAutorisee,
    liensParOrigine,
    LIENS_PAR_ORIGINE_HEURE,
  }
}
