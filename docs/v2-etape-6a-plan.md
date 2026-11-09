# amend.ink v2 : plan de l'étape 6a, « Comptes et partage »

Statut : **arbitré** par Sylvain le 09/11/2026 (voir « Arbitrage » en fin de plan) ; développement lancé.

Références : `docs/v2-regles-developpement.md` (§ 3, vérification n° 0 « comment Docs le fait-il ? »), `docs/v2-etape-2-plan.md` (rôles, arbitrage), `v2/adr/0005-connexion.md` (lien magique), `v2/adr/0004-yhub.md`.

## But

Rendre la v2 utilisable par d'autres que nous : se connecter, retrouver ses documents, en créer, les partager par invitation, les mettre à la corbeille, en transmettre la propriété. Tout ce qui est aujourd'hui en mémoire (accès, noms) passe en base, de façon à accueillir plus tard les équipes. L'interface (6b) suit, en lots de design séparés.

## Ce que fait Docs (lu dans son code, branche `main`, 09/11/2026)

1. **Accès** (`DocumentAccess`) : une ligne par document et par **personne ou par équipe** (contrainte : l'un ou l'autre, jamais les deux ; une ligne au plus par personne et par équipe). Le rôle effectif est **le plus fort** de ceux qui s'appliquent (personne, ses équipes, dossiers parents, lien).
2. **Invitations** (`Invitation`) : une adresse, un document, un rôle, l'auteur de l'invitation ; **valable 7 jours** ; à la création du compte, les invitations valides deviennent des accès, puis sont effacées. Un courrier est envoyé à l'invitation (« X a partagé un document avec vous », lien vers le document). Limites : 60 invitations par minute et par personne.
3. **Propriété** : **plusieurs propriétaires possibles** ; seul un propriétaire peut nommer un propriétaire ; le dernier propriétaire d'un document racine ne peut pas être retiré ; pas de route de transfert : on nomme un nouveau propriétaire puis on retire l'ancien.
4. **Corbeille** : suppression douce (`deleted_at`), **propriétaire seul** pour supprimer et restaurer un document racine ; **30 jours** pour restaurer (réglable) ; liste « corbeille » des documents dont on est propriétaire. Purge définitive : non trouvée dans le code lu.
5. **Liste et création** : la liste montre tout document où l'on a un rôle (et ceux visités par un lien ouvert), avec des filtres « créés par moi », « favoris » ; quiconque est connecté crée un document et en devient propriétaire.
6. **Accès par lien** (`link_reach` : restreint, connecté, public ; `link_role`) : le rôle du lien s'ajoute aux autres.
7. **Connexion** : OIDC (écarté chez nous, ADR 0005 : lien magique).

## Bonnes idées de la v1 (à reprendre, pas à copier)

- Session de 30 jours dans un cookie signé, `HttpOnly`, `SameSite=Lax`, `Secure` en ligne ; « déconnecter partout » (révocation par date).
- Lien de connexion à usage unique, de courte durée ; limite d'envoi de liens par adresse.
- Courriers par Mailgun (zone européenne).

## Ce qui est établi

- Quatre rôles (lecteur, correcteur, éditeur, propriétaire) ; les éditeurs invitent, y compris d'autres éditeurs, et retirent tout accès sauf celui du propriétaire ; le propriétaire a en plus la vie et la mort du document et le transfert de propriété (étape 2).
- **Un seul propriétaire, transférable** (étape 2), qui pourra plus tard être une équipe : le stockage le prévoit.
- Connexion par lien magique (ADR 0005) ; textes des courriers dans `v2/i18n/` ; le serveur rend des codes.

## Questions pour Sylvain

### 1. Qui peut se connecter ?

1. **Service fermé, comme la v1** : seule une adresse déjà invitée (ou un compte existant) reçoit un lien de connexion ; de nouveaux auteurs entrent par invitation, ou par une liste d'adresses admises tenue par l'administrateur.
2. Service ouvert, comme Docs : toute adresse reçoit un lien et peut créer des documents.

Proposition : **1** pour la mise en ligne avec de vrais textes (pas d'inscription libre tant que les limites d'usage ne sont pas fixées sur des mesures réelles).

### 2. Propriétaire unique ou plusieurs ?

1. **Un seul, comme décidé à l'étape 2** : le transfert nomme un éditeur propriétaire, l'ancien propriétaire devient éditeur (une seule opération, confirmée).
2. Plusieurs, comme Docs.

