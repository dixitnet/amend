# Revue de clôture de l’étape 1 (2026-11-07)

- Relecteur : Mistral, modèle `mistral-large-latest` ; consommation : 39381 jetons en entrée, 743 en sortie
- Pièces : `docs/v2-regles-developpement.md`, `docs/v2-renoncements.md`, `docs/v2-veille.md`, `v2/adr/0001-architecture-docs-allege.md`, `v2/adr/0002-couches.md`, `v2/adr/0003-blocknote.md`, `v2/adr/0004-yhub.md`, `v2/adr/0005-connexion.md`, `v2/adr/0006-licence.md`, `v2/adr/0007-relecteur-ia.md`, `v2/adr/0008-design.md`, `v2/adr/0009-traductions.md`, `docs/v2-etape-1-plan.md`, `Arborescence de v2/ (fichiers suivis)`, `v2/package.json`, `Diff de v2/ depuis 4421e21`
- Commit relu : `6c41087` (depuis `4421e21`)
- Statut : avis reçu ; réponse de Claude écrite ; arbitré par Sylvain le 07/11/2026.

## Avis du relecteur

## Synthèse
L'étape 1 est **techniquement prête à être close** : tous les critères de sortie sont atteints, l'architecture est respectée, et les tests (contrats, frontières, traductions) couvrent les points critiques. La mémoire mesurée confirme qu'une machine de 1 Go suffit pour la v2, ce qui lève le renoncement examiné.

Quelques ajustements **mineurs** sont proposés (R1 à R4), et deux **questions** (R5, R6) méritent une décision avant clôture. Aucun bloquant.

## Constats
**R1 [mineur, 1]** `v2/adaptateurs/yjs/index.js` : L'adaptateur Yjs expose `RACINE_TEXTE` comme constante publique, alors que cette valeur est une implémentation interne de BlockNote (le nom du type racine Yjs). **Proposition** : la déplacer dans `adaptateurs/blocknote/serveur.js` (lecture côté serveur) et la passer en paramètre à `ouvrirDocument()` si nécessaire.

**R2 [mineur, 2]** `v2/application/serveur/session.js` : La fonction `lireCookie()` ne gère pas les cookies encodés en URL (ex: `nom=Jean%20Dupont`). **Proposition** : utiliser `decodeURIComponent()` sur la valeur du cookie.

**R3 [mineur, 5]** `v2/adaptateurs/yhub/index.js` : Le greffon d'authentification refuse toute connexion sans session, mais ne vérifie pas que l'identité retournée par le serveur (`identifier`) correspond bien à celle attendue par y/hub (le `userid` doit être une chaîne non vide). **Proposition** : ajouter `if (!personne?.userid) throw apiError(401, 'identité invalide')` après la résolution de `identifier()`.

**R4 [mineur, 6]** `v2/contrats/pile/pile.test.js` : Le test de convergence entre deux navigateurs utilise une attente fixe (`await attendre(400)`), ce qui peut échouer sur des machines lentes. **Proposition** : remplacer par une attente active avec timeout (comme dans `attendreTexte()`).

**R5 [question, 4]** `v2/application/serveur/index.js` : La route `/api/dev/session` normalise le nom en NFC (règle 15), mais ne vérifie pas que le nom résultant est non vide après normalisation (ex: `"\u0301"` → `""`). **Proposition** : soit ajouter une vérification, soit documenter dans `v2-renoncements.md` que les noms vides sont acceptés en développement.

**R6 [question, 8]** `v2/package.json` : Aucune dépendance nouvelle n'a été ajoutée depuis le relevé du 07/11/2026, mais les licences des dépendances transitives de `@y/hub` (uWebSockets.js, AGPL-3.0) et `@blocknote/mantine` (Mantine, MIT) n'ont pas été vérifiées. **Proposition** : ajouter une entrée dans `docs/v2-veille.md` pour suivre les licences des dépendances transitives critiques.

## Points de grille sans remarque
3, 7, 9, 10, 11.

## Réponse de Claude

- **R1 (`RACINE_TEXTE` dans l'adaptateur Yjs)** : *contesté*. Le nom du type racine (`doc`) n'est pas un détail interne de BlockNote : c'est notre choix, fait à l'endroit où le document Yjs est créé (adaptateur Yjs). L'adaptateur de lecture côté serveur reprend la même valeur par défaut ; une divergence ferait échouer le contrat 2 (lecture côté serveur), qui la surveille. Déplacer la constante obligerait un adaptateur à en importer un autre, ce que les règles interdisent.
- **R2 (décodage URL du cookie)** : *contesté*. La valeur du cookie est notre jeton, en base64url suivi d'un point et d'une signature : elle ne contient jamais de caractère encodé. La décoder ouvrirait au contraire une ambiguïté (deux écritures pour un même jeton).
- **R3 (identité retournée sans `id`)** : *corrigé*. Le greffon de y/hub refuse désormais toute identité dont l'`id` n'est pas une chaîne non vide (`v2/adaptateurs/yhub/index.js`).
- **R4 (attente fixe dans un contrat)** : *corrigé*. L'attente fixe de 400 ms (test de persistance, pas de convergence) est remplacée par une attente active : on relit le document côté serveur jusqu'à y trouver la dernière frappe, avec un délai maximal.
- **R5 (nom vide après normalisation)** : *contesté*. La route vérifie déjà que le nom n'est pas vide après normalisation NFC et suppression des espaces (`nom-absent`). Un nom fait d'un seul signe combinant reste non vide : il est accepté, ce qui est sans conséquence sur une route de développement, supprimée à l'étape 6 au profit du lien magique.
- **R6 (licences des dépendances transitives)** : *corrigé autrement*, avec une correction de fait. uWebSockets.js est sous **Apache-2.0**, pas sous AGPL-3.0 (fichier `LICENSE` et `package.json` du paquet installé). Plutôt qu'une entrée de veille, un contrat vérifie désormais la licence de **toutes** les dépendances installées, directes et transitives, contre une liste de licences compatibles avec l'AGPL-3.0 (`v2/contrats/statiques/licences.test.js`) : MIT, ISC, BSD, Apache-2.0, MPL-2.0, BlueOak, Unlicense, et l'AGPL de y/hub. Une licence nouvelle fera échouer `npm test` à la prochaine montée de version.

Contrôles après corrections : `npm run lint`, `npm run format:check`, `npm test` (13 sur 13), `npm run test:pile` (5 sur 5).

## Arbitrage de Sylvain

07/11/2026 : réponses validées (R3, R4, R6 corrigés ; R1, R2, R5 contestés) ; étape 1 close ; fusion dans `main` acceptée. Défaut de police de BlockNote : pas de signalement en amont pour l'instant (à réexaminer à la prochaine montée de version).
