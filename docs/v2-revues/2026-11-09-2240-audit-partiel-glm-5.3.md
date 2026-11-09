# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 236617 signes envoyés, 2893 reçus (et 16146 de réflexion) ; réflexion `low` ; 23 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `7566243` (37 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; fusion demandée par Sylvain (« Fusionne », 09/11/2026).

## Avis de l'auditeur

## Synthèse
Lot cohérent avec les règles : coquille Mantine dans le design, réglages tous tracés dans l'ADR 0008, textes passés au catalogue, fenêtres de saisie remplaçant `window.prompt`, tests mis à jour en conséquence. Deux points notables : une erreur de logique dans le titre courant du plan (retombe sur le premier titre quand on a défilé sous le dernier), et un couplage de l'adaptateur BlockNote au DOM du design (sélecteur `body header`). Quelques questions mineures sur le format S et l'accessibilité.

## Constats
1. **[important]** grille 6 (correction), `v2/adaptateurs/blocknote/plan.js:49` — `titreCourant` retourne `titres[0]` quand aucun titre n'est visible ; or ce cas arrive dès qu'on a défilé sous le dernier titre (lecture de la fin d'un chapitre) : le plan surligne alors le premier titre au lieu du dernier traversé. Proposer de retourner le dernier titre dont le haut est passé au-dessus du seuil (comme le comportement décrit de Docs), et l'ajouter au test.
2. **[important]** grille 1 (couches), `v2/adaptateurs/blocknote/plan.js:38` — `hautVisible()` interroge `document.querySelector('body header')` et sa `position` : l'adaptateur (couche 2) connaît la structure et un réglage du design (bandeau fixe, hauteur). Si le design change le bandeau, l'adaptateur casse silencieusement. Proposer que l'application (ou le design) fournisse la valeur du décalage à `EditeurCollaboratif`, ou un point d'ancrage convenu.
3. **[mineur]** grille 6, `v2/application/client/App.jsx:837` — `aEteConnecte.current = true` est écrit pendant le rendu (anti-pattern React ; en mode strict le rendu peut être rejoué). Le mettre dans un effet sur `connexion`.
4. **[question]** grille 6, `v2/adaptateurs/blocknote/index.jsx:188` — le défilement n'est écouté que sur `window` : si le texte défile dans un conteneur interne (AppShell, volet), le titre courant ne se met plus à jour. Vérifier que la colonne de texte défile bien la fenêtre dans les trois formats ; sinon écouter aussi le conteneur d'édition.
5. **[question]** grille 9/7, `v2/application/client/App.jsx:696` — `enFenetre` est passé sans condition : en format S, le partage s'affiche dans le panneau (qui porte son propre titre) et non dans une fenêtre ; le `Title` du panneau pourrait y manquer. Vérifier le rendu du partage en format S.
6. **[mineur]** grille 7, `v2/tests/unitaires/blocknote-plan.test.js:10` — `titresDe` est bien couvert, mais `titreCourant` (cas limites : dernier titre dépassé, bandeau) et `allerAuTitre` ne le sont qu'indirectement par le test de pile ; le défaut du constat 1 serait attrapé par un test dédié.
7. **[mineur]** grille 5/22, `v2/design/composants/Coquille.jsx:141` — l'avatar du compte est rendu vide (`<Avatar />`), sans nom ni initiales : pastille sans information pour la personne. Passer `name={compte.nom}` comme pour la présence.

## Points de grille sans remarque
2, 3, 4, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

Audit de l'intégration des formats S (main) et M/L (étape 6b).

1. **Juste**, corrigé : si tous les titres sont passés, le titre courant est le dernier (Docs revient au premier : écart noté dans `plan.js`). Vérifié par le parcours « plan » de la pile (défilement tout en bas).
2. **Juste**, corrigé au bon niveau : l'adaptateur ne cherche plus le bandeau. La couche design pose une marge d'ancrage sur les blocs (`scroll-margin-top: var(--app-shell-header-offset)`, variable de Mantine ; réglage `css.coquille.ancres`, ADR 0008) ; l'adaptateur la lit pour le titre courant, et `scrollIntoView` la respecte.
3. **Juste**, corrigé : « déjà connecté une fois » est un état mis à jour dans un effet.
4. **Vérifié** : dans les trois formats, le texte défile la fenêtre (AppShell de Mantine en L et M, page simple en S) ; les parcours « plan » de la pile (L) et du téléphone (S) passent.
5. **Faux** : en S, le partage s'ouvre dans le panneau plein écran, dont le titre est « Partage » ; `enFenetre` évite seulement un second titre. Vérifié par le parcours du téléphone (`dialog` nommé « Partage »).
6. **Juste en partie** : `titreCourant` dépend de la mise en page (positions à l'écran) ; il est vérifié sur un vrai navigateur (parcours « plan », dont le cas du constat 1), pas en test unitaire.
7. **Voulu** : avec ses initiales, le bouton du compte a un nom accessible (« Mon compte ») qui ne contient pas son texte visible : défaut sérieux pour axe (`label-content-name-mismatch`, test d'accessibilité de la pile). Le nom et l'adresse s'affichent en tête du menu du compte.

Contrôles : v2 (format, lint, knip, 182 tests rapides, 47 sur la pile) et racine verts.

## Arbitrage de Sylvain

(À compléter.)
