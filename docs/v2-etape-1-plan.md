# amend.ink v2 : plan de l'étape 1, « Squelette »

Statut : **ouverture** (07/11/2026), soumis à la revue d'architecture de Mistral puis à l'accord de Sylvain. Rien n'est développé avant.

Références : `docs/v2-regles-developpement.md` (règles), `v2/adr/` (décisions), § 8 des règles (ordre de reconstruction).

## But

Faire tenir ensemble, dans `v2/`, les fondations de la v2 avec **le moins de code possible**, et poser dès le premier fichier les garde-fous de l'architecture (frontières entre couches, séparation design / technique, traductions). Mesurer la mémoire réelle de l'ensemble.

L'étape ne livre aucune fonction à des utilisateurs : ni comptes réels, ni droits, ni suivi des modifications, ni exports.

## Couches concernées

0 (plateforme), 1 (fondations, installées et épinglées), 7 (exploitation, en développement seulement), et l'ossature de 2 (adaptateurs), 5 (application), 6 (design) et `i18n/`.

## Contenu

1. **Projet `v2/` autonome** : son `package.json` (espaces de travail npm), son fichier de verrouillage, sa configuration ESLint et Prettier, ses commandes (`npm run lint`, `npm test`, `npm run format:check` dans `v2/`), sans rien importer de la v1 et sans être importé par elle. La racine du dépôt ignore `v2/` dans ses propres contrôles.
2. **Fondations épinglées** (versions exactes du moment, relevées à l'installation) : `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`, `@y/y`, `@y/prosemirror`, `@y/protocols`, `@y/websocket`, `@y/hub`, React, Vite.
3. **Garde-fous du lint, actifs avant tout autre code** :
   - frontières entre dossiers (`domaine/` n'importe rien ; une fondation n'est importée que dans `adaptateurs/<fondation>/` ou `extensions/` pour BlockNote ; `design/` n'importe ni adaptateur ni application ; `application/` n'importe aucune fondation) ;
   - pas d'attribut `style` ni d'import de feuille de style hors de `design/` ;
   - pas de chaîne littérale dans le rendu (textes par `i18n/`).
4. **Adaptateurs minimaux** :
   - `adaptateurs/blocknote/` : création d'un éditeur collaboratif lié à un document Yjs 14 et à un fournisseur WebSocket, dictionnaire français de BlockNote branché ;
   - `adaptateurs/yhub/` : démarrage de y/hub (serveur et worker dans un processus), greffon d'authentification **provisoire** (identité de développement, tous droits), à remplacer à l'étape 3.
5. **Application minimale** :
   - `application/serveur/` : Node, sert le client, ouvre une session de développement (identité factice, pas de courrier), répond à y/hub « qui est-ce » ;
   - `application/client/` : React ; un écran avec un document ; logique seulement, affichage délégué au design.
6. **Design minimal** : `design/jetons.css` (jeu clair et jeu sombre), thème BlockNote et Mantine dérivé des jetons, un composant de présentation « page d'édition ».
7. **Traductions minimales** : `i18n/fr.json`, `i18n/en.json` (mêmes clés), module de formatage ICU, test de complétude.
8. **Exploitation de développement** : script de lancement local (PostgreSQL, Valkey ou Redis, y/hub, serveur, client) dans l'environnement en nuage ; script de préparation de l'environnement proposé à Sylvain une fois l'ensemble éprouvé.
9. **Tests** :
   - unitaires : module de traduction ;
   - bout en bout (Playwright) : deux navigateurs éditent le même document et convergent ; un document rechargé retrouve son contenu (persistance par y/hub).
10. **Mesures** : mémoire résidente de chaque processus (serveur, y/hub, PostgreSQL, Valkey) au repos, avec deux puis dix documents ouverts, et avec un document de la taille d'un livre ; temps d'ouverture d'un document.

## Critères de sortie

1. Deux navigateurs éditent le même document ; le contenu survit au redémarrage de tous les processus.
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
