# Audit partiel avant fusion (2026-11-11)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 185763 signes envoyés, 3114 reçus (et 6861 de réflexion) ; réflexion `low` ; 19 s ; arrêt : stop
- Diff audité : `v2/` de `a1549f1` à `bb92135` (15 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff ajoute le choix de l'apparence (modèle d'interface + couleur) au back-office, avec validation serveur, repli par défaut et traductions. La mécanique est correcte et bien testée côté serveur. Le principal écart est un lot qui touche à la fois la technique (application, serveur) et `v2/design/`, contrairement aux règles 5 et 20. On note aussi une logique de repli dupliquée entre le serveur et le client, un commentaire devenu faux, et quelques défenses « au cas où ».

## Constats
1. **[important]** Grille 1 (couches, règle 5/20) — `v2/application/serveur/index.js:21`, `v2/design/Cadre.jsx:48`, `v2/design/reglages.js:27`. Le lot touche à la fois la couche application (client, serveur, tests) et la couche design (`apparence.js`, `Cadre.jsx`, `reglages.js`, `feuilles/interface-atelier.css`) : la règle 20 impose des lots séparés, le design et la technique n'étant jamais mélangés. Proposer de découper : un lot design (apparence.js, reglages.js, Cadre, feuille, ADR) puis un lot application/serveur qui l'utilise — ou faire valider l'écart par Sylvain comme exception.
2. **[mineur]** Grille 3/4 (redondance) — `v2/application/serveur/index.js:195` et `v2/design/Cadre.jsx:49`. La règle de repli « nom connu sinon défaut » est écrite deux fois (`apparenceRetenue` côté serveur, conditions équivalentes dans `CadreDesign`). Une fonction pure `retenir(valeur)` dans `design/apparence.js` (qui se veut lisible par le serveur) éviterait la divergence si la liste change.
3. **[mineur]** Grille 4 (option « au cas où ») — `v2/application/client/App.jsx:851`. `apparence?.modeles ?? []` : à ce point du rendu, `apparence` est garanti non nul (garde de chargement ligne 789) ; le `?.` et le `?? []` sont du code défensif mort. Simplifier en `apparence.modeles`.
4. **[mineur]** Grille 6/11 (documentation) — `v2/design/reglages.js:26`. Le commentaire renvoie à `feuilles/esthetique-atelier.css`, renommée `interface-atelier.css` dans ce même diff. Corriger la référence.
5. **[mineur]** Grille 6 — `v2/application/serveur/index.js:307`. `GET /api/admin/apparence` lit `comptes.reglage` sans rattrapage, alors que `GET /api/config` (ligne 227) prévoit l'erreur de base. Si le gestionnaire de route ne convertit pas les rejets en 500, la requête peut rester sans réponse ; harmoniser ou vérifier le comportement.
6. **[question]** Grille 7 — `v2/contrats/pile/pile.test.js:149`. Le contrat de pile ne teste que l'apparence par défaut ; rien ne vérifie qu'une apparence choisie (par ex. `origine` sans feuille, ou une autre couleur) change bien l'attribut racine et le thème. Est-ce volontairement reporté, ou un contrat manque-t-il ?
7. **[question]** Grille 7 — `v2/contrats/pile/pile.test.js:150`. Le test de pile suppose qu'aucun réglage `apparence` ne traîne dans sa base ; le test serveur nettoie le sien (ligne 623) mais rien ne garantit l'état de la base de la pile. À confirmer (base neuve par essai ?).

## Points de grille sans remarque
8, 9 (les textes passent par les catalogues, avec l'exception `admin.couleurs.violet` justifiée par l'identité fr/en), 10 (aucune dépendance nouvelle).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

Lot : rubrique « Apparence » du back-office (modèle d'interface et couleur de l'instance), demandée par Sylvain le 11/11/2026. Contrôles après corrections : `lint` et `format:check` propres ; 313 tests rapides, 312 passés, 1 sauté (essai réel de Margo) ; 60 parcours de la pile, 59 passés, 1 sauté (idem) ; essai dans le navigateur avec un compte administrateur de développement : choix « Origine » et « Pétrole » appliqué tout de suite, puis lu par un autre compte qui ouvre un document (interface `origine`, couleur `#0b7285`), retour à Atelier et vermillon.

1. **Juste : question pour Sylvain.** La règle 20 sépare les lots de design et les lots techniques. La demande (« page de réglage du backoffice : modèle d'interface + couleur ») demande les deux : le design (les couleurs, le cadre qui les applique) et la technique (réglage en base, routes, page du back-office). Je les ai livrés ensemble, en deux parties lisibles du même diff ; Sylvain dit si l'exception lui convient ou s'il veut deux commits séparés à l'avenir.
2. **Juste, corrigé.** Une seule fonction, `apparenceRetenue`, dans `design/apparence.js` (sans Mantine), utilisée par le serveur et par `CadreDesign`.
3. **Faux.** Quand la lecture de la rubrique échoue (`erreurApparence`), `apparence` reste `null` ; les arguments de `ligneApparence` sont évalués avant le choix entre message d'erreur et liste : sans `?.`, la page entière tomberait au lieu d'afficher l'erreur de la seule rubrique (même principe que la rubrique IA, audit du 11/11/2026, 3).
4. **Juste, corrigé.**
5. **Faux.** Le serveur rattrape tout rejet d'une route et répond 500 `erreur-interne` (`application/serveur/index.js`, « Le reste est une erreur à nous : 500 ») ; `/api/config` a un repli parce qu'il sert à tous et ne doit pas bloquer l'ouverture de l'application, le back-office peut afficher son erreur.
6. **Juste, reporté.** La pile n'a pas de compte administrateur (les comptes de développement ne peuvent pas l'être, règle du domaine) ; le choix est vérifié par le test du serveur (routes, configuration, valeur retirée) et par l'essai dans le navigateur ci-dessus. Un parcours de pile avec administrateur demanderait un moyen d'en créer un dans la pile : à faire si Sylvain le juge utile.
7. **Vérifié.** Le seul test qui écrit le réglage (`tests/services/serveur.test.js`) le retire avant et après lui ; l'essai manuel l'a remis à la valeur par défaut. Le contrat 5 échouerait de façon visible si un réglage traînait.

Résumé : deux corrections (fonction unique, commentaire), une exception à la règle 20 soumise à Sylvain.

## Arbitrage de Sylvain

(À compléter.)
