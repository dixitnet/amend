# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 88343 signes envoyés, 3103 reçus (et 6170 de réflexion) ; réflexion `low` ; 12 s ; arrêt : stop
- Diff audité : `v2/` de `072558b` à `3fa435c` (14 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot back-office (rubrique Système) bien découpé : domaine pur, contrôle côté serveur, traductions complètes, tests présents aux deux niveaux. Les constats portent sur une clé de catalogue probablement erronée, une incohérence entre la date affichée et le numéro de version, et des points mineurs de coût et de robustesse. Rien de bloquant pour la sécurité : le refus est bien côté serveur.

## Constats
1. **[question]** Traductions — `v2/application/client/App.jsx:536` : le bouton de retour utilise `t('document.mesDocuments')`, alors que l'onglet des listes utilise `t('documents.mesDocuments')` (`App.jsx:253`). Si la clé `document.mesDocuments` n'existe pas dans les catalogues, le bouton affichera la clé brute (le test de complétude ne vérifie que les clés du catalogue source, pas les clés appelées). Vérifier et unifier sur `documents.mesDocuments`.
2. **[mineur]** Correction — `v2/application/serveur/index.js:129` : la date affichée est celle du dernier commit (`git log -1 HEAD`), alors que le numéro compte les fusions touchant `v2/`. Si le dernier commit ne touche pas `v2/`, la page affiche « 2.042 (abc1234, du <date d'un commit sans rapport>) ». Proposer de dater le dernier commit touchant `v2/` (`git log -1 --format=%cI -- v2`), ou d'assumer l'écart dans le libellé.
3. **[mineur]** Simplicité / performance — `v2/application/serveur/index.js:141` et `:175` : `administrateur(p)` interroge la base (`comptes.personne`) à chaque appel de `/api/moi`, donc à chaque chargement d'écran pour chaque personne, alors que l'administrateur est une adresse déjà connue. Si `personneDe` expose déjà le courriel, s'en servir ; sinon accepter le coût mais le noter.
4. **[question]** Sécurité — `v2/adaptateurs/postgres/comptes.js:528-529` : le tri essai / personnes se fait en SQL par `like '%.invalid'` (sensible à la casse en PostgreSQL), alors que le domaine utilise `/\.invalid$/i` (`v2/domaine/administration.js:8`). Si tous les courriels sont stockés normalisés en minuscules, c'est équivalent ; sinon les comptes d'essai seraient comptés comme personnes. À confirmer par la normalisation à l'écriture, ou aligner (par exemple `lower(courriel)`).
5. **[mineur]** Tests — `v2/tests/services/serveur.test.js:445` : l'assertion `s.version.numero === null || /^2\.\d{3,}$/` accepte les deux branches, donc elle passe que le dépôt soit git ou non ; elle ne vérifie pas ce qu'annonce le test (qu'un numéro est bien produit dans un dépôt). Ajouter une assertion distincte selon le contexte, ou tester `numeroDeVersion` côté unitaire uniquement (déjà fait) et vérifier ici seulement la forme de l'objet.
6. **[mineur]** Simplicité — `v2/application/serveur/index.js:125-128` : `git('-C', racine, …)` n'est utilisé que pour `rev-list`, alors que toutes les autres commandes s'exécutent depuis `cwd` (déjà dans le dépôt). Le `-C` est inutile et suggère une différence qui n'existe pas ; l'enlever pour l'homogénéité.

## Points de grille sans remarque
1 (couches respectées : domaine pur, design sans valeur, exploitation en script), 2, 3, 8, 10 (licences : aucune dépendance nouvelle).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

1. **Faux.** `document.mesDocuments` existe dans les deux catalogues (bouton « Mes documents » de l'écran d'un document). Le test de cohérence vérifie aussi que chaque clé appelée existe.
2. **Assumé.** Le commit affiché est celui qui est en service (HEAD), et la date est la sienne, ce qui est cohérent. Le numéro, lui, compte les fusions qui touchent la v2.
3. **Noté.** Une requête courte par appel de `/api/moi`. L'adresse n'est pas dans le jeton de session, et elle ne doit pas y être : elle peut changer. Le coût est négligeable à cette échelle.
4. **Juste, corrigé** par précaution : `lower(courriel)`. Les adresses sont déjà enregistrées en minuscules (`adresseCourriel`).
5. **Assumé.** La forme du numéro est vérifiée en test unitaire (`numeroDeVersion`). Le test du serveur doit aussi passer hors d'un dépôt git.
6. **Faux.** Le `-C racine` est nécessaire : le chemin `v2` d'un `rev-list` lancé depuis `application/serveur/` se lirait par rapport à ce dossier.

## Arbitrage de Sylvain

(À compléter.)
