// Le domaine d'amend.ink (couche 4) : règles en JavaScript pur, sans dépendance.
export { identifiantDocument, titreDocument, nomDeFichier, LANGUE_DOCUMENT_PAR_DEFAUT } from './document.js'
export { nomPersonne } from './personne.js'
export { ROLES, BRANCHES, roleEffectif, capacites, accesBranche, peutCommenter } from './droits.js'
export { typographier, saisie, ESPACE_INSECABLE, ESPACE_FINE } from './typographie.js'
export {
  DUREE_INVITATION_MS,
  DUREE_LIEN_CONNEXION_MS,
  DUREE_SESSION_MS,
  rolesDonnables,
  refusAcces,
  invitationValable,
  roleDuLienValide,
  peutRecevoirLienDeConnexion,
  adresseCourriel,
} from './partage.js'
export { nomDossier, refusDeplacementDossier, sectionDuDocument, refusRetrait } from './dossiers.js'
export {
  refusMembre,
  refusDepart,
  peutModifierEquipe,
  peutGererEquipe,
  peutGererModeles,
  deplacementDocument,
} from './equipes.js'
export {
  listeAdministrateurs,
  estAdministrateur,
  numeroDeVersion,
  adresseAide,
  DUREE_JOURNAL_MS,
  DUREE_MESURES_MS,
  PAS_MESURE_MS,
  evenementDeReponse,
  mesureValable,
} from './administration.js'
export { nfc } from './propre.js'
export { compter, PROFONDEURS_TABLE, PROFONDEUR_TABLE_PAR_DEFAUT, profondeurTable, entreesTable } from './compteur.js'
export {
  gabaritTypst,
  grille,
  chaineTypst,
  appliquerEcarts,
  valeurDuReglage,
  modeleRetenu,
  resoudreModele,
  ecartsVers,
  SEPARATEURS,
  debutChapitre,
  peutChoisirModele,
} from './miseEnPage.js'
export {
  AUTEUR_MARGO,
  AUTEUR_CLAUDE,
  AGENTS,
  GARDE_FOUS_MARGO,
  MARGO_DEMANDE_MAX_SIGNES,
  MARGO_HISTORIQUE_MAX_SIGNES,
  signes,
  texteNumerote,
  porteeMargo,
  normaliser,
  situerCitation,
  situerRemplacement,
  suiviDesRefus,
} from './margo.js'
export {
  DUREE_CORBEILLE_MS,
  dansLaCorbeille,
  joursRestants,
  titreDeCopie,
  lieuDeLaCopie,
  ORDRES_TRI,
  trierDocuments,
} from './corbeille.js'
export { IMAGE_MAX_OCTETS, IMAGES_DOCUMENT_MAX_OCTETS, typeImage, refusImage, nomImageValide } from './images.js'
export {
  POLICE_MAX_OCTETS,
  STYLES_POLICE,
  lirePolice,
  nomFichierPolice,
  stylesManquants,
  famillesDePolices,
} from './polices.js'
export { planSuppressionCompte, confirmationSuppressionValide } from './compte.js'
export { dateDuJour } from './date.js'
