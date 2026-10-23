// Les deux courriers qui portent un lien d'invitation (23/10/2026) : celui d'un
// éditeur qui invite quelqu'un sur un document, et celui du back-office qui
// « embarque » un testeur. Écrits ici une fois parce que trois chemins les
// envoient : l'invitation, son renvoi depuis le panneau de partage, et son
// renvoi depuis le back-office. Un courrier qui n'a pas le même texte selon le
// chemin par lequel il est parti est un courrier qu'on ne sait plus dépanner.

import { capabilities } from './roles.js'
import { courrierAvecBouton } from './mailgun.js'

/** Un extrait pour un objet de courriel : espaces ramenés à un seul (un
 * retour à la ligne n'a rien à faire dans un en-tête), coupé à `max`. */
export function abrege(texte, max) {
  const t = String(texte || '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

/** « Nom (adresse) » quand la personne a donné son nom : un courrier qui dit
 * qui invite, et par un nom que le destinataire reconnaît, se fait moins
 * écarter par un filtre et plus volontiers ouvrir. */
export function quiInvite(adresse, nom) {
  return nom ? `${nom} (${adresse})` : adresse
}

/** L'objet commence par « Invitation » : c'est ce qui permet de retrouver ce
 * courrier dans les journaux du fournisseur (mailgun.js → etatDuCourrier). */
export function courrierInvitation({ qui, titre, role, lien }) {
  return {
    // Le titre est de la personne qui invite, jusqu'à 200 caractères : un
    // objet de courriel n'en porte qu'un extrait (S10).
    subject: `Invitation à collaborer sur « ${abrege(titre, 60)} »`,
    ...courrierAvecBouton({
      titre: `Invitation à collaborer sur « ${titre} »`,
      intro:
        `${qui} vous invite à collaborer sur « ${titre} » dans amend.ink, ` +
        `comme ${capabilities(role).label.toLowerCase()}. Ce lien ouvre le document directement, ` +
        `sans mot de passe ni inscription. Ouvrez-le dans les 14 jours, puis gardez ce message : ` +
        `il vous ramènera au document quand vous voudrez y revenir.`,
      libelleBouton: 'Ouvrir le document',
      lien,
      apres: "Si vous n'attendiez pas cette invitation, ignorez ce message.",
    }),
  }
}

/** Le courrier d'embarquement. Son objet ne commence pas par « Invitation » :
 * le back-office le retrouve par l'adresse et la date (voir
 * `etatDuCourrier({ objet })`). */
export function courrierBienvenue({ de, lien }) {
  return {
    subject: 'Bienvenue sur amend.ink',
    ...courrierAvecBouton({
      titre: 'Bienvenue sur amend.ink',
      intro:
        `${de} vous ouvre un premier document sur amend.ink, pour essayer l'application : ` +
        `un petit mode d'emploi à tester directement dans le texte. Ce document est le vôtre. ` +
        `Ce lien l'ouvre sans mot de passe ni inscription : ouvrez-le dans les 14 jours, puis gardez ce ` +
        `message, il vous ramènera à votre document.`,
      libelleBouton: 'Ouvrir mon document',
      lien,
      apres: "Si vous n'attendiez pas ce message, ignorez-le.",
    }),
  }
}
