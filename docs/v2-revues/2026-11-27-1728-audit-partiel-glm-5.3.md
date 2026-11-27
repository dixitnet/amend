# Audit partiel avant fusion (2026-11-27)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 562468 signes envoyés, 3127 reçus (et 6481 de réflexion) ; réflexion `low` ; 176 s ; arrêt : stop
- Diff audité : `v2/` de `b5dfdf7` à `2786dd4` (8 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff retire l'ancien gabarit Typst « en points » au profit de la grille stricte en lignes, avec refus explicite des modèles en points dans `grille` et `gabaritTypst`. Le remplacement est propre dans l'ensemble, mais plusieurs tests supprimés ne semblent pas repris ailleurs : le jeu en bas de page (décision du 22/11/2026), la conversion `versModeleParStyle` et les déductions de `completerModele`. Une fonction (`blancSurGrille`) reste peut-être sans usage.

## Constats

**A1 — [important]** Grille 7 (tests), `v2/contrats/statiques/typst.test.js:540` (test supprimé, « jeu en bas de page (22/11/2026) ») : le test qui vérifiait sur un vrai PDF qu'une page commençant par un intertitre garde sa dernière ligne (correctif décidé par Sylvain le 22/11/2026, ADR 0011) est supprimé sans équivalent visible dans le diff. Si le nouveau gabarit en lignes (`miseEnPageLignes.js`) implémente le jeu autrement, un contrat PDF équivalent doit exister ; sinon la régression ne sera détectée qu'en production. Proposer de vérifier qu'un test de pile couvre le jeu dans le gabarit en lignes, et d'en ajouter un s'il n'existe pas.

**A2 — [important]** Grille 7, `v2/tests/unitaires/migration-modeles.test.js:5` : le test « un ancien modèle (base de l'A4 et écarts) devient un modèle complet par style, valide » est supprimé, et avec lui les imports de `versModeleParStyle`, `verifierModele` et `completerModele`. Or le commentaire de `v2/domaine/miseEnPage.js:5-7` dit que la conversion des anciens modèles est conservée pour `migrationModeles.js` : si `versModeleParStyle` reste du code de production, il n'a plus aucun test. Vérifier s'il est encore appelé ; sinon le retirer, sinon lui rendre un test.

**A3 — [question]** Grille 7, `v2/tests/unitaires/miseEnPage.test.js:126` : les tests de déduction de `completerModele` (modèle d'avant le 19/11/2026 : `ouverture2`, style des en-têtes, bibliographie, lecture de `grille.lignes`) sont supprimés ; le nouveau test de `v2/tests/unitaires/miseEnPageLignes.test.js:259` ne couvre qu'un complément simple. Ces règles de reprise concernent des modèles réellement enregistrés en base : leur perte de couverture mérite d'être confirmée (peut-être couvertes hors diff dans `miseEnPageLignes.test.js`).

**A4 — [question]** Grille 4 (simplicité), `v2/domaine/miseEnPage.js:78-94` : `blancSurGrille` survit au retrait du gabarit en points, mais son commentaire (« le blanc entre un bloc et le texte voisin pour que le texte retombe sur la grille ») décrit un usage de gabarit, pas de conversion ; l'en-tête du module (lignes 5-7) ne cite comme conservés que `margeBasPourLignes` et la valeur d'une ligne blanche. Si `completerModele` ne l'appelle pas, c'est du code mort à retirer.

**A5 — [mineur]** Grille 6 (cas limite), `v2/contrats/statiques/typst.test.js:102` : `source.slice(source.indexOf('#heading('))` devient `slice(-1)` (dernier caractère seulement) si `#heading(` est absent, rendant l'assertion `doesNotMatch` quasi vide sans échouer. Extraire l'index dans une variable et échouer explicitement s'il vaut `-1`.

## Points de grille sans remarque
1, 2, 3, 5, 8, 9, 10

## Citations vérifiées par le script

- A1 : citations valides
- A2 : citations valides
- A3 : citations valides
- A4 : citations valides
- A5 : citations valides

## Réponse de Claude

- **A1. Juste, corrigé.** Le « jeu en bas de page » était un correctif du gabarit en points (une zone de texte taillée au point près refusait la dernière ligne d'une page commencée par un intertitre). La brique n'a plus ce défaut, mais rien ne le prouvait : contrat ajouté dans `contrats/statiques/grille-en-lignes.test.js` (« une page est pleine »). Typst y vérifie qu'une page de texte porte ses 33 lignes, qu'une page commencée par un titre porte le titre puis 32 lignes, et que la dernière ligne de la grille est prise dans les deux cas.
- **A2. Juste, corrigé.** `versModeleParStyle` est toujours du code de production (`convertir`, au démarrage du serveur). Son test est rétabli, adapté : le modèle obtenu est lu comme le serveur le lit aujourd'hui (`valeursEnLignes`) et vérifié contre les règles en lignes.
- **A3. Juste, corrigé.** Retirés trop vite : ils échouaient parce qu'ils appelaient aussi le gabarit en points, mais les règles qu'ils décrivent (`completerModele` : lignes par page d'avant le 15/11, déductions d'avant le 19/11) servent toujours la conversion. Les deux tests sont rétablis dans `tests/unitaires/miseEnPage.test.js`, sans leurs assertions sur le gabarit, et prolongés jusqu'à la conversion en lignes.
- **A4. Faux, commentaire corrigé.** `blancSurGrille` est appelé par `stylesEnPoints`, lui-même appelé par `completerModele` pour lire les modèles enregistrés en lignes blanches avant le 15/11/2026 (test : « un modèle enregistré avec des lignes blanches… »). Son commentaire décrivait le gabarit retiré : il dit maintenant à quoi la fonction sert encore.
- **A5. Juste, corrigé.** L'index est vérifié avant la découpe.

## Arbitrage de Sylvain

(À compléter.)
