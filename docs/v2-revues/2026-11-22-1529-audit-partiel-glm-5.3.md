# Audit partiel avant fusion (2026-11-22)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 420242 signes envoyés, 1621 reçus (et 4456 de réflexion) ; réflexion `low` ; 9 s ; arrêt : stop
- Diff audité : `v2/` de `16e77fb` à `83f88f9` (9 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff met en œuvre la décision du 22/11/2026 (jeu d'un demi-corps en bas de page) : soustraction du jeu dans `gabaritTypst`, garde-fou d'un millimètre avant le numéro de page, gabarits de référence et tests mis à jour en cohérence. L'implémentation est fidèle à l'ADR et couverte par un test unitaire et un contrat sur PDF réel. Un seul point mérite une vérification : le comportement du jeu pour un modèle sans numéro de page.

## Constats
1. **[question]** Grille 6 (correction, cas limite) — `v2/domaine/miseEnPage.js:244`. Le jeu est plafonné par `descenteFolio - 1` ; si `grille()` renvoie une `descenteFolio` nulle ou faible pour un modèle **sans folio** (`footer: none`, ligne 356), le jeu s'annule alors que rien ne s'oppose à la descente du texte — l'ADR ne prévoit l'effacement du jeu que s'il atteindrait le numéro de page. Vérifier ce que `grille()` rend pour `descenteFolio` quand il n'y a pas de folio ; si c'est 0, proposer un plafond différent dans ce cas (ou confirmer que tout modèle a un folio).
2. **[mineur]** Grille 7 (test) — `v2/tests/unitaires/miseEnPage.test.js:550`. L'assertion `jeu + ((pas - corps) / 2) * PT < pas * PT` est toujours vraie par construction (elle se réduit à `pas/2 < pas`) : elle ne vérifie pas ce qu'elle annonce (« la ligne suivante ne tient pas »), qui serait plutôt `jeu + pas * PT > hauteur disponible` ou un calcul sur la zone de texte. Le contrat sur PDF (`v2/contrats/statiques/typst.test.js:561`) couvre heureusement le comportement réel ; assouplir ou reformuler cette ligne du test unitaire.

## Points de grille sans remarque
1, 2, 3, 4, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides

## Réponse de Claude

1. **Juste, corrigé.** Tout modèle porte une place de numéro de page (`folio.bas`), même quand il n'est pas affiché ou qu'il est en haut ; le jeu ne se limite plus à cette place que si le numéro est réellement en bas. Test ajouté.
2. **Juste, reformulé.** L'assertion dit maintenant ce qu'elle vérifie (la zone gagne un demi-interligne en tout) ; que la ligne suivante ne tienne pas est vérifié par le contrat Typst sur un PDF.

Après corrections : `npm run format:check`, `npm run lint`, `npm test` au vert.

## Arbitrage de Sylvain

(À compléter.)
