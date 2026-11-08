# amend.ink v2 : plan de l'étape 2, « Droits »

Statut : **ouverture** (08/11/2026), soumis à la revue de Mistral et à l'arbitrage de Sylvain. Rien n'est développé avant. Révisé le 08/11/2026 : la proposition à deux rôles (sans propriétaire) est retirée à la demande de Sylvain ; il peut y avoir plusieurs éditeurs, il faut donc un propriétaire qui gère leurs droits, crée et supprime le document.

Références : `docs/v2-regles-developpement.md` (dont « Avant de proposer un développement ou un correctif »), `docs/v2-procedure-tests.md`, `v2/adr/`.

## Changement proposé au plan des étapes

Le § 8 des règles prévoyait une étape 2 « Domaine » (rôles, typographie, NFC, limites en signes) puis une étape 3 « Droits et collaboration ». Appliquée à ce découpage, la règle « bon moment, besoin établi » donne :

| Règle du domaine | Qui s'en sert | Quand |
|---|---|---|
| rôles et capacités | le serveur (décision des droits) et l'adaptateur y/hub (permissions) | **maintenant** |
| règles de gestion des accès (qui peut donner quel rôle, dernier propriétaire) | les invitations et la page des accès | étape 6 |
| typographie française | l'extension de l'éditeur | étape 4 |
| NFC des textes exportés | les exports | étape 7 (la NFC des noms existe déjà, `domaine/personne.js`) |
| limites en signes | l'IA | étape 8 |

Écrire maintenant la typographie, la NFC des exports et les limites en signes, ce serait du code sans utilisateur, figé avant de connaître le besoin réel de l'étape qui s'en servira. **Proposition** : fusionner les étapes 2 et 3 en une étape « Droits » ; chaque autre règle du domaine est écrite à l'étape qui la consomme, avec ses tests.

## But

Que chaque personne n'ait, sur chaque document, que les droits de son rôle, décidés par notre serveur et appliqués par y/hub, et que ce soit vérifié à chaque couche.

## Ce qui est établi, et ce qui ne l'est pas

