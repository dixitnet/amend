// Les noms que le serveur et le navigateur doivent écrire pareil : un
// décalage d'une lettre ne ferait aucune erreur, il ferait un document
// vide (ou des commentaires invisibles). Un seul endroit, importé des deux
// côtés (audit du 10/10/2026, point 49).

/** Le texte du document : un `Y.XmlFragment` (y-prosemirror). */
export const NOM_TEXTE = 'prosemirror-content'

/** Les commentaires : un `Y.Map` d'objets (voir client/src/comments.js). */
export const NOM_COMMENTAIRES = 'comments'

/** Les commentaires dont le passage est vide, masqués par les éditeurs, avec
 * la date du geste (`Y.Map`, voir client/src/comments.js). */
export const NOM_ORPHELINS = 'commentsOrphelins'

/** Ce qu'un commentaire dont l'auteur n'est pas un compte porte dans
 * `authorId` (13/10/2026) :
 *  - `AUTEUR_AGENT` : un agent invité (« Claude (pour Marie) ») ;
 *  - `AUTEUR_INCONNU` : un commentaire d'avant l'identifiant stable, que le
 *    serveur n'a pas pu rattacher à un compte (nom absent des membres du
 *    document, ou porté par plusieurs). Personne ne s'en reconnaît l'auteur :
 *    ni lecteur ni client ne peut le corriger. */
export const AUTEUR_AGENT = 'agent'
export const AUTEUR_INCONNU = 'inconnu'
