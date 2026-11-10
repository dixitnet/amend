# Audit partiel avant fusion (2026-11-10)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 97144 signes envoyés, 1975 reçus (et 6763 de réflexion) ; réflexion `low` ; 12 s ; arrêt : stop
- Diff audité : `v2/` de `30219da` à `3aec598` (9 fichiers)
- Statut : avis reçu ; répondu par Claude ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot d'exploitation et d'en-têtes de sécurité, conforme dans l'ensemble aux règles : en-têtes calqués sur Docs et justifiés, sauvegarde/restauration prudentes (écriture à côté puis renommage, essai avant restauration, transaction unique). Trois points à regarder : une fenêtre où `dist/` n'existe pas pendant le déploiement (contraire au commentaire), le mécanisme `git archive` d'une branche qui doit contenir un dossier ignoré par Git, et le chemin de sortie de Vite à vérifier.

## Constats
1. **[mineur]**, grille 6, `v2/exploitation/prod/deployer.sh:35-37` — Le commentaire (lignes 22-23) promet que le serveur « ne sert jamais un dossier vide ni à moitié écrit », mais entre `mv dist dist.ancien` et `mv dist.neuf dist`, `dist/` n'existe pas : une requête dans cet intervalle reçoit une erreur. Proposer un échange par lien symbolique (`ln -sfn` + `mv -T`) ou deux `mv` consécutifs réduits au strict minimum documentés comme tels.
2. **[question]**, grille 6, `v2/exploitation/prod/deployer.sh:28` — `git -C .. archive "$AMEND_LIVRAISON" v2/dist` suppose que la branche `livraison` contient `v2/dist`, alors que `v2/.gitignore:2` ignore `dist/`. La CI doit donc forcer l'ajout (`git add -f`) ; je ne peux pas vérifier ce flux ici. À confirmer que le workflow GitHub Actions commet bien `v2/dist` dans cette branche, sinon le déploiement échoue.
3. **[question]**, grille 6, `v2/exploitation/prod/deployer.sh:33` — `--outDir ../../dist.neuf` : selon la racine du projet Vite (v2/ ou un sous-dossier), ce chemin peut atterrir hors de `v2/`, alors que le `mv dist.neuf dist` suivant (ligne 37) et `v2/.gitignore:3` attendent `v2/dist.neuf`. À vérifier sur un déploiement réel.
4. **[mineur]**, grille 4, `v2/tests/en-ligne/en-ligne.test.js:63-65` — `/api/config` est interrogée deux fois (une fois pour l'en-tête CSP, une fois pour le corps). Réutiliser la réponse de la ligne 63 suffirait ; sans gravité.

## Points de grille sans remarque
1, 2, 3, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

- **1 : juste en partie, mineur.** Le dossier manque bien entre les deux renommages, mais quelques microsecondes, au lieu de toute la construction auparavant ; le commentaire promettait trop : corrigé (`deployer.sh`, et de même `deploy/deploy.sh`). Un lien symbolique rendrait l'échange atomique, au prix d'un changement de montage du dossier servi : pas justifié à cette échelle.
- **2 : faux.** Le flux `livraison` commite dans un arbre de travail de la branche `livraison`, qui n'a pas de `.gitignore` : `v2/dist` y entre sans `-f`. Vérifié par simulation du flux (deux passages, puis extraction côté VPS : `git ls-tree` montre `v1/dist/…`, `v2/dist/…`, `COMMIT`).
- **3 : faux.** La racine de Vite est `application/client` (`v2/vite.config.js:5`) : `../../dist.neuf` est `v2/dist.neuf`. Vérifié par une construction.
- **4 : juste, mineur.** La réponse est réutilisée (`v2/tests/en-ligne/en-ligne.test.js`).

## Arbitrage de Sylvain

(À compléter.)
