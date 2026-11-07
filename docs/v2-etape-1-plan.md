# amend.ink v2 : plan de l'étape 1, « Squelette »

Statut : **close** le 07/11/2026 (revue de clôture arbitrée par Sylvain : `docs/v2-revues/2026-11-07-etape-1-cloture.md`) ; ouverte le même jour (revue d'ouverture : `docs/v2-revues/2026-11-07-etape-1-ouverture.md`, arbitrée par Sylvain).

Références : `docs/v2-regles-developpement.md` (règles), `v2/adr/` (décisions), § 8 des règles (ordre de reconstruction).

## But

Faire tenir ensemble, dans `v2/`, les fondations de la v2 avec **le moins de code possible**, et poser dès le premier fichier les garde-fous de l'architecture (frontières entre couches, séparation design / technique, traductions). Mesurer la mémoire réelle de l'ensemble.

L'étape ne livre aucune fonction à des utilisateurs : ni comptes réels, ni droits, ni suivi des modifications, ni exports.

## Couches concernées

0 (plateforme), 1 (fondations, installées et épinglées), 7 (exploitation, en développement seulement), et l'ossature de 2 (adaptateurs), 5 (application), 6 (design) et `i18n/`.

## Contenu

1. **Projet `v2/` autonome** : son `package.json` (espaces de travail npm), son fichier de verrouillage, sa configuration ESLint et Prettier, ses commandes (`npm run lint`, `npm test`, `npm run format:check` dans `v2/`), sans rien importer de la v1 et sans être importé par elle. La racine du dépôt ignore `v2/` dans ses propres contrôles.
2. **Fondations épinglées**, en versions exactes, choisies pour être compatibles entre elles d'après les dépendances qu'elles déclarent (relevé du 07/11/2026, revue R2) :

   | Paquet | Version | Licence | Exige |
   |---|---|---|---|
   | `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine` | 0.57.0 | MPL-2.0 | `@y/y` ^14.0.0-rc.26, `@y/prosemirror` ^2.0.0-15, `@y/protocols` ^1.0.6-rc.1, `lib0` 1.0.0-rc.36 ; React 18 ou 19 ; `@mantine/core` 8.3 ou 9 |
   | `@y/hub` | 0.10.1 | **AGPL-3.0** ou commerciale : nous l'utilisons sous AGPL-3.0, sans licence commerciale, ce qui est compatible avec l'AGPL-3.0 de la v2 (revue R5) | `@y/y` ^14.0.0-rc.29, `@y/protocols` ^1.0.6-rc.1, `lib0` ^1.0.0-rc.36 |
   | `@y/y` | 14.0.0-rc.29 | MIT | la seule version qui satisfait BlockNote **et** y/hub ; c'est aussi celle de l'adaptateur y/hub de Docs |
   | `@y/prosemirror` | 2.0.0-15 | MIT | `@y/y` ^14.0.0-rc.26 |
   | `@y/protocols` | 1.0.6-rc.1 | MIT | — |
   | `@y/websocket` (fournisseur côté navigateur) | 4.0.0-rc.5 | MIT | `@y/y` |
   | `lib0` | 1.0.0-rc.36 | MIT | — |
   | React, Vite, `@mantine/core` | dernières versions stables à l'installation | MIT | — |

   `@blocknote/core` déclare aussi Yjs 13 et y-prosemirror 1.x (sa collaboration historique) : ils peuvent se retrouver installés, mais la v2 n'importe que `@y/y` (vérifié par un contrat, ci-dessous).
3. **Garde-fous du lint, actifs avant tout autre code** :
   - frontières entre dossiers (`domaine/` n'importe rien ; une fondation n'est importée que dans `adaptateurs/<fondation>/` ou `extensions/` pour BlockNote ; `design/` n'importe ni adaptateur ni application ; `application/` n'importe aucune fondation) ;
   - pas d'attribut `style` ni d'import de feuille de style hors de `design/` ;
   - pas de chaîne littérale dans le rendu (textes par `i18n/`).
4. **Adaptateurs minimaux** :
   - `adaptateurs/blocknote/` : création d'un éditeur collaboratif lié à un document Yjs 14 et à un fournisseur WebSocket, dictionnaire français de BlockNote branché ;
   - `adaptateurs/yhub/` : démarrage de y/hub (serveur et worker dans un processus), greffon d'authentification **provisoire** : il demande l'identité à notre serveur et **refuse toute connexion sans session valide** (revue R3) ; une session de développement reçoit tous les droits, en attendant les vrais droits de l'étape 3.
5. **Application minimale** :
   - `application/serveur/` : Node, sert le client, ouvre une session de développement (identité factice, pas de courrier), répond à y/hub « qui est-ce » ;
   - `application/client/` : React ; un écran avec un document ; logique seulement, affichage délégué au design.
6. **Design minimal** : `design/jetons.css` (jeu clair et jeu sombre), thème BlockNote et Mantine dérivé des jetons, un composant de présentation « page d'édition » réduit à un **conteneur générique** (en-tête, zone de document) qui reçoit l'éditeur en emplacement, sans rien connaître de BlockNote (revue R4). L'apparence de l'éditeur lui-même (barre, menus) reste celle de BlockNote, habillée par le thème, jusqu'à l'étape 4.
7. **Traductions minimales** : `i18n/fr.json`, `i18n/en.json` (mêmes clés), module de formatage ICU, test de complétude. Les textes anglais sont de **vraies traductions**, jamais des textes d'attente (« TODO », vide, texte français recopié) ; un texte identique dans les deux langues n'est admis que s'il figure dans une courte liste d'exceptions (par exemple « amend.ink ») ; le test le vérifie (revue R7).
8. **Exploitation de développement** : script de lancement local (PostgreSQL, Valkey ou Redis, y/hub, serveur, client) dans l'environnement en nuage ; script de préparation de l'environnement proposé à Sylvain une fois l'ensemble éprouvé.
9. **Tests** :
   - unitaires : module de traduction (formatage, pluriel, repli sur le français, complétude) ;
   - **contrats** (`v2/contrats/`, revue R6), ce dont nous dépendons et rien d'autre :
     1. une seule copie de `@y/y` est importée par la v2 (aucun import de `yjs` 13) ;
     2. BlockNote et Yjs 14 : un contenu écrit par un éditeur est relu à l'identique par un second éditeur lié au même document Yjs ; le même contenu se lit côté serveur en blocs (`@blocknote/server-util`) ;
     3. le dictionnaire français de BlockNote existe et est appliqué ;
     4. y/hub : une connexion sans session est refusée ; une connexion avec session écrit ; le document persiste après le redémarrage de y/hub (worker compris) ;
     5. les jetons de design atteignent le thème de BlockNote (une couleur de jeton changée se retrouve dans l'éditeur) ;
   - bout en bout (Playwright) : deux navigateurs éditent le même document et convergent ; un document rechargé retrouve son contenu.
10. **Mesures** : mémoire résidente de chaque processus (serveur, y/hub, PostgreSQL, Valkey) au repos, avec deux puis dix documents ouverts, et avec un document de la taille d'un livre ; temps d'ouverture d'un document.

## Critères de sortie

1. Deux navigateurs éditent le même document ; le contenu survit au redémarrage de tous les processus ; les contrats 1 à 5 sont verts, dont le refus d'une connexion sans session.
2. Le lint refuse : un import de fondation hors de son adaptateur, un attribut `style` dans `application/`, une chaîne littérale dans un rendu (vérifié par des cas d'essai volontaires).
3. Aucun texte ni style en dur dans le code produit ; catalogues `fr` et `en` complets.
4. Mémoire mesurée et consignée, avec une recommandation de taille de machine.
5. Revue de clôture de Mistral traitée ; accord de Sylvain.

## Hors périmètre

Comptes réels et lien magique (étape 6), droits et rôles (étape 3), mode suggestion et commentaires (étape 5), notes de bas de page et typographie (étape 4), exports (étape 7), IA (étape 8), mise en production.

## Renoncements à examiner

1. La petite machine actuelle (1 Go) pour la v2 : décision après mesure.
2. Le serveur WebSocket maison et le compactage de la v1 : remplacés par y/hub.

## Risques

1. Fondations en pré-version (`@y/y` 14 rc, `@y/prosemirror` 2 rc, `@y/hub` 0.x, BlockNote 0.x) : incompatibilités entre leurs versions ; on retient les versions qu'utilise BlockNote.
2. y/hub dépend d'un binaire natif (uWebSockets.js) récupéré depuis GitHub : installation à vérifier dans l'environnement.
3. Outils de lint : la règle « pas de chaîne littérale » peut être bruyante ; on la règle au plus juste plutôt que de la désactiver.

## Résultat (07/11/2026)

### Critères de sortie

1. **Atteint.** Deux navigateurs éditent le même document et convergent ; le contenu survit au redémarrage du serveur et de y/hub (relu depuis PostgreSQL) ; contrats 1 à 5 verts, dont le refus d'une connexion sans session ou avec une session falsifiée (`npm run test:pile`, 5 sur 5).
2. **Atteint.** Le lint refuse un import de fondation hors de son adaptateur, un mélange de couches, un attribut `style` ou une feuille de style dans le code technique, un texte en dur dans un rendu (`tests/unitaires/frontieres.test.js`). Ce test a révélé que les fichiers `.jsx` échappaient au lint (ESLint ne les lit que si on les déclare) et qu'un motif `yjs` prenait le dossier `adaptateurs/yjs/` pour le paquet : corrigés.
3. **Atteint.** Aucun texte ni style en dur dans le code produit ; catalogues `fr` et `en` complets, sans texte d'attente ; l'interface suit la langue du navigateur.
4. **Atteint.** Mémoire mesurée (ci-dessous).
5. **Revue de clôture reçue et traitée** (`docs/v2-revues/2026-11-07-etape-1-cloture.md` : 3 constats corrigés, 3 contestés, dont une erreur de fait sur la licence de uWebSockets.js) ; accord de Sylvain donné le 07/11/2026.

### Mémoire (PSS, Mo ; environnement en nuage de Claude, PostgreSQL 16 et Redis 7.0 avec leurs réglages par défaut)

| Situation | Serveur | y/hub | PostgreSQL | Redis | Total |
|---|---|---|---|---|---|
| Au repos | 29 | 90 | 47 | 6 | **171** |
| 2 documents ouverts | 30 | 116 | 47 | 6 | **199** |
| 10 documents ouverts | 36 | 129 | 49 | 6 | **219** |
| Plus un livre de 500 000 signes (1 000 paragraphes) | 38 | 148 | 51 | 11 | **248** |
| Le livre ouvert par une seconde personne (ouverture en 0,3 s) | 32 | 169 | 53 | 11 | **265** |

**Recommandation** : la pile v2 tient dans **environ 300 Mo** à l'échelle d'aujourd'hui, nettement moins que les 2 à 4 Go envisagés dans l'étude. Une machine de 1 Go (celle de la v1, qui disparaîtrait) suffit en principe ; 2 Go donnent de la marge pour les pointes (compactage d'un gros document par les fils de calcul de y/hub, plusieurs livres ouverts), qui ne sont pas mesurées ici. Le renoncement « petite machine » n'est donc pas nécessaire : décision à prendre avant la mise en ligne, après une mesure des pointes.

### Constats en chemin

1. **BlockNote 0.57** : l'option `fontFamily` du thème n'a aucun effet (la variable `--bn-font-family` n'est utilisée par aucune règle CSS). Contourné dans `design/styles.css` par les classes publiques, sans toucher la fondation ; noté dans `docs/v2-veille.md` et surveillé par le contrat des jetons.
2. **npm installe aussi Yjs 13** (déclaré par BlockNote pour sa collaboration historique) : le contrat 1 vérifie qu'aucun fichier de la v2 ne l'importe.
3. **Persistance** : y/hub écrit dans PostgreSQL après un délai réglable (`V2_DELAI_PERSISTANCE`, 2 s en développement) ; entre-temps, le contenu est dans Redis.
