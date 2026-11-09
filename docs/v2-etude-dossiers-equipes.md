# amend.ink v2 : étude « dossiers et équipes »

Statut : **arbitré** par Sylvain le 09/11/2026 (voir « Arbitrage » en fin de document).

## Demande

- Arbitrage de l'étape 6a (09/11/2026) : « des propositions de gestion d'équipe en lien avec les dossiers, après audit de différentes applis, en recherchant quelque chose de proche d'un partage de fichier sous Dropbox » ; « les dossiers doivent venir vite ».
- Précision de Sylvain (09/11/2026), après la première version : « oublie sur cette question la référence à Docs. Je veux un comportement au plus proche d'un partage de fichiers sur un serveur d'entreprise : un dossier "Mes documents", un dossier "Partagé avec moi", des dossiers d'équipe. » **Écart avec Docs décidé** (règle 11), noté dans le journal : Docs n'a ni dossiers ni équipes (un arbre de sous-documents ; équipes venues d'un annuaire, sans interface).

## 1. Le modèle du serveur de fichiers d'entreprise

Tous les outils regardés (serveur Windows, SharePoint et OneDrive, Google Drive, Dropbox équipe, Nextcloud) convergent vers le même montage en trois racines.

| | Mes documents | Partagé avec moi | Dossiers d'équipe |
|---|---|---|---|
| Serveur Windows | dossier personnel (`U:`) | (pas d'équivalent) | partages (`S:\Compta`), droits par groupes |
| Microsoft | OneDrive « Mes fichiers » | « Partagé avec moi » | bibliothèques des sites d'équipe SharePoint |
| Google | Mon Drive | « Partagés avec moi » | Drive partagés |
| Dropbox (équipe) | dossier du membre | « Partagé » | dossiers d'équipe |
| Nextcloud | fichiers de l'utilisateur | partages reçus | dossiers d'équipe (*Team folders*, ex-*Group folders*) |

Ce qu'ils ont en commun :

1. **Mes documents** : mon espace. Ce que j'y crée m'appartient ; personne n'y voit rien tant que je ne partage pas un document ou un dossier.
2. **Partagé avec moi** : ce n'est pas un vrai dossier, c'est une **vue** de ce que d'autres m'ont partagé un par un (un document, un dossier). On n'y voit que l'élément partagé, **jamais les dossiers qui le contiennent** (Dropbox l'écrit explicitement). Cette vue ne m'appartient pas : je ne peux pas déplacer un élément partagé dans Mes documents.
3. **Dossiers d'équipe** : **les documents appartiennent à l'équipe, pas aux personnes** (Drive l'écrit : « vous restez le créateur, vous n'êtes plus le propriétaire »). Il y a des membres, chacun avec un rôle, et des gestionnaires. Le départ d'un membre ne fait rien perdre.
4. **Création des dossiers d'équipe** : selon les outils, par un administrateur (Dropbox, Nextcloud, serveur Windows) ou par quiconque y est autorisé (Drive). Un membre ne peut pas ranger un fichier à la racine de l'espace d'équipe (Dropbox) : tout est dans un dossier d'équipe ou dans un dossier personnel.
5. **Héritage vers le bas** : un droit donné sur un dossier vaut pour tout ce qu'il contient.
6. **Restriction d'un sous-dossier** : c'est ce qui distingue le serveur d'entreprise de Drive grand public. Un sous-dossier peut être réservé à une partie des membres.
   - Serveur Windows et SharePoint : on « coupe l'héritage », puis on règle le sous-dossier à la main.
   - Dropbox : on retire des membres d'un sous-dossier, seulement dans un dossier d'équipe ; un administrateur peut toujours rétablir l'héritage.
   - Nextcloud : règles par dossier (autoriser ou refuser), héritées.
   - Drive partagé : pendant longtemps impossible, aujourd'hui un « accès limité » sur un dossier, réglé par le gestionnaire.
   - Tous préviennent que multiplier les exceptions rend les droits illisibles : à réserver aux vrais cas (le dossier « Contrats » d'une maison d'édition).
7. **Partager vers l'extérieur** : un document ou un sous-dossier d'un dossier d'équipe peut être partagé avec une personne qui n'est pas membre ; il arrive dans son « Partagé avec moi », sans le reste du dossier.
8. **Déplacer** :
   - entrer dans un dossier d'équipe **donne la propriété à l'équipe** ; sortir d'un dossier d'équipe est réservé aux gestionnaires (Drive) ;
   - les accès hérités de l'ancien dossier ne suivent pas, les partages directs restent ;
   - sortir d'un dossier d'équipe retire l'accès aux membres.
9. **Supprimer un dossier d'équipe** : réservé aux gestionnaires ou aux administrateurs, souvent en passant d'abord par un archivage (Dropbox, Notion).

## 2. Ce que cela donne pour amend.ink

Un auteur seul ne voit que **Mes documents** et **Partagé avec moi** (ses relecteurs y trouvent son manuscrit). Une maison d'édition crée un **dossier d'équipe** par collection ou par usage (« Essais 2027 », « Contrats »). Les manuscrits y appartiennent à la maison, ses éditeurs en sont membres, et les auteurs ou correcteurs extérieurs reçoivent un dossier de livre dans leur « Partagé avec moi ».

Ce qui existe déjà après 6a et se reprend tel quel : les quatre rôles, plusieurs propriétaires mais jamais aucun, les invitations par courriel, le lien de partage avec compte vérifié, la suppression immédiate par le propriétaire.

## 3. Questions pour Sylvain

### A. Les trois racines

#### 1. Mes documents

1. **Comme partout** : un espace personnel avec des dossiers et des sous-dossiers à volonté. Tout document créé hors d'un dossier d'équipe y va, et j'en suis propriétaire. Je peux partager un document ou un dossier : tout ce qu'il contient suit.
2. Mes documents sans sous-dossiers (une liste), les dossiers seulement dans les équipes.

Proposition : **1**.

#### 2. Partagé avec moi

1. **Vue comme Drive et Dropbox** : chaque élément qu'on m'a partagé, document ou dossier (dans lequel je peux entrer), avec qui me l'a partagé et quand. Pas les dossiers qui le contiennent. Les documents ouverts par un lien de partage y figurent aussi. Je peux m'en **retirer** (je renonce à mon accès), sauf si je suis le dernier propriétaire.
2. La même chose, plus la possibilité de ranger un élément partagé dans mes propres dossiers par un **raccourci** (Drive).

Proposition : **1** ; les raccourcis plus tard, si le besoin se confirme (règle 4 : ne pas alourdir).

#### 3. Plusieurs propriétaires et l'emplacement

Depuis 6a, un document peut avoir plusieurs propriétaires, mais il ne peut être qu'à un seul endroit.

1. **Le document reste dans le Mes documents de qui l'a créé (ou de qui l'y a déplacé)** ; les autres propriétaires le voient dans leur « Partagé avec moi ». S'il veut un document commun à plusieurs, il le met dans un dossier d'équipe.
2. Revenir à un seul propriétaire en dehors des dossiers d'équipe.

Proposition : **1** (garde l'arbitrage 6a, pas de nouvelle règle).

### B. Les dossiers d'équipe

#### 4. Équipe et dossier d'équipe

1. **Une équipe = un dossier d'équipe** (comme un Drive partagé) : ses membres sont les membres du dossier ; on crée un autre dossier d'équipe pour un autre groupe de personnes.
2. **Équipes et dossiers séparés** (serveur Windows, Dropbox, Nextcloud) : on définit des équipes (groupes de personnes), puis on donne à une équipe un rôle sur un ou plusieurs dossiers d'équipe.

Proposition : **1** pour commencer, le plus simple à comprendre et à gérer. Le 2 sert surtout aux grandes structures (des dizaines de dossiers pour les mêmes groupes) ; le stockage le laisse possible (la colonne `equipe` des accès est là pour ça).

#### 5. Qui crée un dossier d'équipe ?

1. **Toute personne connectée** (le service est fermé) : elle en devient gestionnaire.
2. Seulement l'administrateur d'amend.ink, à la demande.
3. L'administrateur d'une **structure** (maison d'édition) : cela demande d'introduire la notion de structure (membres, facturation), qui n'existe pas.

Proposition : **1** maintenant. Le 3 viendra avec la facturation, sans fixer de seuils d'ici là (règle 6).

#### 6. Rôles dans un dossier d'équipe

1. **Les rôles actuels, posés par membre** :
   - **gestionnaire** : le propriétaire de 6a, renommé dans ce contexte. Il gère les membres, renomme et supprime le dossier, et il y a toujours au moins un gestionnaire ;
   - **éditeur** : crée et modifie des documents et des sous-dossiers, invite ;
   - **correcteur** et **lecteur** sur tout le dossier.
2. Ajouter un rôle « gestionnaire de contenu » à la Drive (déplace et supprime, sans gérer les membres).

Proposition : **1** ; un rôle de plus seulement sur un besoin constaté.

#### 7. Propriété des documents d'un dossier d'équipe

1. **L'équipe en est propriétaire** : les droits du propriétaire (supprimer, nommer des propriétaires, sortir le document de l'équipe) sont ceux des gestionnaires ; le créateur reste affiché comme créateur. Un document déplacé de Mes documents vers un dossier d'équipe **change de propriétaire**, après une confirmation qui le dit.
2. Le créateur reste propriétaire, l'équipe a seulement un accès.

Proposition : **1** ; c'est ce qui fait qu'un départ ne fait rien perdre.

#### 8. Restreindre un sous-dossier

1. **Oui, simplement** (forme Dropbox) : un gestionnaire peut marquer un sous-dossier « réservé ».
   - L'héritage s'arrête là : seuls les membres qu'il désigne y ont accès, avec un rôle chacun.
   - Les gestionnaires y ont toujours accès, pour qu'aucun dossier ne devienne orphelin.
   - Les autres membres ne voient pas le dossier.
   - On revient à l'héritage d'un geste.
2. Non : seulement ajouter des droits ; pour restreindre, on crée un autre dossier d'équipe.
3. Des règles fines à la Nextcloud (autoriser ou refuser par personne et par dossier).

Proposition : **1**, dans un second lot. C'est le trait propre au serveur d'entreprise, mais une restriction mal comprise cache des documents. Le 3 est trop complexe (Nextcloud doit expliquer la « règle du moindre droit »).

#### 9. Partager vers l'extérieur de l'équipe

1. **Comme partout** : un éditeur partage un document ou un sous-dossier avec une personne qui n'est pas membre. Elle le trouve dans son « Partagé avec moi », sans voir le reste. Le partage se gère depuis l'élément.
2. Seuls les gestionnaires partagent vers l'extérieur.

Proposition : **1** (règle de 6a : les éditeurs invitent). Un réglage « partage externe interdit » par dossier d'équipe pourra venir si une structure le demande.

#### 10. Départ d'un membre

1. **Comme partout** : il perd tout accès au dossier d'équipe et à son contenu. Les documents restent à l'équipe, ses partages directs de documents de l'équipe vers des tiers restent. Il ne peut pas partir s'il est le dernier gestionnaire. Il peut partir de lui-même.

Proposition : **1**.

### C. Déplacer et supprimer

#### 11. Déplacer

1. **Comme Drive et Dropbox** :
   - **dans Mes documents** : le propriétaire, librement ;
   - **de Mes documents vers un dossier d'équipe** : le propriétaire du document, s'il est au moins éditeur du dossier d'arrivée. La propriété passe à l'équipe (question 7) ;
   - **à l'intérieur d'un dossier d'équipe** : un éditeur ;
   - **sortir d'un dossier d'équipe** (vers Mes documents ou un autre dossier d'équipe) : un gestionnaire seulement ;
   - **un élément de Partagé avec moi** ne se déplace pas ;
   - dans tous les cas, les partages directs restent, les accès hérités changent avec le dossier, et avant de confirmer on montre qui perd l'accès et qui le gagne.

Proposition : **1**.

#### 12. Supprimer (pas de corbeille pour le moment)

1. **Prudent** :
   - un document se supprime par son propriétaire, ou par un gestionnaire dans un dossier d'équipe ;
   - un dossier ne se supprime que **vide** ;
   - un dossier d'équipe ne se supprime que vide, par un gestionnaire.
2. Supprimer un dossier avec tout son contenu, après confirmation (nombre de documents affiché).

Proposition : **1** tant qu'il n'y a pas de corbeille (une erreur effacerait une collection entière). Le 2 viendra avec une corbeille, que les serveurs d'entreprise ont tous.

### D. Découpage

#### 13. Ordre des lots

1. **6c « Dossiers personnels et partage »**, rapide :
   - Mes documents avec des dossiers ;
   - Partagé avec moi ;
   - partager un dossier, déplacer, supprimer.
2. **6d « Dossiers d'équipe »** :
   - équipes, membres et gestionnaires ;
   - propriété par l'équipe ;
   - déplacements entrants et sortants.
3. **6e « Sous-dossiers réservés »** : la question 8.
4. L'interface (trois racines dans le volet de gauche, navigation dans les dossiers) dans les lots de design 6b, comme prévu.

Proposition : **dans cet ordre**. Le 6c répond tout de suite à « les dossiers doivent venir vite » et sert de base aux deux suivants.

## 4. Stockage (pour information)

- **Une seule table pour les dossiers et les documents.** `amend.documents` reçoit `type` (document ou dossier) et `parent`. Un dossier n'a pas de texte dans y/hub.
- **Chaque racine a un espace.** Il appartient soit à une personne (Mes documents), soit à une équipe (dossier d'équipe).
- **Nouvelles tables :**
  - `amend.equipes` : nom, date ;
  - les membres sont des accès posés sur la racine du dossier d'équipe (le rôle de propriétaire s'y affiche « gestionnaire ») ;
  - un drapeau `reserve` pour les sous-dossiers réservés.
- **Rôle effectif.** C'est le plus fort des accès trouvés en remontant les dossiers jusqu'au premier dossier réservé (inclus) ; s'y ajoutent les gestionnaires de l'équipe et le rôle du lien. Le calcul est une règle du domaine. La base le fait par une requête récursive.
- **Partagé avec moi.** Ce sont les éléments où j'ai un accès direct, ou un passage par lien, et dont aucun dossier parent ne m'est accessible.

## 5. Hors périmètre

Corbeille ; raccourcis ; structures (maisons d'édition) et facturation ; équipes séparées des dossiers (4.2) ; règles fines (8.3) ; annuaire externe ; quotas ; suppression du compte (et transfert de ses documents, que Dropbox fait par l'administrateur).

## 6. Sources

Lues le 09/11/2026 :

- **Dropbox :**
  - help.dropbox.com/share/share-with-others
  - /organize/team-folders
  - /share/restrict-folder-access
  - /organize/transfer-team-member-files
  - /plans/business-team-changes (espace d'équipe, dossier du membre)
  - /teams-admins/admin/team-folder-manager
- **Google :**
  - support.google.com/drive/answer/7166529
  - /drive/answer/14254362 (accès limité)
  - support.google.com/a/users/answer/12380484 (rôles des Drive partagés)
- **Microsoft :**
  - learn.microsoft.com/sharepoint/manage-permission-scope
  - learn.microsoft.com/sharepoint/troubleshoot/lists-and-libraries/error-share-break-inheritance
  - (pages d'aide de OneDrive non trouvées)
- **Nextcloud :**
  - github.com/nextcloud/groupfolders (*Team folders*, permissions avancées)
  - nextcloud.com/blog/nextcloud-16-implements-access-control-lists-to-replace-classic-file-servers/
- **Notion :** notion.com/help/intro-to-teamspaces.
- **Serveur Windows** : décrit d'après l'usage courant (dossiers personnels, partages, droits par groupes, héritage coupé), sans page lue.

## Arbitrage de Sylvain (09/11/2026)

« 8 : non, 9 : partage que d'un doc. Sinon ok. Faire au plus simple. »

- **8 : non.** Pas de sous-dossier réservé : dans un dossier d'équipe, on ne fait qu'ajouter des droits ; pour restreindre, on crée un autre dossier d'équipe. Le lot 6e disparaît, ainsi que le drapeau `reserve`.
- **9 : on ne partage qu'un document** hors de l'équipe, pas un sous-dossier.
- Toutes les autres propositions sont acceptées : 1, 2, 3, 4, 5, 6, 7, 10, 11, 12 et 13 (sans 6e).
- Consigne générale : **au plus simple**.
