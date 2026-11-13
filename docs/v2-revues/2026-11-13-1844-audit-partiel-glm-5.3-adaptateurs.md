# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 202706 signes envoyés, 3715 reçus (et 5271 de réflexion) ; réflexion `low` ; 14 s ; arrêt : stop
- Diff audité : `v2/` de `e8ebc00` à `f57b0fc` (6 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff porte sur deux sujets : le nouveau bloc « Légende » (extension, schéma, menus, exports) et la conversion des modèles de mise en page vers des copies complètes (`valeurs`, ADR 0011 du 13/11/2026). Les couches et les frontières sont respectées ; les imports des extensions par l'adaptateur BlockNote sont licites. Les points de vigilance portent sur le gabarit Typst (règle `amend-legende` apparemment absente du diff), l'ordre de la conversion des anciens modèles, et l'absence visible de tests pour ces changements.

## Constats
1. **[important]** Grille 6 (correction), `v2/adaptateurs/blocknote/export.js:269` — Le bloc légende est exporté vers Typst par `#amend-legende[${texte}]`, mais le diff ne montre aucun ajout de règle `show` / `amend-legende` dans le gabarit Typst du domaine (`gabaritTypst`, importé ligne 17). Si la règle n'existe pas, la compilation Typst échoue ou rend la légende sans style. Vérifier que `v2/domaine/` définit bien `amend-legende` (et son replacement sur la grille, `blancSurGrille`, comme les autres styles) ; sinon l'ajouter.
2. **[important]** Grille 7 (tests), `v2/extensions/titres/index.js:31`, `v2/adaptateurs/blocknote/schema.js:39` — Aucun test n'apparaît dans le diff pour le bloc « Légende » : insertion par le menu « / », sérialisation, export Markdown (italique) et Typst. Les contrats BlockNote de l'étape 4 couvrent les autres blocs ; la légende devrait y entrer de la même façon.
3. **[question]** Grille 6 (correction), `v2/adaptateurs/postgres/comptes-modeles.js:70-88` — La conversion des anciens modèles suppose qu'un modèle d'équipe à convertir (`modelesAConvertir`) puisse résoudre sa base parmi les modèles de l'instance (`modelesDeLInstanceAncienne`). Si la base d'un modèle d'équipe est un modèle d'instance lui-même non converti, l'ordre de traitement décide du résultat ; et si une base a été supprimée entre-temps, la résolution échoue. Comment le serveur ordonne-t-il la conversion (instance d'abord, A4 en repli, base disparue) ? À vérifier dans le code d'appel, absent du diff.
4. **[mineur]** Grille 6 (cas limite), `v2/adaptateurs/blocknote/export.js:210` — `fontFamily: modele.styles?.texte?.police` rend silencieusement `undefined` si un modèle résolu n'a pas `styles.texte.police` (par exemple un modèle converti dont les valeurs anciennes ne contenaient pas ce réglage). L'export partirait alors sur la police par défaut sans erreur. Proposer un repli explicite (police du catalogue par défaut) ou une erreur de code du domaine.
5. **[mineur]** Grille 6 (cas limite), `v2/adaptateurs/postgres/comptes-modeles.js:80` — `modelesDeLInstanceAncienne` lit `base` et `ecarts` de tous les modèles d'instance, y compris ceux déjà convertis dont `base` peut être nul (colonne devenue facultative, `schema-comptes.js:135`). Si un ancien modèle d'équipe pointe vers un modèle d'instance converti, sa base se résout sur des `ecarts` périmés mais présents — voulu (« restent en base, sans usage ») ; sinon confirmer que le repli sur l'A4 couvre `base` nul.
6. **[question]** Grille 6, `v2/adaptateurs/postgres/comptes-modeles.js:26` — `modelesDeToutesLesEquipes` ne rend plus que `valeurs` ; le contrôle « une famille envoyée par l'instance ne peut être supprimée tant qu'un modèle en garde une copie » suppose que l'appelant calcule les familles par `famillesDuModele` sur les valeurs complètes. Vérifier que l'appelant a été mis à jour en conséquence (il n'est pas dans le diff).

## Points de grille sans remarque
1 (couches), 2 (API publique), 3 (redondance), 5 (sécurité et droits), 8 (exports propres : NFC inchangé), 9 (traductions : libellés passés par `p.textes`, pas de texte en dur), 10 (licences : aucune dépendance nouvelle).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

Audit découpé par couche (la fusion entière dépasse le plafond du script) : ce fichier couvre les adaptateurs ; les autres : `…-domaine.md`, `…-application.md`.

1. *Faux* : `amend-legende` est définie par `gabaritTypst` (`domaine/miseEnPage.js`, extrait dans une tranche d'audit à part) ; `contrats/statiques/typst.test.js` la compile (8/8).
2. *Juste en partie* : la légende est couverte par `contrats/pile/editeur.test.js` (menu « / » et palette, vérifiés dans Chromium), `tests/unitaires/extensions-branchement.test.js` et `typst.test.js` ; pas de test dédié de l'export Markdown. Noté, sans développement : l'export Markdown passe par le même chemin que le sous-titre.
3. *Faux* : `ancienModele` résout la base à partir des seules lignes anciennes (`base`, `ecarts`) et se replie sur l'A4 si la base a disparu ; l'ordre de conversion est sans effet. Test ajouté (`tests/unitaires/migration-modeles.test.js`).
4. *Faux* : le serveur complète tout modèle par celui du code (`completerModele`) avant de l'envoyer ; `styles.texte.police` est toujours présent.
5. *Voulu* : une base nulle se replie sur l'A4 (même test).
6. *Faux* : `modelesUtilisant` calcule les familles par `famillesDuModele` sur les valeurs complètes (`tests/services/modeles.test.js`, test des polices : le modèle d'équipe copié retient la police).

## Arbitrage de Sylvain

(À compléter.)
