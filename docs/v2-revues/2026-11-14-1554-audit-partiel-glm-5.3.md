# Audit partiel avant fusion (2026-11-14)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 227350 signes envoyés, 1884 reçus (et 2951 de réflexion) ; réflexion `low` ; 7 s ; arrêt : stop
- Diff audité : `v2/` de `11634ca` à `deff633` (3 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Diff très petit : une ligne de réglage dans l'ADR 0008, une règle CSS dans `design/feuilles/editeur.css`, un test de pile. L'ensemble respecte le cadre (réglage décidé par Sylvain, feuille avec clé de réglage, test de contrat). Deux points : une clé de réglage dupliquée dans la table de l'ADR 0008, et un test qui ne couvre que le niveau 1 des titres alors que la règle en couvre cinq.

## Constats
1. **[important]** Grille 1/9 (ADR, cohérence des réglages) — `v2/adr/0008-design.md:28`. La nouvelle entrée utilise la clé `css.editeur.titres`, qui existe déjà dans la même table pour un autre réglage (« blocs "Titre" et "Sous-titre" à l'écran, centrés »). Deux réglages distincts portent la même clé, ce qui risque de fausser le contrat statique `contrats/statiques/design-decide.test.js` (concordance code/table) et la traçabilité des décisions. Proposer une clé distincte, par exemple `css.editeur.titresInterligne`, dans la table et dans le commentaire de `v2/design/feuilles/editeur.css:16`.
2. **[mineur]** Grille 7 (tests) — `v2/contrats/pile/editeur.test.js:499`. Le test ne vérifie que le titre de niveau 1 (bornes 1,25–1,35) ; la règle CSS pose aussi les interlignes des niveaux 2 à 5 (`v2/design/feuilles/editeur.css:25-36`), non couverts. Compléter le test en tapant des titres de niveaux 2 et 5 et en vérifiant les rapports attendus (≈ 1,4 et 1,5).
3. **[question]** Grille 6 (correction) — `v2/contrats/pile/editeur.test.js:511`. Le rapport est mesuré sur `.bn-block-content` du titre : si BlockNote pose la taille de police du titre sur un élément enfant plutôt que sur le contenu du bloc, le rapport mesuré ne serait pas l'interligne réel du titre. Le test passe-t-il de façon stable ? Si oui, rien à changer ; sinon, mesurer sur l'élément qui porte la taille.

## Points de grille sans remarque
2, 3, 4, 5, 8, 10 (licences : aucune dépendance nouvelle).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides

## Réponse de Claude

1. *Juste*, corrigé : la clé `css.editeur.titres` existait déjà (blocs « Titre » et « Sous-titre »). Renommée `css.editeur.titresInterligne` dans l'ADR 0008 et dans la feuille.
2. *Juste*, corrigé : le test vérifie aussi le niveau 2 (bornes 1,3 à 1,45) ; les niveaux 3 à 5 suivent la même règle, sans cas propre.
3. *Faux*, avec preuve : la taille de police (51 px pour le niveau 1) et l'interligne (66 px, soit 1,3) se lisent sur le même élément `.bn-block-content` ; avant correction le même test mesurait 1,6, et il passe de façon stable après.

## Arbitrage de Sylvain

(À compléter.)
