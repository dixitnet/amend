# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 234977 signes envoyés, 2768 reçus (et 5737 de réflexion) ; réflexion `low` ; 12 s ; arrêt : stop
- Diff audité : `v2/` de `32a8015` à `77674b9` (11 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Lot cohérent : état de synchronisation au format S, favoris déplacés dans le menu, paliers de zoom propres au téléphone. Les couches sont respectées (design dans `v2/design/`, réglages décidés et consignés dans l'ADR 0008, textes traduits, tests mis à jour). Les constats portent sur une incohérence de documentation dans l'ADR, un comportement non couvert par les tests (le « ramené au plus proche »), et un point à vérifier sur la couverture du commentaire de réglage CSS.

## Constats
1. **[mineur]** Grille 1/8 (ADR à jour) — `v2/adr/0008-design.md:30` : la ligne `css.editeur.zoom` dit désormais « à 50 %, 150 % et 200 % », mais la colonne décision ne cite que le choix du 11/11 (« 50, 100, 150 ») ; le 200 % est une décision du 13/11 limitée au format S (`zoom.paliersS`, ligne 78). La ligne laisse croire que 200 % existe sur tous les formats. Proposer de citer la décision du 13/11/2026 dans cette ligne, ou de laisser le 200 % à la seule ligne `zoom.paliersS`.
2. **[mineur]** Grille 7 (tests) — `v2/application/client/aidesEdition.jsx:20` : le comportement documenté « un zoom mémorisé hors des paliers du format est ramené au plus proche » (50 % mémorisé devient 100 % au format S) n'est couvert par aucun test : `v2/contrats/pile/telephone.test.js:156-183` teste les paliers affichés et le 200 %, mais jamais la coercion d'un zoom mémorisé à 50 %. Ajouter un test qui mémorise 50 % puis vérifie que le menu du format S coche 100 %.
3. **[mineur]** Grille 6 (cas limite) — `v2/application/client/aidesEdition.jsx:21` : `palierLePlusProche` ne départage pas les ex æquo (un zoom de 75 % entre 50 et 100 garde le premier palier rencontré) ; le résultat dépend de l'ordre du tableau. Sans conséquence pratique ici (les valeurs mémorisées viennent des paliers), mais un commentaire ou un choix explicite (arrondi vers le haut, par exemple) éviterait la surprise. À trancher ou à documenter.
4. **[question]** Grille 1 (design décidé) — `v2/design/feuilles/editeur.css:28` : la règle `[data-amend-zoom='200']` est ajoutée sans son propre commentaire `/* réglage : … */` ; je suppose qu'elle est couverte par le commentaire de réglage qui précède le bloc des paliers (hors diff), mais si ce dernier ne mentionne que `css.editeur.zoom` pour les paliers 50/150, le contrat statique pourrait ne pas rattacher la nouvelle règle à une décision. À vérifier dans le fichier complet et le contrat `contrats/statiques/design-decide.test.js`.
5. **[question]** Grille 4 (code mort) — `v2/design/composants/PageEditionS.jsx:10` : l'import de `Etoile` est retiré ici ; si `Etoile` (dans `Coquille.jsx`) n'est plus utilisé par aucun autre composant, il devient du code mort. À vérifier et à retirer le cas échéant.

## Points de grille sans remarque
2, 3, 5, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. *Juste* : la ligne `css.editeur.zoom` de l'ADR 0008 cite maintenant la décision du 13/11/2026 (200 % au seul format S).
2. *Juste* : test de pile ajouté (zoom mémorisé à 50 %, le format S applique 100 %).
3. *Juste* : le départage (le premier palier de la liste, du plus petit au plus grand) est documenté dans le code.
4. *Faux* : la règle suit le commentaire `/* réglage : css.editeur.zoom */` du même bloc ; le contrat statique passe.
5. *Faux* : `Etoile` sert encore au bandeau des formats L et M (`Coquille.jsx`).

## Arbitrage de Sylvain

(À compléter.)
