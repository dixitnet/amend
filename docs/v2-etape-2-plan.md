# amend.ink v2 : plan de l'étape 2, « Droits »

Statut : **ouverture** (08/11/2026), soumis à la revue de Mistral et à l'arbitrage de Sylvain. Rien n'est développé avant.

Références : `docs/v2-regles-developpement.md` (dont « Avant de proposer un développement ou un correctif »), `docs/v2-procedure-tests.md`, `v2/adr/`.

## Changement proposé au plan des étapes

Le § 8 des règles prévoyait une étape 2 « Domaine » (rôles, typographie, NFC, limites en signes) puis une étape 3 « Droits et collaboration ». Appliquée à ce découpage, la règle « bon moment, besoin établi » donne :

| Règle du domaine | Qui s'en sert | Quand |
|---|---|---|
| rôles et capacités | le serveur (décision des droits) et l'adaptateur y/hub (permissions) | **maintenant** |
| typographie française | l'extension de l'éditeur | étape 4 |
| NFC des textes exportés | les exports | étape 7 (la NFC des noms existe déjà, `domaine/personne.js`) |
| limites en signes | l'IA | étape 8 |

Écrire maintenant la typographie, la NFC des exports et les limites en signes, ce serait du code sans utilisateur, figé avant de connaître le besoin réel de l'étape qui s'en servira. **Proposition** : fusionner les étapes 2 et 3 en une étape « Droits » ; chaque autre règle du domaine est écrite à l'étape qui la consomme, avec ses tests.

## But

Que chaque personne n'ait, sur chaque document, que les droits de son rôle, décidés par notre serveur et appliqués par y/hub, et que ce soit vérifié à chaque couche.

## Ce qui est établi, et ce qui ne l'est pas

- **Établi** (décisions de produit, v1 et ADR 0001) : le serveur décide, y/hub applique ; un rôle inconnu vaut le plus restrictif ; aucun rôle, aucun accès. Les rôles eux-mêmes : voir « Ce que les briques font déjà » (proposition : éditeur et correcteur, le lecteur abandonné).
- **Pas encore utilisable** à cette étape : la suggestion (étape 5) et les commentaires (étape 5). Tant qu'ils n'existent pas, un correcteur et un lecteur ont les mêmes droits effectifs : **lire**. Les capacités `suggerer` et `commenter` sont déclarées dans le domaine (elles définissent les rôles) mais ne sont branchées sur rien avant l'étape 5.
- **Pas établi** : où et comment sont enregistrés les comptes, les documents et les accès (base, fichiers…). C'est l'objet de l'étape 6, avec son ADR. À cette étape, la table des accès est **provisoire, en mémoire**, alimentée par une route de développement ; elle est remplacée à l'étape 6 sans changer l'interface que le serveur offre à y/hub.

## Ce que les briques font déjà, et nos écarts

Demande de Sylvain (08/11/2026) : faire le moins de spécifique possible, quitte à abandonner un rôle (le lecteur, par exemple).

### Ce qui est déjà intégré