- **Établi** (décisions de produit, v1 et ADR 0001) : le serveur décide, y/hub applique ; un rôle inconnu vaut le plus restrictif ; aucun rôle, aucun accès ; plusieurs éditeurs possibles sur un document, donc un propriétaire (Sylvain, 08/11/2026) ; des équipes et dossiers partagés viendront plus tard.
- **Arbitré** (08/11/2026) : quatre rôles, lecteur, correcteur, éditeur, propriétaire ; les éditeurs invitent, y compris des éditeurs ; un propriétaire, transmissible.
- **Pas encore utilisable** à cette étape : la suggestion et les commentaires (étape 5). Tant qu'ils n'existent pas, un correcteur (et un lecteur, s'il est gardé) ne peut que **lire**.
- **Pas établi** : où et comment sont enregistrés les comptes, les documents et les accès. C'est l'objet de l'étape 6, avec son ADR. À cette étape, la table des accès est **provisoire, en mémoire**, alimentée par une route de développement ; elle est remplacée à l'étape 6 sans changer l'interface que le serveur offre à y/hub.

## Les permissions de Docs, en détail

Source : `src/backend/core/models.py` (`Document.get_abilities`, `DocumentAccess.get_abilities`) et `choices.py` de Docs (La Suite numérique). Docs est une référence, pas une dépendance.

### Rôles

Cinq rôles, ordonnés : **lecteur < commentateur < éditeur < administrateur < propriétaire**. Administrateur et propriétaire sont dits « privilégiés ». Un document peut avoir **plusieurs propriétaires**. Le rôle effectif d'une personne est le plus élevé entre son accès nominatif, celui hérité d'un document parent, et celui que donne le lien de partage.

### Ce que chaque rôle peut faire sur un document

| Capacité | lecteur | commentateur | éditeur | administrateur | propriétaire |
|---|---|---|---|---|---|
| lire, voir la liste des accès, voir les versions | oui | oui | oui | oui | oui |
| commenter, mentionner | | oui | oui | oui | oui |
| modifier le texte, restaurer une version, utiliser l'IA | | | oui | oui | oui |
| créer un sous-document | | | oui | oui | oui |
| gérer les accès (inviter, changer un rôle, retirer) | | | | oui | oui |
| régler le lien de partage, déplacer le document | | | | oui | oui |
| nommer un propriétaire | | | | | oui |
| supprimer un document racine, le restaurer de la corbeille | | | | | oui |
| supprimer un sous-document | | | (son créateur, s'il est vide) | oui | oui |
| quitter le document | oui | oui | oui | | (si un autre propriétaire reste) |

Créer un document : toute personne connectée ; elle en devient **propriétaire**.

### Règles de gestion des accès

1. Un administrateur ou un propriétaire peut donner les rôles lecteur, commentateur, éditeur et administrateur ; **seul un propriétaire** peut donner le rôle propriétaire.
2. L'accès d'un propriétaire ne peut être modifié ou retiré **que par un propriétaire**, et **jamais s'il est le dernier** : un document a toujours au moins un propriétaire.
3. On ne peut pas donner sur un sous-document un rôle inférieur à celui hérité du parent.
4. Lien de partage : portée (restreint, personnes connectées, public) et rôle du lien (lecteur, commentateur, éditeur) ; réglé par administrateur et propriétaire.

### Traduction en y/hub

Docs traduit ces rôles en permissions de y/hub à la connexion : lecture seule pour lecteur et commentateur, lecture et écriture à partir d'éditeur, historique et retour arrière avec l'écriture. Les commentaires de Docs vivent hors du document Yjs (écrits par son serveur, `RESTYjsThreadStore`), ce qui permet au commentateur de commenter sans droit d'écriture.

## Ce que nos briques font déjà, et la v1

| Brique | Ce qu'elle sait faire, sans code de notre part |
|---|---|
| **y/hub** | Permissions par **document et par branche** (`{org, docid, branch}`), décidées par notre serveur à la connexion : contenu (lire, écrire), présence, historique (à partir d'une date, retour arrière, versions nommées), suppression. Il applique lui-même : une écriture sans le droit n'est pas acceptée. Il ne connaît **ni comptes, ni rôles, ni invitations**. |
| **BlockNote** | Éditeur modifiable ou en **lecture seule** ; **mode suggestion** (voir ou écrire les suggestions, accepter, rejeter), sur un document de suggestions distinct ; **commentaires** avec deux rôles natifs : `comment` (créer un fil, répondre, résoudre, réagir, modifier ses propres commentaires) et `editor` (en plus : supprimer un fil ou le commentaire d'un autre). |
| **v1** (pour mémoire, pas de reprise de code) | Trois rôles (éditeur, correcteur, lecteur) et un champ `owner` à part : un seul propriétaire, le créateur, transmis à l'éditeur le plus ancien quand son compte est supprimé. Tout éditeur peut inviter et gérer les accès. |

Différence de fond avec Docs : Docs n'a **pas de suggestion** ; son commentateur ne propose rien. Notre **correcteur** est un commentateur qui, en plus, écrit des suggestions. Avec y/hub, cela tient en permissions : il lit la branche principale et écrit dans la branche (ou le document) de suggestions, y/hub refuse le reste. La règle « le correcteur ne touche pas au texte accepté », qui demandait en v1 une analyse du texte côté serveur, devient une ligne de permissions.

## Décision de Sylvain (08/11/2026) : quatre rôles

lecteur < correcteur < éditeur < propriétaire. Les éditeurs invitent, y compris d'autres éditeurs. Le propriétaire est un éditeur qui a en plus les seuls droits nécessaires : **la vie et la mort du document, et le transfert de propriété**. Un seul propriétaire, donc, qui transmet la propriété (pas de « dernier propriétaire » à protéger).

| Rôle | Texte (branche principale, y/hub) | Suggestions (étape 5) | Commentaires (BlockNote, étape 5) | Accès et document |
|---|---|---|---|---|
| **lecteur** | lire | voir | à trancher à l'étape 5 (lecture seule ou `comment`) | quitter |
| **correcteur** | lire | voir, écrire | `comment` | quitter |
| **éditeur** | lire, écrire ; historique, retour arrière | voir, écrire ; accepter, rejeter | `editor` | inviter (tous rôles sauf propriétaire), changer un rôle, retirer un accès, sauf celui du propriétaire ; quitter |
| **propriétaire** | comme l'éditeur | comme l'éditeur | `editor` | comme l'éditeur ; supprimer et restaurer le document ; transférer la propriété (il devient alors éditeur) ; ne peut pas quitter sans transférer |

Créer un document : toute personne connectée ; elle en devient propriétaire. Pas d'administrateur ; pas de lien de partage (la page publiée couvre la lecture publique), à rouvrir à l'étape 6 si besoin.

## Anticiper les équipes et les dossiers partagés

Besoin annoncé (Sylvain, 08/11/2026), pas pour cette étape : des **équipes** qui partagent un **dossier commun**, comme un Drive partagé de Google. Rien n'est développé pour elles avant qu'elles soient au plan ; mais quatre choix de cette étape et de l'étape 6 les rendraient coûteuses s'ils étaient faits sans y penser.

### Comment font les autres

- **Docs** : un accès donne un rôle à **une personne ou une équipe** (jamais les deux) ; les documents forment un arbre, un document hérite des accès de ses ancêtres ; le rôle effectif est **le plus fort** de tous les accès qui s'appliquent (personnels, d'équipe, hérités). On ne peut pas donner sur un document un rôle plus faible que celui hérité. Les équipes viennent de l'annuaire (le fournisseur d'identité), Docs ne les gère pas.
- **Drive partagé de Google** : les fichiers appartiennent **au dossier partagé**, pas à une personne ; ils restent quand un membre part. Déposer un fichier dans un Drive partagé en transfère la propriété au Drive. Les membres ont un rôle sur le Drive entier ; on peut ajouter des personnes sur un fichier, pas retirer à un fichier un accès venu du Drive.
- **v1** : les dossiers ne sont qu'un rangement personnel, sans effet sur les droits (`docs/journal-decisions.md` : en faire une frontière d’accès a été écarté).

### Conséquences pour nous

1. **Le rôle effectif est un maximum.** Dès cette étape, les rôles sont ordonnés et le domaine calcule le rôle effectif comme le plus fort d'une liste de rôles (`roleEffectif(roles)`). Aujourd'hui la liste n'a qu'un élément ; demain elle contiendra le rôle personnel, celui de l'équipe, celui hérité du dossier. Coût nul, et aucune règle à réécrire le jour venu.
2. **La décision reste « une personne, un document ».** y/hub et BlockNote ne voient jamais d'équipe ni de dossier : notre serveur leur répond avec le rôle effectif, à la connexion. Les équipes ne toucheront donc ni à l'adaptateur y/hub, ni à l'éditeur. L'identifiant d'un document ne doit **rien** contenir de son dossier (déplacer un document ne change pas son nom dans y/hub).
3. **Le propriétaire peut être une équipe.** Avec un propriétaire toujours personnel, un document du dossier d'équipe disparaîtrait ou deviendrait orphelin au départ de la personne. Le modèle de l'étape 6 prévoit donc un **titulaire** (personne, plus tard équipe) pour chaque accès, propriété comprise ; déposer un document dans un dossier d'équipe en transférera la propriété à l'équipe (comme Google). À cette étape, seule la forme en tient compte : le domaine parle de titulaire, la table provisoire ne contient que des personnes.
4. **Deux sortes de dossiers, à ne pas confondre.** Le rangement personnel (sans effet sur les droits, comme en v1) et le dossier d'équipe (qui porte des accès, hérités par ses documents). L'ADR de stockage (étape 6) décide du modèle (accès : titulaire, cible document ou dossier, rôle) et de l'héritage, même si les équipes arrivent plus tard.

Questions ouvertes, à trancher quand les équipes seront au plan (rien ne les bloque d'ici là) : qui gère une équipe (ses membres, son rôle) ; un document peut-il appartenir à plusieurs dossiers d'équipe (Docs et Google : non) ; peut-on restreindre un document dans un dossier d'équipe (Docs et Google : non, on peut seulement ajouter) ; les équipes viennent-elles d'un annuaire ou sont-elles gérées dans amend.ink (nous n'avons pas d'annuaire : chez nous, sans doute).

## Ce qui reste à écrire chez nous

1. **La table rôles → capacités** (domaine) et sa traduction en permissions de y/hub (adaptateur, qui existe). Seul code de droits de cette étape.
2. **Les règles de gestion des accès** (qui donne quel rôle, l'accès du propriétaire intouchable, le transfert) : fonctions pures du domaine, mais consommées par les invitations ; donc **étape 6**, avec le stockage et son ADR (qui prévoit les équipes, ci-dessus).
3. **Où vivent les commentaires du correcteur**, qui ne peut pas écrire dans la branche principale : `RESTYjsThreadStore` (la voie de Docs) ou avec les suggestions ; étape 5.
4. **Imposer le mode suggestion au correcteur dans l'interface** : un réglage de l'éditeur ; la garantie vient de y/hub. Étape 5.

## Contenu, en lots d'une couche

1. **Domaine** (`domaine/droits.js`) : les quatre rôles, ordonnés, et leurs capacités en codes (`lire`, `commenter`, `suggerer`, `ecrire`, `arbitrer`, `restaurer`, `inviter`, `supprimer`, `transferer`) ; `roleEffectif(roles)` (le plus fort) ; `capacites(role)` (rôle inconnu → le plus restrictif ; aucun rôle → rien) ; `acces(capacites)` : ce que la collaboration doit autoriser (`ecriture`, `lecture`, ou rien). Aucun libellé : les noms des rôles affichés passent par `i18n/`. `suggerer` et `commenter` sont déclarées mais branchées sur rien avant l'étape 5.
2. **Serveur** : la route interne `droits` répond d'après la table des accès et le domaine ; route de développement pour donner un rôle à une personne sur un document ; création d'un document en développement : la personne qui le crée en devient **propriétaire**.
3. **Adaptateur y/hub** : inchangé dans sa forme (il traduit déjà `ecriture` et `lecture`) ; vérifié par ses tests.
4. **Tests** (procédure par couches) :
   - T1 : table des rôles et des capacités, ordre des rôles, rôle effectif (le plus fort, liste vide, rôle inconnu dans la liste), rôle inconnu, aucun rôle, traduction en accès ;
   - T3 : route des droits (chaque rôle, rôle inconnu, absent, document inconnu), créateur propriétaire, route de développement fermée hors développement ;
   - T2 : y/hub applique le rôle décidé par le serveur (écriture refusée à un correcteur et, s'il est gardé, à un lecteur ; acceptée pour un éditeur et un propriétaire) ;
   - T5 : deux navigateurs, un propriétaire et un correcteur : la frappe du correcteur ne s'enregistre pas, et l'interface le lui dit (texte traduit).

## Critères de sortie

1. Un correcteur (et un lecteur) ne peut pas modifier un document, quelle que soit la façon de s'y prendre (interface, WebSocket directe, session forgée).
2. Les droits sont décidés à un seul endroit (le domaine, appelé par le serveur).
3. Tests T1 à T5 verts ; revue de clôture traitée.

## Hors périmètre, noté pour plus tard

- Suggestion et commentaires, et les droits qui s'y rattachent : étape 5.
- Historique visible à partir de la date d'accès (idée reprise de Docs) : étape 5, avec les versions.
- Stockage des comptes, documents et accès ; invitations ; règles de gestion des accès ; transfert de propriété ; lien magique ; lien de partage éventuel : étape 6 (son ADR prévoit les équipes).
- Équipes et dossiers partagés : étape à placer au plan quand le besoin sera daté.
- Typographie (étape 4), NFC des exports (étape 7), limites en signes (étape 8).

## Questions pour Sylvain

1. Fusionner les étapes 2 et 3 en « Droits », et renvoyer typographie, NFC des exports et limites en signes aux étapes qui s'en servent ?
2. ~~Rôles~~ : arbitré le 08/11/2026 (quatre rôles, les éditeurs invitent, un propriétaire transmissible).
3. Un éditeur peut-il retirer un autre éditeur, ou seulement ceux qu'il a invités ? (Proposition : tout accès sauf celui du propriétaire, comme en v1.)
4. Équipes : d'accord pour que le propriétaire d'un document puisse être, plus tard, une équipe (modèle Google), et pour que l'ADR de stockage de l'étape 6 le prévoie ?
5. En attendant la suggestion (étape 5), un correcteur ne peut que lire (y/hub le garantit) : d'accord ?
