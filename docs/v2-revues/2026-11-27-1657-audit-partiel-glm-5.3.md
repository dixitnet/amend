# Audit partiel avant fusion (2026-11-27)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 527648 signes envoyés, 4504 reçus (et 7916 de réflexion) ; réflexion `low` ; 294 s ; arrêt : stop
- Diff audité : `v2/` de `4def716` à `2769243` (4 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff remplace le formulaire de réglage des modèles par la fiche « grille stricte » (lignes plutôt que points), avec un aperçu de page dessiné à l'écran et le chargement des polices, plus une conversion automatique des anciens modèles au démarrage du serveur. L'architecture est respectée (application → domaine, design, i18n ; textes par catalogues). Les faiblesses relevées portent sur la conversion serveur (exception trop étroite pour les polices d'instance), l'absence de tests sur les nouveaux modules, et quelques heuristiques de l'aperçu dont la cohérence avec le gabarit Typst repose sur une duplication de règles.

## Constats
1. **[important]** Grille 6 (correction), `v2/application/serveur/comptes-modeles.js:288` — Dans `convertirEnLignes`, l'exception qui laisse passer une police de l'instance ne vise que `styles.texte.police` ; un modèle ancien qui utilise une police envoyée par l'instance dans un autre style (citation, titre 1, légende…) échouera avec `reglage-hors-bornes` sur `styles.<autre>.police` et ne sera jamais converti (silencieusement, à un `console.error` près). Proposer d'étendre l'exception à tout réglage `*.police`, ou de vérifier contre le catalogue élargi (code + instance).
2. **[important]** Grille 7 (tests), `v2/application/client/ficheModele.js:51`, `v2/application/client/ficheModele.js:269`, `v2/application/serveur/comptes-modeles.js:280` — Les trois nouveautés (structure de la fiche, résumés et notes, `planDePage`, conversion en lignes) n'ont aucun test dans le diff, alors qu'elles portent de la logique non triviale (demi-lignes, folio d'ouverture, repli quand le modèle est impossible, cas de la police d'instance). Proposer au moins des tests unitaires sur `planDePage` (blocs, demi-ligne ajoutée, folio) et sur `convertirEnLignes` (modèle convertible, police d'instance, modèle impossible).
3. **[mineur]** Grille 3 (redondance), `v2/application/client/ficheModele.js:302-304` — Les règles « la citation prend l'alinéa du texte en retrait », « la bibliographie le prend en retrait suspendu » (renoncement n° 30) sont réécrites ici alors qu'elles existent dans le gabarit Typst ; si l'une change, l'aperçu dérive du PDF. Le commentaire dit bien « le bouton Essayer reste la vérité », mais ces deux règles auraient leur place dans le domaine, à côté de `blancsDuBloc` et `demiLigneAjoutee`. Proposer de les descendre au domaine.
4. **[mineur]** Grille 6 (cas limite), `v2/application/client/policesEcran.js:5-8` — L'allure d'une police est devinée dans le nom de fichier : `SemiBold` ou `ExtraBold` matchent `/Bold/i` et seront rendus en `bold` plein, et un nom sans marqueur sera `normal` même s'il ne l'est pas. Acceptable pour un aperçu, mais à noter (et `DemiBold` des modèles « demi-gras » est justement un cas réel d'EB Garamond). Proposer un commentaire assumant l'approximation, ou lire l'allure dans les métadonnées que le domaine connaît déjà (`petitesCapitales` est lue par un contrat).
5. **[mineur]** Grille 9 (traductions), `v2/application/client/ficheModele.js:161` — Le résumé d'un style assemble ses morceaux avec un séparateur `' · '` en dur, alors que le reste des assemblages passe par `t('modeles.fiche.resume.suite')`. Mineur (séparateur typographique, pas un mot), mais pour la cohérence du lint des chaînes, le mettre au catalogue ou le joindre via la même clé.
6. **[question]** Grille 9 (traductions), `v2/application/client/ficheModele.js:146-161` — Les résumés de lignes (« 11 pt, gras, centré · sans blanc ») sont des phrases construites par concaténation de morceaux traduits, ce qui frôle la règle 26 (« pas de phrase assemblée par morceaux »). Je les lis comme des listes descriptives plutôt que des messages, mais si Sylvain veut l'anglais un jour, l'ordre des morceaux (adjectifs après le corps en français) ne se transposera pas. À poser comme question plutôt qu'en défaut.
7. **[question]** Grille 1 (couches), `v2/application/client/ficheModele.js:51-129` — `rubriquesDeLaFiche` fixe la structure de la fiche (ordre des rubriques, des lignes, regroupements en pastilles) dans la couche application, alors que la maquette validée par Sylvain relève du design. Le fichier ne pose aucune valeur d'apparence, donc je ne vois pas de violation nette de la règle 17 ; à confirmer que la structure (et non seulement l'apparence) est bien considérée comme technique.

## Points de grille sans remarque
8 (exports propres : rien dans ce diff ne touche aux exports), 10 (licences : aucune dépendance nouvelle).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

Audit découpé par couche : celui-ci ne voit que le commit de l'application (`4def716` à `2769243`). **L'audit de la couche design n'a pas pu être fait** : avec la liste des réglages et les cinq modèles écrits en clair, son dossier dépasse la taille acceptée (1 283 707 signes).

1. **Juste dans son principe, corrigé.** Après conversion, seule `styles.texte.police` subsiste (la police par style est retirée, renoncement n° 30) : aucun autre style ne pouvait échouer. Mais l'exception était une rustine : la conversion vérifie maintenant contre le catalogue élargi (polices du code et de l'instance, `sources().regles`), sans exception.
2. **En partie faux.** Les tests sont dans le commit des tests, que cet audit ne voit pas : `contrats/pile/exports.test.js` passe par toute la fiche dans le navigateur (résumés, note du titre, demi-ligne ajoutée, aperçu qui suit le style ouvert et garde ses paragraphes sur la grille, modèle impossible dit dans la fiche, absence d'aperçu au format S, enregistrement), et `tests/services/modeles.test.js` teste la conversion au démarrage (servi en lignes, converti une fois, réglable ensuite). **Pas de test unitaire de `planDePage`** : le module lit le traducteur du navigateur (`commun.js`), il ne se charge pas sous Node. Non corrigé dans ce lot ; à reprendre si l'aperçu évolue.
3. **Juste, corrigé.** `retraitsDuStyle` (domaine) porte la règle ; le gabarit Typst et le plan de l'aperçu la lisent tous deux. Test ajouté ; la source Typst des livres de référence n'a pas changé.
4. **Juste, commenté.** L'approximation est dite dans le code. Le demi-gras d'EB Garamond tient lieu de gras dans le PDF aussi : l'aperçu fait de même.
5. **Juste, corrigé.** Le séparateur passe par le catalogue (`modeles.fiche.resume.puis`).
6. **Question pour Sylvain.** Les résumés sont des listes descriptives (« 11 pt, gras, centré · 1 ½ avant, ½ après »), assemblées par deux séparateurs du catalogue. L'anglais préparé se lit correctement (« 11 pt, bold, centred · 1 ½ before, ½ after »). Une langue qui demanderait un autre ordre obligerait à en faire des messages entiers.
7. **Voulu.** La liste des lignes et de leurs champs était déjà dans l'application (`groupes()` et `tableauDesStyles()` de l'ancienne page) : dire quels réglages vont ensemble est une règle, leur apparence est au design (`FicheModele`, `REGLAGES.fiche`).

## Arbitrage de Sylvain

(À compléter.)
