# Audit partiel avant fusion (2026-11-10)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 88156 signes envoyés, 2095 reçus (et 1645 de réflexion) ; réflexion `low` ; 8 s ; arrêt : stop
- Diff audité : `v2/` de `076bebf` à `0b2d30a` (2 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse

Diff très court et prudent : en-têtes `cache-control` (assets empreintés gardés un an, le reste revalidé), types MIME pour le compilateur Typst et les polices, et un test de service qui couvre le comportement. L'approche reprend Docs comme exigé. Peu de risques ; deux points à éclaircir (la variable `prod` du test, la normalisation du chemin) et une petite lacune de couverture sur les nouveaux types MIME.

## Constats

1. **[question]** Grille 7 — `v2/tests/services/serveur.test.js:478`
   Le test utilise la variable `prod`, alors que le test précédent (ligne 472) utilise `dev` ; le diff ne montre pas sa définition. Si `prod` n'existe pas dans ce fichier, le test échoue ou en teste un autre serveur que celui voulu. À vérifier avant fusion.
2. **[mineur]** Grille 7 — `v2/application/serveur/index.js:82-84`
   Les nouveaux types `.ttf`, `.svg` et `.png` ne sont couverts par aucun test (seul `.wasm` l'est, `serveur.test.js:480`). Un renommage ou une faute de frappe dans la table `TYPES` ne serait pas vu. Proposer d'étendre la boucle du test aux quatre types.
3. **[question]** Grille 6 — `v2/application/serveur/index.js:329`
   `relatif.startsWith(ASSETS)` suppose que `relatif` est un chemin décodé et normalisé avant le test ; le diff ne montre pas comment `relatif` est obtenu (décodage des `%2e%2e`, suppression des `..`). Si un chemin comme `/assets/%2e%2e/index.html` arrivait décodé en `/assets/../index.html`, il ne serait pas sous `/assets/` après jointure mais serait quand même servi avec `no-cache` — pas de fuite grâce à la garde de la ligne 323, mais le comportement de cache serait incohérent. À confirmer sur le code existant, hors diff.
4. **[mineur]** Grille 6 — `v2/application/serveur/index.js:334`
   Le 404 pour un asset absent renvoie du JSON via `json()`, donc avec `cache-control: no-store` : c'est correct et évite de mettre en cache l'erreur, rien à changer — je le note seulement pour confirmer que ce cas limite a bien été pensé (test présent ligne 487-489).

## Points de grille sans remarque

1, 2, 3, 4 (partiellement, cf. A3), 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. _Faux_ : `prod` est le serveur « en ligne » démarré dans `before()` (`tests/services/serveur.test.js`, `prod = await demarrer({ dev: false, cookieSecure: true })`), celui dont on veut vérifier les en-têtes.
2. _Juste_, corrigé : le test vérifie aussi `.ttf`, `.svg` et `.png`.
3. _Faux_ : `relatif` est `normalize(chemin)` (ligne précédente de `servirFichier`) ; `/assets/../index.html` devient `/index.html` avant le test, servi en `no-cache`, ce qui est cohérent.
4. Hors sujet (confirmation) : le 404 passe par `json()` en `no-store`, voulu.

## Arbitrage de Sylvain

(À compléter.)
