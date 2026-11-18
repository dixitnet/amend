# Audit partiel avant fusion (2026-11-18)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 284106 signes envoyés, 2811 reçus (et 4001 de réflexion) ; réflexion `low` ; 47 s ; arrêt : stop
- Diff audité : `v2/` de `79a3bf0` à `a3d5266` (10 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff corrige deux défauts réels (adresse « undefined » dans les courriers de partage, impasse d'un lien de connexion déjà utilisé) au bon niveau : domaine pour la fonction pure, application pour la session, catalogues pour les textes. Les changements sont sobres et testés. Restent des points mineurs : un repli vide dans `nomAvecAdresse` qui peut produire un message mal formé, un test de pile qui ne couvre plus lui-même le cas sans session, et une requête `/api/moi` dont seule la validité HTTP est consultée.

## Constats
1. **[mineur]** Grille 6 (correction), `v2/domaine/partage.js:73` — Le repli final `?? ''` de `nomAvecAdresse` produit une chaîne vide quand ni le nom ni l'adresse ne sont connus ; le message devient «  vous invite sur le document… » (espace parasite, sujet sans auteur reconnaissable). Le cas est marginal (personne disparue de la base), mais le domaine rendrait mieux un repli explicite. Proposer de renvoyer le nom, sinon l'adresse, sinon `null` et de laisser l'appelant utiliser `t('courriel.quelquun')` comme pour `auteur` (`v2/application/serveur/comptes-acces.js:38`).
2. **[mineur]** Grille 7 (tests), `v2/tests/unitaires/partage.test.js:107` — Le nouveau test couvre « sans adresse », mais pas le cas « ni nom ni adresse » introduit par le même changement de `nomAvecAdresse` (`v2/domaine/partage.js:73`). Ajouter l'assertion du repli choisi au constat 1.
3. **[question]** Grille 7 (tests), `v2/contrats/pile/comptes.test.js:67` — Le commentaire renvoie le cas « lien invalide sans session » à `pannes.test.js`, qui n'est pas dans le diff ; je ne peux pas vérifier que ce parcours (message « Ce lien de connexion n'est plus valable ») reste bien couvert ailleurs. À confirmer par Claude.
4. **[mineur]** Grille 6 (correction), `v2/application/client/App.jsx:97` — Seul `r.ok` de `/api/moi` est consulté ; si le serveur répond 200 avec un corps d'erreur ou une session expirée à moitié traitée, la personne est envoyée vers `charger()` sans garantie. Par ailleurs, un lien d'invitation pour l'adresse A ouvert par une session B (autre compte) envoie B sur son dernier document sans avertissement — c'est le comportement décrit par le commentaire, mais il n'est pas testé. Proposer d'attendre aussi l'état `connecte` après `charger()` dans le test de pile (`v2/contrats/pile/comptes.test.js:69`).
5. **[mineur]** Grille 4 (simplicité), `v2/application/serveur/comptes.js:140` — `quiInvite` fait une lecture en base à chaque courrier parce que la session ne porte pas l'adresse. C'est correct, mais si les invitations deviennent nombreuses, porter le courriel dans la session (ou le renvoyer avec `p`) éviterait la requête ; à noter, pas à changer maintenant.

## Points de grille sans remarque
1, 2, 3 (hors constat 5, marginal), 5, 8, 9 (hors constats 1-2), 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. Juste, corrigé : quand ni le nom ni l'adresse ne sont connus, le message dit « Quelqu'un » (comme pour l'auteur de l'objet).
2. Juste, corrigé : assertion ajoutée (le domaine rend vide, l'appelant choisit le repli).
3. Confirmé : `pannes.test.js` (« lien de connexion déjà utilisé… ») couvre le lien sans session et passe (7 réussis).
4. Accepté : `/api/moi` ne rend 200 que pour une session valable ; la session d'une autre personne qui ouvre un lien d'invitation arrive sur son propre dernier document, comme décidé (commentaire du code) ; pas de test supplémentaire.
5. Noté, pas changé : une lecture en base par courrier, sans conséquence à cette échelle.

## Arbitrage de Sylvain

Fusion demandée par Sylvain le 18/11/2026.
