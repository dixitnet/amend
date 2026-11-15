# Audit partiel avant fusion (2026-11-15)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 256734 signes envoyés, 3000 reçus (et 6964 de réflexion) ; réflexion `low` ; 13 s ; arrêt : stop
- Diff audité : `v2/` de `f6ad696` à `7c0bfa8` (7 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff met le fil de Margo en bulles (décision Sylvain du 15/11/2026) : composant de présentation retravaillé, réglages ajoutés à `reglages.js` et à la table de l'ADR 0008, clés i18n fr/en ajoutées, test de pile nouveau. L'ensemble respecte la séparation design/technique et les catalogues. Trois points retiennent l'attention : une variante de composant Mantine posée hors `reglages.js`, une incohérence potentielle sur la valeur de `auteur`, et des éléments de la décision non couverts par le test.

## Constats
1. **[important]** Grille 1 (design hors décision notée) — `v2/design/composants/PanneauMargo.jsx:105`. `Loader type="dots"` est une variante de composant Mantine posée directement dans le code, hors `v2/design/reglages.js`, et sans clé dans la table « Réglages décidés » de l'ADR 0008 (la décision du 15/11 mentionne « trois points », mais ni clé de réglage ni entrée dans la table ne la portent ; le contrat statique `design-decide.test.js` ne peut pas la vérifier). Proposer une clé `margo.attente.type` dans `reglages.js` et la table, ou faire valider par Sylvain l'exception.
2. **[question]** Grille 6 (correction) — `v2/application/client/Edition.jsx:478` et `v2/design/composants/PanneauMargo.jsx:74`. L'étiquette traite tout auteur non-Margo comme « Vous » (`m.auteur === 'margo' ? … : t('margo.vous')`), tandis que le côté de la bulle n'est « mien » que pour la valeur exacte `'personne'` (`m.auteur === 'personne'`). Si `auteur` peut prendre une autre valeur (identifiant de la personne, auteur tiers), le message serait étiqueté « Vous » mais affiché à gauche, comme Margo. Vérifier l'ensemble des valeurs possibles de `auteur` côté serveur ; si seules `'personne'` et `'margo'` existent, aligner les deux tests sur la même comparaison pour lever l'ambiguïté.
3. **[mineur]** Grille 4 (option « au cas où ») — `v2/design/composants/PanneauMargo.jsx:34` et `:61`. `libelleMenu` est optionnel avec repli sur `libelle`, alors que l'unique appelant (`Edition.jsx:499`) le fournit toujours. Proposer de le rendre obligatoire (ou de retirer le repli) pour éviter une option sans usage.
4. **[mineur]** Grille 7 (tests) — `v2/contrats/pile/margo.test.js:115`. Le test couvre le côté des bulles et « Nouvelle conversation » au menu « … », mais pas deux autres points de la même décision du 15/11 : les trois points pendant que Margo travaille (`enCours` en bulle, `PanneauMargo.jsx:103-106`) et la portée au-dessus de la saisie. Proposer d'étendre le test (ou de noter l'écart dans le plan de l'étape 8).
5. **[question]** Grille 4 (redondance) — `v2/design/reglages.js:123`. `margo.fil.p: 0` : Mantine réinitialise déjà les marges par défaut du navigateur sur les listes ; le réglage est peut-être sans effet. Vérifier en le retirant ; s'il est effectif (Stack de Mantine), le garder tel quel, la décision étant notée dans l'ADR 0008.

## Points de grille sans remarque
2 (API publique), 3 (redondance avec l'amont), 5 (sécurité et droits), 8 (exports), 10 (licences).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. *Juste*, corrigé : `margo.attente.type` (`dots`) est dans `reglages.js` et dans la table de l'ADR 0008.
2. *Faux*, avec la preuve : le client ne crée que deux auteurs, `'personne'` et `'margo'` (`application/client/margo.js`, lignes 105 et 106).
3. *Juste*, corrigé : `libelleMenu` est obligatoire, sans repli.
4. *Juste*, corrigé : le test de pile couvre aussi les trois points (bulle d'attente) et la portée au-dessus de la saisie ; le test de composant vérifie le bouton « … » et le `Loader`.
5. *Faux*, avec la preuve : sans `margo.fil.p`, la capture réelle montrait les bulles de Margo décalées d'environ 40 px (retrait par défaut de la liste) ; avec, elles tiennent la largeur. Le réglage est effectif.

## Arbitrage de Sylvain

(À compléter.)
