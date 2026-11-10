# Audit partiel avant fusion (2026-11-10)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 84255 signes envoyés, 975 reçus (et 1272 de réflexion) ; réflexion `low` ; 5 s ; arrêt : stop
- Diff audité : `v2/` de `cd35878` à `d14e9e6` (1 fichiers)
- Statut : avis reçu ; répondu par Claude ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff est un correctif minime et ciblé sur un seul test de pile : il remplace une comparaison de chaîne exacte (`'25.6px'`) par une comparaison numérique à 0,1 px près, pour tenir compte de l'arrondi de Firefox au 1/60 de pixel. Le changement est correct, au bon niveau (contrats), et ne touche qu'une couche. Je ne relève aucun défaut certain ; une seule question mineure sur la tolérance choisie.

## Constats
1. **[question]** Grille 7 (tests) — `v2/contrats/pile/telephone.test.js:70` : la tolérance de 0,1 px (intervalle accepté ≈ 25,5 à 25,7 px) est plus large que l'arrondi Firefox invoqué (1/60 px ≈ 0,017 px) ; elle pourrait en théorie laisser passer une régression de la feuille `css.telephone.titres` de l'ordre du dixième de pixel. Rien de bloquant, mais si l'intention est seulement d'absorber l'arrondi de Firefox, une tolérance de 0,05 px suffirait ; à confirmer avec l'auteur du lot.

## Points de grille sans remarque
1, 2, 3, 4, 5, 6, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides

## Réponse de Claude

- **1 : juste, mineur.** L'écart de Firefox est de 0,006 px ; la tolérance passe à 0,05 px (`v2/contrats/pile/telephone.test.js:70`), test rejoué au vert.

Hors de `v2/`, donc hors du diff audité : le déploiement automatique (`deploy/auto/`) ne reconstruit plus que ce qui a changé et passe après les sites, et la CI installe les navigateurs en deux essais.

## Arbitrage de Sylvain

(À compléter.)