| Brique | Ce qu'elle sait faire, sans code de notre part |
|---|---|
| **y/hub** | Permissions par **document et par branche** (`{org, docid, branch}`), chacune décidée par notre serveur à la connexion : contenu (`ydoc` : lire, écrire), présence (`awareness` : voir, publier), historique (à partir d'une date, retour arrière, versions nommées), suppression, routes (WebSocket, lecture REST). Il applique lui-même : une écriture sans le droit n'est pas acceptée. |
| **BlockNote** | Éditeur modifiable ou en **lecture seule** ; **mode suggestion** (voir ou écrire les suggestions, accepter, rejeter), branché sur un document de suggestions distinct ; **commentaires** avec deux rôles natifs : `comment` (créer un fil, répondre, résoudre, réagir, modifier ses propres commentaires) et `editor` (en plus : supprimer un fil, supprimer le commentaire d'un autre). |
| **Docs** (référence, pas une dépendance) | Cinq rôles (lecteur, commentateur, éditeur, administrateur, propriétaire), traduits exactement en permissions de y/hub ; c'est la preuve que ce découpage tient en production. |

Conséquence clé : **le correcteur n'a besoin d'aucune vérification de notre part**. Il lit la branche principale et écrit dans la branche (ou le document) de suggestions : y/hub refuse le reste. La règle « le correcteur ne touche pas au texte accepté », qui demandait en v1 une analyse du texte côté serveur, devient une ligne de permissions.

### Proposition : deux rôles, tous deux natifs

| Rôle | Branche principale (y/hub) | Suggestions (y/hub) | Commentaires (BlockNote) | Éditeur (BlockNote) | Propre à amend.ink |
|---|---|---|---|---|---|
| **éditeur** | lire, écrire ; historique, retour arrière | lire, écrire ; accepter, rejeter | `editor` | modifiable ; mode suggestion au choix | inviter, gérer les accès, supprimer le document |
| **correcteur** | lire | lire, écrire | `comment` | mode suggestion imposé | — |

- **Le lecteur est abandonné** (proposition de Sylvain) : pas de rôle sans contribution. Lire un texte fini relève de la page publiée ; relire en commentant relève du correcteur. Si un besoin de « commentateur seul » apparaît, BlockNote et y/hub le savent déjà faire (lecture seule plus rôle `comment`) : on le rouvrira sans code nouveau.
- **Pas d'administrateur ni de propriétaire distincts** (Docs en a) : l'éditeur gère les accès. À rouvrir seulement si un besoin réel apparaît (plusieurs éditeurs qui ne doivent pas pouvoir s'exclure).

### Nos écarts, c'est-à-dire ce qui reste à écrire

1. **La table rôle → permissions** : une vingtaine de lignes dans le domaine, et sa traduction dans l'adaptateur y/hub (qui existe). C'est le seul code de droits.
2. **Inviter et gérer les accès** : aucune brique ne le fait (y/hub ne connaît ni comptes ni invitations). Étape 6.
3. **Où vivent les commentaires du correcteur**, qui ne peut pas écrire dans la branche principale : deux voies natives de BlockNote, à choisir à l'étape 5 : les fils écrits par notre serveur (`RESTYjsThreadStore`, la voie de Docs), ou stockés avec les suggestions. Aucun code de contrôle dans les deux cas.
4. **Imposer le mode suggestion au correcteur dans l'interface** : un réglage de l'éditeur ; la garantie, elle, vient de y/hub.

### Conséquence pour cette étape

Tant que les suggestions n'existent pas (étape 5), le correcteur ne peut que lire, et y/hub le garantit déjà. L'étape « Droits » se réduit donc à : la table des deux rôles (domaine), la réponse du serveur à y/hub selon ce rôle, et les tests qui prouvent qu'un correcteur ne peut pas écrire. Les permissions de la branche de suggestions et des commentaires seront ajoutées à la table à l'étape 5, quand elles auront un usage.

## Contenu, en lots d'une couche

1. **Domaine** (`domaine/droits.js`) : les rôles et leurs capacités, en codes (`lire`, `ecrire`, `suggerer`, `commenter`, `arbitrer`, `gerer`) ; `capacites(role)` (rôle inconnu → lecteur ; aucun rôle → rien) ; `acces(capacites)` : ce que la collaboration doit autoriser (`ecriture`, `lecture`, ou rien). Aucun libellé : les noms des rôles affichés passent par `i18n/`.
2. **Serveur** : la route interne `droits` répond d'après la table des accès et le domaine ; route de développement pour donner un rôle à une personne sur un document ; création d'un document en développement : la personne qui l'ouvre la première en devient éditrice.
3. **Adaptateur y/hub** : inchangé dans sa forme (il traduit déjà `ecriture` et `lecture`) ; vérifié par ses tests.
4. **Tests** (procédure par couches) :
   - T1 : table des rôles et des capacités, rôle inconnu, aucun rôle, traduction en accès ;
   - T3 : route des droits (rôle connu, inconnu, absent, document inconnu), route de développement fermée hors développement ;
   - T2 : y/hub applique le rôle décidé par le serveur (écriture refusée à un lecteur et à un correcteur) ;
   - T5 : deux navigateurs, un éditeur et un lecteur : la frappe du lecteur ne s'enregistre pas, et l'interface le lui dit (texte traduit).

## Critères de sortie

1. Un lecteur et un correcteur ne peuvent pas modifier un document, quelle que soit la façon de s'y prendre (interface, WebSocket directe, session forgée).
2. Les droits sont décidés à un seul endroit (le domaine, appelé par le serveur).
3. Tests T1 à T5 verts ; revue de clôture traitée.

## Hors périmètre, noté pour plus tard

- Suggestion et commentaires, et les droits qui s'y rattachent : étape 5.
- Historique visible à partir de la date d'accès (idée reprise de Docs) : étape 5, avec les versions.
- Stockage des comptes, documents et accès ; invitations ; lien magique : étape 6.
- Typographie (étape 4), NFC des exports (étape 7), limites en signes (étape 8).

## Questions pour Sylvain

1. Fusionner les étapes 2 et 3 en « Droits », et renvoyer typographie, NFC des exports et limites en signes aux étapes qui s'en servent ?
2. Deux rôles natifs, éditeur et correcteur, et **abandon du lecteur** (renoncement à inscrire au registre) ; pas d'administrateur ni de propriétaire distincts ?
3. En attendant la suggestion (étape 5), un correcteur ne peut que lire (y/hub le garantit) : d'accord ?