Proposition : **1** (décision déjà prise ; l'écart avec Docs est assumé et le stockage reste compatible avec plusieurs).

### 3. Inviter une adresse qui n'a pas de compte

Comme Docs : une invitation (adresse, rôle, auteur) **valable 7 jours**, convertie en accès à la première connexion. Le courrier d'invitation contient **directement un lien de connexion** vers le document (un seul clic pour entrer), comme les invitations nominatives de la v1. Une adresse qui a déjà un compte reçoit l'accès tout de suite et un courrier qui le lui dit.

### 4. Corbeille (arbitré : pas de corbeille pour le moment, suppression immédiate par le propriétaire)

Comme Docs : le propriétaire seul met à la corbeille et restaure ; **30 jours** pour restaurer ; une liste « corbeille » ; au-delà, **suppression définitive** du document (texte, commentaires, historique dans y/hub), faite par une tâche quotidienne (Docs ne l'a pas dans le code lu ; à nous).

### 5. Liste des documents

Une liste unique de mes documents (ceux où j'ai un rôle), avec un filtre « créés par moi / partagés avec moi », le rôle de chacun et sa date de dernière modification. Favoris, dossiers, arborescence : plus tard (dossiers et arborescence déjà notés hors périmètre de l'étape 6).

### 6. Accès par lien (comme Docs : « toute personne qui a le lien »)

1. **Plus tard** : seulement les invitations nominatives pour l'instant (comme la v1).
2. Maintenant.

Proposition : **1**.

### 7. Équipes

Stocker chaque accès « pour une personne ou pour une équipe » (contrainte de Docs), et calculer le rôle effectif comme le plus fort (déjà le cas dans le domaine). **Aucune interface d'équipe** à cette étape.

### 8. Sécurité des sessions

Session de 30 jours (v1), « déconnecter partout », vérification de l'origine des requêtes qui modifient (protection CSRF, en plus de `SameSite=Lax`), limite d'envoi de liens par adresse et par minute, jeton de lien à usage unique valable 15 minutes.

## Contenu, en lots (après arbitrage)

1. **Domaine** : règles des invitations (validité, rôle donnable par qui), du transfert de propriété, de la corbeille (qui, combien de temps), de la connexion (qui reçoit un lien).
2. **Adaptateurs** : PostgreSQL (personnes, sessions révoquées, accès personne-ou-équipe, invitations, documents et corbeille) ; courrier (Mailgun, textes traduits).
3. **Serveur** : connexion par lien magique, sessions, routes des documents (liste, création, corbeille, restauration, purge), des accès et des invitations, transfert ; y/hub demande les droits à la base.
4. **Application (logique de l'écran)** : écrans techniques minimaux (connexion, liste, partage) avec les composants de design existants ; le design vient en 6b.
5. **Tests** par couche ; parcours de bout en bout (connexion, création, invitation d'une adresse nouvelle, transfert, corbeille).

## Critères de sortie

1. Une personne invitée reçoit un courrier, entre d'un clic, retrouve le document avec le bon rôle.
2. Accès, invitations et noms survivent au redémarrage du serveur.
3. Le propriétaire transfère la propriété, met à la corbeille, restaure ; la suppression définitive a lieu après le délai.
4. Aucune route ne modifie sans session valide et origine vérifiée ; tests T0 à T5 verts ; audit partiel avant la fusion.

## Hors périmètre

Interface et design (6b) ; dossiers, arborescence, favoris ; accès par lien (si 6.1) ; interface des équipes ; suppression du compte ; exports (étape 7) ; IA (étape 8).

## Arbitrage de Sylvain (09/11/2026)

1. **1a** : service fermé ; reçoit un lien de connexion une adresse déjà connue, invitée, ou arrivée par le lien de partage d'un document (voir 6).
2. **2b** : **plusieurs propriétaires**, comme Docs (révise l'étape 2, « un seul propriétaire transférable ») : seul un propriétaire nomme un propriétaire ; le dernier propriétaire d'un document ne peut pas être retiré ; transmettre la propriété, c'est nommer un autre propriétaire puis se retirer.
3. **ok** : invitation de 7 jours, convertie en accès à la première connexion ; le courrier contient le lien de connexion vers le document ; une adresse connue reçoit l'accès tout de suite et un courrier.
4. **Suppression par le propriétaire seul, sans délai** pour le moment : pas de corbeille ; le document est effacé tout de suite (texte, suggestions, historique, commentaires, accès).
5. **ok**, mais **les dossiers doivent venir vite**.
6. **6b** : l'accès par lien **maintenant**, mais suivre le lien impose de **créer un compte par une adresse vérifiée** (lien de connexion par courriel) ; **aucune connexion anonyme** pour le moment. Les identifiants des documents deviennent aléatoires (comme Docs), le lien ne se devine pas.
7. **ok** : accès pour une personne ou une équipe, sans interface d'équipe.
8. **ok**.

**À suivre** (demande de Sylvain) : des propositions de gestion d'équipe, liées aux dossiers, après l'étude de plusieurs applications, en cherchant quelque chose de proche du partage de fichiers de Dropbox.
