# amend.ink v2 : plan de l'étape 6d, « Dossiers d'équipe »

Statut : **arbitré** le 09/11/2026 (voir « Arbitrage » en fin de plan) ; développement sur « go ».

Références :
- `docs/v2-etude-dossiers-equipes.md` (modèle du serveur de fichiers d'entreprise, arbitré) ;
- `docs/v2-etape-6c-plan.md` (Mes documents, Partagé avec moi).

## Déjà décidé (étude arbitrée)

- **Une équipe = un dossier d'équipe** ; toute personne connectée en crée un et en devient gestionnaire.
- **Les rôles des membres** : gestionnaire (les droits du propriétaire), éditeur, correcteur, lecteur. Il y a toujours au moins un gestionnaire.
- **L'équipe possède ses documents** ; le créateur reste affiché comme créateur.
- **Pas de sous-dossier réservé.**
- **Partage hors de l'équipe** : un document seulement, jamais un dossier.
- **Départ** : on perd tout accès ; les documents restent à l'équipe. Le dernier gestionnaire ne part pas.
- **Déplacements** :
  - un document entre dans l'équipe s'il est à moi et si je suis au moins éditeur de l'équipe ;
  - à l'intérieur de l'équipe, un éditeur déplace ;
  - seul un gestionnaire sort un document de l'équipe ;
  - on confirme en voyant qui perd ou gagne l'accès.
- **Suppression** :
  - un dossier ou un dossier d'équipe ne se supprime que vide ;
  - un document de l'équipe se supprime par un gestionnaire.
- **Au plus simple.**

## Questions pour Sylvain

### 1. Le rôle d'un membre vaut-il pour tout le dossier d'équipe ?

1. **Oui, un seul rôle par membre**, pour tout le dossier d'équipe et ses sous-dossiers. On ne donne davantage que sur un document précis, par son partage, comme aujourd'hui.
2. Un rôle différent par sous-dossier, en plus du rôle de membre.

Proposition : **1**. C'est la suite logique de « pas de sous-dossier réservé » et du partage limité aux documents.

### 2. Ajouter un membre

1. **Comme le partage d'un document** :
   - par adresse de courriel, avec un rôle ;
   - une adresse connue entre tout de suite et reçoit un courrier ;
   - une adresse nouvelle reçoit une invitation valable 7 jours, avec son lien de connexion.
2. Seulement parmi les personnes qui ont déjà un compte.

Proposition : **1** (même mécanisme, mêmes courriers, rien de nouveau à apprendre).

### 3. Où voit-on les dossiers d'équipe ?

1. **Un troisième onglet, « Équipes »**, à côté de Mes documents et de Partagé avec moi. On y trouve la liste de mes dossiers d'équipe, et à l'intérieur la même navigation que dans Mes documents.
2. Les dossiers d'équipe mêlés à mes dossiers, à la racine de Mes documents.

Proposition : **1**, comme les « Drive partagés » de Google ou les dossiers d'équipe de Dropbox.

### 4. Un document que je mets dans l'équipe : que deviennent ses accès ?

1. **Ses propriétaires deviennent éditeurs du document** : la propriété passe à l'équipe. Les autres accès (lecteurs, correcteurs, éditeurs extérieurs) restent.
2. Tous ses accès directs sont retirés : seuls les membres de l'équipe y ont accès.

Proposition : **1**. Le relecteur extérieur garde son accès, et l'ancien propriétaire reste au moins éditeur.

### 5. Un document que le gestionnaire sort de l'équipe

1. **Il va dans Mes documents du gestionnaire**, qui en devient propriétaire. Les membres qui n'avaient pas d'accès direct le perdent.
2. Le gestionnaire choisit un autre dossier d'équipe ou Mes documents.

Proposition : **1** ; le 2 plus tard si le besoin se présente (les dossiers d'équipe d'une même personne restent peu nombreux au début).

## Contenu (après arbitrage)

1. **Domaine** :
   - rôle effectif sur un document : le plus fort entre le rôle de membre, l'accès direct et le lien ;
   - règles des membres (jamais aucun gestionnaire) ;
   - déplacements entrants et sortants ;
   - section « Équipes ».
2. **PostgreSQL** :
   - `amend.equipes` (nom) ;
   - `amend.membres` (équipe, personne, rôle, auteur) et invitations de membres ;
   - un dossier ou un document appartient à une personne ou à une équipe.
3. **Serveur** :
   - routes des équipes : créer, renommer, membres, supprimer si vide, partir ;
   - déplacements ;
   - les droits calculés pour y/hub et les commentaires tiennent compte de l'équipe.
4. **Écrans techniques** : onglet Équipes, membres, déplacements avec confirmation. Le design viendra en 6b.
5. **Tests** par couche, un parcours sur la pile, puis un essai sur v2.amend.ink.

## Hors périmètre

Structures (maisons d'édition) et facturation ; équipes séparées des dossiers ; sous-dossiers réservés ; corbeille ; partage d'un dossier.

## Arbitrage de Sylvain (09/11/2026)

« 1.1, 2.1, 3 un onglet par équipe, 4.1, 5.1 »

- 1.1 : un seul rôle par membre, pour tout le dossier d'équipe.
- 2.1 : on ajoute un membre comme on partage un document (courriel, rôle, invitation de 7 jours).
- **3 : un onglet par équipe**, à côté de Mes documents et de Partagé avec moi (pas d'onglet « Équipes » qui les regroupe). Un bouton « Nouvelle équipe » en crée une. Avec beaucoup d'équipes, la rangée d'onglets s'allongera : le design (6b) en décidera la présentation.
- 4.1 : en entrant dans l'équipe, les propriétaires d'un document en deviennent éditeurs ; les autres accès restent.
- 5.1 : un document sorti de l'équipe va dans Mes documents du gestionnaire, qui en devient propriétaire.

## Avancement (09/11/2026)

- **Domaine** (`domaine/equipes.js`) :
  - membres gérés par le gestionnaire, jamais aucun gestionnaire ;
  - partir, sauf le dernier gestionnaire ;
  - qui modifie les dossiers de l'équipe : un éditeur au moins ;
  - déplacements (ranger, entrer, sortir ; d'une équipe à une autre : non) ;
  - section « équipe » ;
  - pas de propriétaire nommé sur un document d'équipe.
- **PostgreSQL** :
  - nouvelles tables `amend.equipes`, `amend.membres`, `amend.invitations_equipe` ;
  - une colonne `equipe` sur les documents et les dossiers (un dossier appartient à une personne ou à une équipe) ;
  - le rôle de membre compte dans le rôle effectif, donc aussi pour y/hub et les commentaires.
- **Serveur** :
  - routes des équipes (créer, voir, renommer, supprimer vide, partir, membres, invitations) ;
  - courriers d'ajout et d'invitation ;
  - invitations d'équipe converties à la connexion ;
  - dossiers et documents dans une équipe ;
  - déplacements.
- **Écrans** :
  - un onglet par équipe et un bouton « Nouvelle équipe » ;
  - dans l'équipe, la même navigation que dans Mes documents ;
  - pour le gestionnaire : membres (le panneau du partage, sans lien), renommer, supprimer ;
  - pour tous : quitter l'équipe ;
  - déplacer vers une équipe ou en sortir, après confirmation ;
  - **un seul bouton « Se déconnecter »** (Sylvain, 09/11/2026 ; la route « déconnecter partout » reste au serveur).
- **Confirmation simplifiée** : la boîte de dialogue dit ce qui change (les membres auront accès, les propriétaires deviennent éditeurs ; les membres sans accès propre le perdront), sans la liste nominative des personnes.
- **Tests** : 170 rapides (dont 5 sur les équipes contre PostgreSQL), 41 sur la pile (dont un parcours d'équipe : création, document qui entre, invitation par courriel, onglet de la correctrice).
