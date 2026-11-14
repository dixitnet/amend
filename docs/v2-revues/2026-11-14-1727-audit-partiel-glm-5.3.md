# Audit partiel avant fusion (2026-11-14)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 227957 signes envoyés, 1518 reçus (et 2317 de réflexion) ; réflexion `low` ; 7 s ; arrêt : stop
- Diff audité : `v2/` de `5633fdc` à `0241b44` (3 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce lot applique la décision du 14/11/2026 (retour des poignées de bloc sur L et M, masquées au format S) : ADR 0008, feuille `editeur.css` et un test de pile. La feuille et l'ADR sont cohérents entre eux et avec le point de rupture `sm` de Mantine (48 em). Le principal écart est dans les tests : seul le comportement L est vérifié, alors que le changement porte aussi sur le masquage au format S et sur les marges.

## Constats
1. **[important]** Grille 7 (tests) — `v2/contrats/pile/editeur.test.js:524`. Le test ne vérifie que le cas L (poignée visible) ; le cœur du changement — poignées masquées et marges de 10 px sous 48 em — n'est couvert par aucun test, alors que la feuille `v2/design/feuilles/editeur.css:7-16` l'applique. Proposer un second test au format S (fenêtre étroite) vérifiant `display: none` et le `padding-inline` de 10 px.
2. **[mineur]** Grille 7 (tests) — `v2/contrats/pile/editeur.test.js:524`. Le titre annonce « aux formats L et M » mais seul L est testé (`pageEcriture('poignees-l')`) ; le test ne vérifie pas ce qu'il annonce pour M. Soit renommer, soit ajouter le parcours M (iPad).
3. **[question]** Grille 6/7 — `v2/contrats/pile/editeur.test.js:527-529`. Les deux `attendre(500)` fixes autour du survol rendent le test dépendant du rythme d'apparition de la poignée chez BlockNote ; un sélecteur d'attente explicite (poignée visible) serait plus robuste. À confirmer selon les habitudes des autres tests de pile.

## Points de grille sans remarque
1, 2, 3, 4, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides

## Réponse de Claude

1. *Juste*, corrigé : un test de pile au format S (`telephone.test.js`) vérifie poignées masquées et marges de 10 px.
2. *Juste*, corrigé : le test du format L est intitulé « au format L » ; M applique la même feuille, sans cas propre (seuil unique à 48 em).
3. *Hors sujet* : `attendre(500)` est l'usage des autres tests de pile pour laisser l'éditeur se poser ; le test est stable sur plusieurs lancements.

## Arbitrage de Sylvain

(À compléter.)
