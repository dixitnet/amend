// Le domaine d'amend.ink (couche 4) : règles en JavaScript pur, sans dépendance.
export { identifiantDocument, LANGUE_DOCUMENT_PAR_DEFAUT } from './document.js'
export { nomPersonne } from './personne.js'
export { ROLES, BRANCHES, roleEffectif, capacites, accesBranche, peutCommenter } from './droits.js'
export { typographier, saisie, ESPACE_INSECABLE, ESPACE_FINE } from './typographie.js'
export {
  DUREE_INVITATION_MS,
  DUREE_LIEN_CONNEXION_MS,
  DUREE_SESSION_MS,
  ROLES_DU_LIEN,
  rolesDonnables,
  refusAcces,
  invitationValable,
  roleDuLienValide,
  peutRecevoirLienDeConnexion,
  adresseCourriel,
} from './partage.js'
