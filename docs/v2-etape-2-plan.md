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

- **Établi** (décisions de produit, v1 et ADR 0001) : trois rôles, éditeur, correcteur, lecteur ; le serveur décide, y/hub applique ; un rôle inconnu vaut le plus restrictif ; aucun rôle, aucun accès.
- **Pas encore utilisable** à cette étape : la suggestion (étape 5) et les commentaires (étape 5). Tant qu'ils n'existent pas, un correcteur et un lecteur ont les mêmes droits effectifs : **lire**. Les capacités `suggerer` et `commenter` sont déclarées dans le domaine (elles définissent les rôles) mais ne sont branchées sur rien avant l'étape 5.
- **Pas établi** : où et comment sont enregistrés les comptes, les documents et les accès (base, fichiers…). C'est l'objet de l'étape 6, avec son ADR. À cette étape, la table des accès est **provisoire, en mémoire**, alimentée par une route de développement ; elle est remplacée à l'étape 6 sans changer l'interface que le serveur offre à y/hub.

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
2. En attendant la suggestion (étape 5), un correcteur a les droits d'un lecteur : d'accord ?
