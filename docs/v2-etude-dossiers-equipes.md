# amend.ink v2 : étude « dossiers et équipes »

Statut : **étude, à arbitrer** (09/11/2026). Aucun développement avant les réponses de Sylvain.

Demande (arbitrage de l'étape 6a, 09/11/2026) : « des propositions de gestion d'équipe en lien avec les dossiers, après audit de différentes applis, en recherchant quelque chose de proche d'un partage de fichier sous Dropbox » ; « les dossiers doivent venir vite ».

Sources : code de Docs (`suitenumerique/docs`, branche `main` : `models.py`, `api/viewsets.py`, `choices.py`, `CHANGELOG.md`) ; pages d'aide de Dropbox, Google Drive et Notion (lues le 09/11/2026, adresses en fin de document). Ce qui n'a pas pu être vérifié est marqué **(non vérifié)**. OneDrive / SharePoint : pages introuvables, non étudié.

## 1. Ce que fait Docs (lu dans son code)

1. **Pas de dossiers : des sous-documents.** Un document peut contenir d'autres documents (arbre en chemins matérialisés, `django-treebeard`, depuis la v2.1.0). Aucun modèle « dossier », « espace » ou « équipe ». Le panneau de gauche montre l'arbre (lecture du code de l'interface : non faite).
2. **Héritage des accès** : le rôle effectif sur un document est **le plus fort** des accès posés sur lui et sur **tous ses ancêtres**. Un sous-document ne peut donc pas restreindre un rôle hérité : il peut seulement en ajouter.
3. **Héritage du lien** : l'accès par lien d'un sous-document ne peut pas être plus fermé que celui de ses parents (on ne propose que des réglages au moins aussi ouverts).
4. **Rôles** : lecteur < commentateur < éditeur < **administrateur** < propriétaire. Déplacer un document demande d'être propriétaire ou administrateur de la cible.
5. **Déplacement** : en transaction ; interdit dans sa propre descendance ; quand un document **change de racine**, ses accès directs et ses invitations en attente sont **effacés** (il prend ceux de son nouvel arbre) ; s'il n'a plus de propriétaire, ceux de la racine sont recopiés.
6. **Suppression** : depuis la 6.0.4, un créateur ne supprime que ses sous-documents **sans enfants** ; corbeille réservée au propriétaire.
7. **Équipes** : la table des accès a une colonne `team` (texte) ; `User.teams` rend une liste vide dans le code de base. Rien pour créer, gérer ou afficher une équipe ; la source prévue est externe (annuaire, OIDC) **(non vérifié : réglages non lus)**. C'est exactement notre état après 6a.
8. **Liste** : les documents où l'on a un rôle, **en ne montrant que les plus hautes racines** (un sous-document d'un arbre déjà listé n'est pas répété) ; filtres « créés par moi », favoris (épinglés).

## 2. Ce que font les autres

### Dropbox (le modèle demandé)

1. **Dossier partagé** : on partage un dossier avec des personnes ou un groupe, en « peut modifier » ou « peut voir » ; l'invité reçoit un courrier et doit avoir un compte. Tout ce qui est dedans suit.
2. **Dossier d'équipe** : partagé avec des **groupes**, chacun avec un rôle (éditeur, lecture seule), géré par l'administrateur. Les sous-dossiers **héritent** des membres du parent ; on peut **restreindre** un sous-dossier (en retirer des membres), seulement dans un dossier d'équipe, et un dossier restreint n'a pas de lien partagé.
3. Une personne qui n'est membre que d'un sous-dossier le reçoit comme un dossier partagé, **sans voir** les dossiers qui le contiennent.
4. Sortir un fichier d'un dossier d'équipe le retire aux autres membres.
5. Départ d'un membre : l'administrateur **transfère ses fichiers** à un autre membre. Propriété d'un dossier partagé : **(non vérifié)**.

### Google Drive

1. **Mon Drive** : partager un dossier fait hériter tout son contenu ; on ne peut pas donner **moins** sur un fichier que sur son dossier (Drive renvoie au dossier). Pour restreindre : déplacer le fichier, ou « accès limité » sur un **dossier** (récent).
2. **Drive partagé** (l'équivalent d'un espace d'équipe) : des **membres** (personnes ou groupes), cinq rôles (gestionnaire, gestionnaire de contenu, contributeur, commentateur, lecteur). **Les fichiers appartiennent au Drive partagé, pas aux personnes** : on en reste le créateur, plus le propriétaire. Un départ ne fait donc rien perdre.
3. Déplacer **dans** un Drive partagé : les partages directs restent, les accès hérités de l'ancien dossier ne suivent pas. Déplacer **hors** : les membres du Drive partagé perdent l'accès.
4. Seul le gestionnaire ajoute ou retire des membres et supprime le Drive partagé.

### Notion

1. Pas de dossiers : des **espaces d'équipe** (ouverts, fermés, privés), avec des propriétaires et des membres (personnes ou groupes) ; les pages d'un espace sont accessibles à ses membres selon le réglage des propriétaires.
2. Un espace d'équipe s'archive, il ne se supprime pas ; une page se déplace d'un espace à l'autre (effet sur les accès : non décrit).

## 3. Ce qui ressort

1. **Tous héritent vers le bas, et le rôle effectif est le plus fort** (Docs, Drive, Dropbox hors restriction). La restriction d'un sous-dossier existe chez Dropbox et Drive, mais tard, à part, et avec des limites : ce n'est pas le cas simple.
2. **Deux façons de faire une équipe** :
   - **le dossier partagé fait l'équipe** (Dropbox grand public, Mon Drive) : les membres d'un dossier sont, de fait, l'équipe de ce dossier ; rien d'autre à gérer ;
   - **l'espace d'équipe possède les documents** (Drive partagé, dossier d'équipe Dropbox, Notion) : des membres, souvent des **groupes**, gérés par quelqu'un ; les documents survivent aux départs.
3. Pour une maison d'édition, le second répond à un vrai besoin (les manuscrits sont à la maison, pas à l'éditrice qui part) ; pour un auteur et ses relecteurs, le premier suffit.
4. **Docs ne fait ni l'un ni l'autre** : un arbre de documents, les équipes viennent de l'annuaire. Un dossier sans texte serait un **écart avec Docs**, à décider et à noter dans le journal (règle 11).

## 4. Questions pour Sylvain

### 1. Qu'est-ce qu'un dossier ?

1. **Un dossier, sans texte, qui contient des documents et des dossiers** (Dropbox, Drive) : stocké dans le même arbre que Docs (un nœud de type « dossier »), avec les mêmes règles d'héritage ; écart avec Docs limité au type du nœud.
2. Des sous-documents, comme Docs : tout document peut en contenir d'autres ; un « dossier » est un document qu'on laisse vide.
3. Un simple rangement personnel, sans effet sur les accès (comme les dossiers de la v1).

Proposition : **1**. C'est ce qui ressemble à Dropbox, et c'est ce qu'attendent des auteurs (un livre = un dossier de chapitres) ; le stockage en arbre reste celui de Docs, ce qui laisse ouverte la porte des sous-documents plus tard. Le 3 ne répond pas à la demande (partager un dossier).

### 2. Héritage des accès

1. **Comme Docs et Drive** : un accès donné sur un dossier vaut pour tout ce qu'il contient ; le rôle effectif est le plus fort ; on peut **ajouter** quelqu'un sur un document ou un sous-dossier, **pas restreindre** (pour restreindre, on sort le document du dossier).
2. Comme les dossiers d'équipe de Dropbox : en plus, restreindre un sous-dossier.

Proposition : **1** (simple, lisible, déjà le calcul du domaine) ; la restriction, si un besoin réel apparaît.

### 3. Rôles sur un dossier

1. **Les quatre rôles actuels, avec le même sens** : lecteur, correcteur, éditeur s'appliquent à tous les documents du dossier ; l'éditeur crée des documents et des sous-dossiers dedans et invite ; le propriétaire supprime et déplace le dossier, nomme des propriétaires.
2. Ajouter un rôle « administrateur » comme Docs (entre éditeur et propriétaire : déplacer, gérer les accès, sans pouvoir supprimer).

Proposition : **1** ; pas de cinquième rôle sans besoin constaté.

### 4. Déplacer un document

1. **Comme Docs** : il faut être propriétaire du document et au moins éditeur du dossier d'arrivée ; impossible dans sa propre descendance ; le document **garde ses accès directs**, perd ceux hérités de l'ancien dossier et prend ceux du nouveau (comme Drive) ; on montre avant de confirmer qui perd et qui gagne l'accès.
2. Comme Docs strictement : en changeant de racine, il **perd aussi** ses accès directs et ses invitations.

Proposition : **1** (moins surprenant pour l'auteur qui avait invité un relecteur sur un chapitre ; écart avec Docs à noter). L'écran de confirmation fait partie du lot.

### 5. Supprimer un dossier

Pas de corbeille pour le moment (6a, point 4).

1. **Seulement vide** (comme Docs pour les sous-documents depuis la 6.0.4) : on supprime d'abord les documents, puis le dossier.
2. Avec tout son contenu, après confirmation (nombre de documents affiché), propriétaire du dossier et de chaque document.

Proposition : **1** tant qu'il n'y a pas de corbeille (une erreur effacerait un livre entier) ; 2 avec la corbeille.

### 6. Liste « Mes documents »

1. **Comme Docs** : on ne montre que les plus hautes racines auxquelles j'ai accès (mes dossiers, les dossiers et documents partagés avec moi), on entre dans un dossier pour voir son contenu ; un document partagé seul, dont je ne vois pas le dossier, apparaît à la racine (comme Dropbox) ; filtre « créés par moi / partagés avec moi » conservé.
2. Deux sections séparées, « Mes dossiers » et « Partagés avec moi ».

Proposition : **1** ; la présentation (arbre à gauche ou navigation par dossiers) relève du design (6b).

### 7. Équipes

1. **Pas d'objet « équipe » pour l'instant : le dossier partagé fait l'équipe** (Dropbox grand public). On invite des personnes sur un dossier ; ce sont elles, l'équipe de ce livre. La colonne `equipe` reste prête.
2. **Groupes de personnes** réutilisables (« Relecteurs maison », « Comité ») : un groupe a des gestionnaires et des membres ; on le choisit dans le partage comme une personne ; ses membres ont le rôle donné au groupe. C'est le remplissage de la colonne `equipe` de Docs, avec une interface en plus.
3. **Espaces d'équipe** qui possèdent les documents (Drive partagé, Notion) : des membres, des gestionnaires ; un document créé dedans appartient à l'espace ; le départ d'une personne ne fait rien perdre.

Proposition : **1 maintenant, 3 ensuite**, 2 éventuellement dans 3. Le 3 est le vrai besoin d'une maison d'édition (et la future facturation par structure) ; le faire sans dossiers serait prématuré, et il demande de trancher qui paie et qui administre (question de produit, pas de cette étape). Le 2 seul ajoute un objet à gérer sans régler la question des départs.

### 8. Accès par lien d'un dossier

1. **Comme Docs** : un dossier peut avoir un lien de partage ; un document du dossier ne peut pas être plus fermé que son dossier, seulement plus ouvert ; suivre le lien demande toujours un compte vérifié (6a, point 6).
2. Pas de lien sur les dossiers (seulement sur les documents).

Proposition : **1** (même règle que les accès, cohérente).

### 9. Stockage (pour information, à valider)

Colonne `parent` sur `amend.documents` (un dossier est une ligne de type `dossier`, sans texte dans y/hub), calcul des ancêtres par requête récursive ; chemins matérialisés comme Docs seulement si les mesures l'imposent. Les accès, invitations et liens restent ceux de 6a, posés sur un dossier ou un document.

## 5. Découpage proposé (après arbitrage)

1. **Étape 6c « Dossiers »** (rapide, demandé) : domaine (héritage, déplacement, suppression), PostgreSQL (arbre), serveur (routes des dossiers, déplacement, rôles hérités pour y/hub), écrans techniques minimaux (entrer dans un dossier, créer, déplacer, partager) ; design en 6b.
2. **Plus tard, étape « Espaces d'équipe »** : étude dédiée (qui crée un espace, qui paie, départs, administration), sur le modèle du Drive partagé.

## Hors périmètre

Restriction d'un sous-dossier ; corbeille ; favoris ; sous-documents à la Docs (document qui contient du texte et des enfants) ; annuaire externe ; OneDrive / SharePoint (non étudiés).

## Sources lues

- Docs : `src/backend/core/models.py`, `src/backend/core/api/viewsets.py`, `src/backend/core/choices.py`, `CHANGELOG.md` (branche `main`) ; dossiers `doc-tree` et `doc-share` du client listés, non lus.
- Dropbox : help.dropbox.com/share/share-with-others, /organize/team-folders, /share/restrict-folder-access, /organize/transfer-team-member-files.
- Google Drive : support.google.com/drive/answer/7166529, /drive/answer/14254362, support.google.com/a/users/answer/12380484.
- Notion : notion.com/help/intro-to-teamspaces.
