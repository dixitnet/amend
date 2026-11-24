# Audit partiel avant fusion (2026-11-24)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 422218 signes envoyés, 1980 reçus (et 2523 de réflexion) ; réflexion `low` ; 65 s ; arrêt : stop
- Diff audité : `v2/` de `b4be7e8` à `624aa6c` (3 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce lot applique la décision de Sylvain du 24/11/2026 (champs à 16 px au format S) : une ligne dans la table de l'ADR 0008, une règle dans `design/feuilles/telephone.css` portant sa clé de réglage, et un test de pile qui parcourt six écrans. L'ensemble est conforme aux règles 18-20 (réglage décidé, feuille avec clé, lot limité au design plus un test). Les constats portent sur des détails du test : cohérence des sélecteurs, fermeture des contextes, et un champ visé par la feuille mais non parcouru.

## Constats
1. **[mineur]** Grille 7 — `v2/contrats/pile/telephone.test.js:583` : le comptage des champs (`controler`) utilise `input:visible, textarea:visible, [contenteditable="true"]:visible` (sans `select`), tandis que la mesure (`petits`, ligne 572) inclut `select` : un écran ne montrant qu'un `select` passerait l'assertion de comptage sans qu'aucun champ ne soit vérifié. Harmoniser les deux sélecteurs.
2. **[mineur]** Grille 6 — `v2/contrats/pile/telephone.test.js:594` : si une assertion échoue avant `contexte.close()` (ou avant `p.context().close()` ligne 622), le contexte Playwright n'est pas fermé (pas de `try/finally`) ; les tests suivants peuvent en pâtir. Envelopper dans un `finally` ou utiliser des fixtures.
3. **[mineur]** Grille 7 — `v2/design/feuilles/telephone.css:127` : le commentaire cite explicitement les champs de BlockNote (« adresse d'un lien ») comme visés par la règle, mais le test ne parcourt aucun écran où ce champ apparaît (palette de lien de BlockNote). Ajouter ce parcours ou retirer la mention du commentaire.
4. **[question]** Grille 2 — `v2/design/feuilles/telephone.css:129` : le sélecteur `.mantine-Input-input` repose sur une classe de style de Mantine ; elle est documentée et publiquement stable (Docs l'utilise aussi), donc je ne la classe pas en membre privé, mais à confirmer qu'elle est bien considérée comme API publique dans nos contrats de fondation.

## Points de grille sans remarque
1, 3, 4, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. **Juste, corrigé.** Le comptage inclut maintenant `select`, comme la mesure.
2. **Hors lot.** Aucun essai de cette suite n'enveloppe ses contextes dans un `finally` : le navigateur entier est fermé par `after`, et un essai qui échoue n'empêche pas les suivants (chacun ouvre ses propres contextes). À reprendre pour toute la suite si on le veut, pas pour ce seul essai.
3. **Juste, corrigé.** Le commentaire ne dit plus que le champ d'adresse d'un lien est couvert : il n'est pas mesuré (la barre du téléphone de BlockNote ne se monte que clavier ouvert, donc pas dans la pile). Dit aussi dans le compte rendu à Sylvain.
4. **Réponse.** `.mantine-Input-input` est une classe statique de l'API de styles de Mantine (`mantine-{Composant}-{sélecteur}`), documentée ; les feuilles du design en utilisent déjà (`css.coquille.*`).

## Arbitrage de Sylvain

(À compléter.)
