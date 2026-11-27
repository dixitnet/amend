# Audit partiel avant fusion (2026-11-27)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 459396 signes envoyés, 2811 reçus (et 5627 de réflexion) ; réflexion `low` ; 19 s ; arrêt : stop
- Diff audité : `v2/` de `9c84693` à `6791314` (16 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff fait partir le surlignage dans l'export PDF, à la couleur décidée par Sylvain (`livre.surlignage`, ADR 0008 mise à jour), en le laissant hors du Markdown. Le flux est propre : la valeur vient du design, transite par l'application, et le domaine la valide par une expression rationnelle avant de l'écrire dans le source Typst — le cas d'injection est même testé. Les contrats et le livre de référence sont mis à jour en cohérence. Restent trois points mineurs : une évasion du lint par une constante, un réglage rangé dans le mauvais objet, et une valeur dupliquée dans un test.

## Constats
1. **[mineur]** Grille 1/4 (lint contourné) — `v2/domaine/miseEnPage.js:219`. La constante `COULEUR_DE_TYPST = 'rgb'` existe uniquement pour que le lint ne prenne pas `rgb` écrit dans le gabarit pour une valeur de design, comme l'explique le commentaire des lignes 217-218. C'est une évasion de la vérification machine plutôt qu'une correction d'elle : la règle « Avant de proposer » (point 5) invite à réviser la règle de lint (faire une exception documentée pour la fonction de couleur de Typst) plutôt qu'à la contourner. Proposer la révision du lint, ou à défaut le signaler à Sylvain.
2. **[mineur]** Grille 4 (rangement) — `v2/design/livre.js:13` et `v2/design/reglagesLivre.js:669`. `surlignage` est ajouté à `REGLES_MODELES`, présenté (ligne 8 du même fichier) comme « ce qu'on peut changer dans un modèle (équipes et instance) » et utilisé par le domaine pour valider les réglages des modèles (ADR 0011, liste fermée). Ce n'est pas un réglage de modèle : c'est une constante de design pour tous les PDF ; le mettre dans la liste fermée risque la confusion (un formulaire ou une validation qui le parcourrait). Le sortir dans un export distinct de `reglagesLivre.js`.
3. **[mineur]** Grille 7 (test) — `v2/contrats/statiques/typst.test.js:138`. La couleur `'#d8f5a2'` y est écrite en dur, alors que `livre-de-reference.test.js:121` lit `REGLES_MODELES.surlignage` : si Sylvain ajuste la teinte (l'ADR dit « à ajuster » pour l'écran), ce test continuera de passer avec l'ancienne valeur. Lire le réglage comme le fait l'autre contrat.
4. **[question]** Grille 6 — `v2/domaine/miseEnPage.js:222`. Sans couleur ou avec une valeur non hexadécimale, `amend-surligne` devient le `highlight` de Typst avec sa couleur par défaut (jaune). Le repli est documenté et testé (`export-ajouts.test.js:230-234`), mais je ne sais pas s'il est voulu par Sylvain ou seulement toléré : un appel de `versTypst` qui oublierait de passer `surlignage` (autre appelant futur) exporterait en jaune sans erreur. Une valeur par défaut explicite côté application, ou un code d'erreur du domaine, serait plus sûr ; à trancher avec Sylvain.

## Points de grille sans remarque
2, 3, 5, 6 (hors question ci-dessus), 8, 9, 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. **Réponse.** Ce gabarit écrit du Typst, pas du style d'interface, et il passe déjà par des aides pour tout ce que le lint prendrait pour une valeur de design : `pt()`, `mm()`, `em()` (mêmes lignes de `miseEnPage.js`). `couleurTypst` est de la même famille : la valeur, elle, vient du design (`livre.surlignage`). Une exception de lint pour tout le fichier ouvrirait plus large.
2. **Juste, corrigé.** La couleur sort de la liste fermée des réglages de modèle : export distinct `SURLIGNAGE_DU_LIVRE` (`design/livre.js`).
3. **Juste, corrigé.** Le contrat de compilation lit le réglage du design.
4. **Voulu.** Sans couleur valable, le surligneur de Typst tel quel : un repli sûr (le PDF sort), dit dans le commentaire et testé. Il n'y a qu'un appelant, l'application, qui passe toujours le réglage.

## Arbitrage de Sylvain

(À compléter.)
