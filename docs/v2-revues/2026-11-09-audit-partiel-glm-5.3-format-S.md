# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 62328 signes envoyés, 3032 reçus (et 3966 de réflexion) ; réflexion `low` ; 12 s ; arrêt : stop
- Diff audité : `v2/` de `8ecbe38` à `33c4f30` (5 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; fusion autorisée par Sylvain le 09/11/2026 (« documenter et transférer dans la branche main »).

## Avis de l'auditeur

## Synthèse
Le diff ajoute le filtrage de la palette flottante de BlockNote, les niveaux de titre 4 et 5, et la feuille de réglages `editeur.css` avec ses deux décisions de Sylvain. La feuille de style respecte la révision du 08/11/2026 (clé de réglage en commentaire, valeurs décidées). Le principal écart est le retrait des boutons d'alignement : un réglage d'apparence décidé par Sylvain mais logé dans l'adaptateur, hors de `v2/design/` et absent de `reglages.js` et de la table de l'ADR 0008. Les deux changements fonctionnels ne sont pas couverts par les contrats.

## Constats
1. **[important]** Grille 1 (design hors de `v2/design/`) et règle 18 — `v2/adaptateurs/blocknote/index.jsx:24`, `v2/adaptateurs/blocknote/index.jsx:29`. Le retrait des boutons d'alignement de la palette (`BOUTONS_RETIRES`) est un réglage d'apparence de l'éditeur, décidé par Sylvain le 09/11/2026 selon le commentaire, mais il vit dans l'adaptateur (couche 2) au lieu de `v2/design/reglages.js`, et il n'apparaît ni dans la table « Réglages décidés » de l'ADR 0008 ni dans le registre des renoncements. La règle 18 exige que tout réglage soit inscrit dans `reglages.js` et dans la table. Proposition : déplacer la liste dans `v2/design/reglages.js` (l'adaptateur la lit), ajouter la ligne dans la table de l'ADR 0008, et vérifier que le contrat statique `design-decide.test.js` couvre ce réglage.
2. **[important]** Grille 7 (tests) — `v2/adaptateurs/blocknote/index.jsx:29`, `v2/adaptateurs/blocknote/schema.js:20`. Ni le filtrage de la palette (absence des boutons d'alignement, présence des autres) ni le retour des niveaux de titre 4 et 5 ne sont couverts par un contrat ou un test dans ce diff ; un changement de clé dans une montée de version de BlockNote (`bouton.key`) ou une régression du schéma passerait inaperçu. Proposition : deux assertions dans les contrats BlockNote (clés de la palette rendue, niveaux acceptés par `schemaLivre`).
3. **[question]** Grille 1 / règle 18 — `v2/design/feuilles/editeur.css:13`. La valeur `10px` vit dans la feuille et non dans `v2/design/reglages.js`, alors que la règle 18 demande que tout réglage soit inscrit dans `reglages.js` et dans la table. La révision du 08/11/2026 (« chaque règle porte la clé d'un réglage de cette table ») semble permettre cette forme, mais la lettre de la règle 18 n'est pas révisée sur ce point. À clarifier avec Sylvain : la valeur doit-elle être dans `reglages.js` (la feuille ne faisant que la référencer), ou la feuille avec clé suffit-elle ?
4. **[mineur]** Grille 1 (documentation des décisions) — `v2/adaptateurs/blocknote/schema.js:18`. La remise des niveaux de titre 4 et 5 (décision de Sylvain du 09/11/2026) n'est tracée que dans un commentaire de code ; ni l'ADR 0003 (schéma de blocs), ni le registre des renoncements (le retrait initial des titres 4-5 n'y figure pas non plus explicitement), ni un plan d'étape ne la consigne. Proposition : une ligne dans l'ADR 0003 ou dans le plan de l'étape 4.

## Points de grille sans remarque
2, 3, 4, 5, 6, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. **Faux.** Le retrait des boutons d'alignement n'est pas une valeur d'apparence : il retire une fonction (aligner un paragraphe), comme le schéma du livre retire des blocs et des styles (renoncement n° 8), et il vit pour la même raison dans l'adaptateur BlockNote, à côté du schéma. La règle 18 vise les valeurs de design (couleur, police, taille, espacement, variante, prop de style) ; `reglages.js` ne contient que des réglages de Mantine. La décision est consignée au journal (§ 35) et dans `docs/v2-format-S.md`. La liste a été sortie dans `v2/adaptateurs/blocknote/palette.js` pour être testée (constat 2).
2. **Juste, corrigé.** `v2/tests/unitaires/blocknote-palette.test.js` : chaque clé retirée existe dans la palette de BlockNote (une clé renommée en amont fait échouer le test), la palette gardée n'a plus l'alignement et garde gras, italique, souligné, barré et lien, et le schéma accepte les titres 1 à 5. 99 tests sur 99.
3. **Juste sur la lettre, corrigé.** La révision de l'ADR 0008 du 08/11/2026 permet les feuilles de `v2/design/feuilles/` dont chaque règle porte la clé d'un réglage de la table, et le contrat `design-decide.test.js` le vérifie ; mais le texte de la règle 18 ne citait que `reglages.js`. Règle 18 alignée sur l'ADR (`docs/v2-regles-developpement.md`), sans changement de fond.
4. **Faux.** La décision est consignée hors de `v2/`, donc hors du diff audité : journal des décisions, § 35, et `docs/v2-format-S.md`. Les titres 4 et 5 n'avaient pas été retirés par un renoncement mais par la proposition de l'étape 4 (`docs/v2-etape-4-plan.md`) ; le journal suffit.

## Arbitrage de Sylvain

Fusion dans `main` autorisée le 09/11/2026.
