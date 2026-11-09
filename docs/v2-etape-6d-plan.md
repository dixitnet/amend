# amend.ink v2 : plan de l'étape 6d, « Dossiers d'équipe »

Statut : **à arbitrer** (09/11/2026). Aucun développement avant le « go » de Sylvain.

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
