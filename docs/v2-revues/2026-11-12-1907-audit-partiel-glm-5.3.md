# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 190248 signes envoyés, 3019 reçus (et 9979 de réflexion) ; réflexion `low` ; 17 s ; arrêt : stop
- Diff audité : `v2/` de `5459c72` à `70e18b9` (7 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse

Le diff porte sur trois sujets : la liaison du mode suggestions mémorisée (`lier`) pour éviter un redessin qui perdait la première touche au format S, le rafraîchissement de la liste des suggestions au repos (300 ms) avec récupération « à l'index près » au geste (`fraiche`), et l'annulation (Ctrl+Z) désormais refusée au contact d'une suggestion, couverte par tests. L'architecture est respectée (adaptateur ↔ extensions, permis). Deux points de correction méritent attention : la robustesse de `fraiche` en mode Corriger, et un changement de comportement annoncé en commentaire sans code visible dans ce diff.

## Constats

1. **[important]** grille 6 (correction), `v2/adaptateurs/blocknote/index.jsx:472` — `fraiche` retrouve la suggestion « à la même place dans une liste fraîche », justifié par le commentaire « en Éditer, la frappe ne crée ni ne retire de suggestion » (`index.jsx:470`). Mais `affichees = mode !== 'lire'` (`index.jsx:480`) : en **Corriger**, la frappe crée des suggestions et décale la liste ; `donnee` peut avoir jusqu'à 300 ms de retard (`LISTE_AU_REPOS`, `index.jsx:73`), et un clic sur Accepter/Refuser juste après une frappe peut viser la mauvaise suggestion (`index.jsx:474-475`). Proposer soit de limiter `fraiche` au mode Éditer, soit une identification par identité de contenu plutôt que par index, et un test de pile du cas « frappe en Corriger puis acceptation immédiate ».
2. **[question]** grille 7 (tests), `v2/extensions/garde-suggestions/index.js:14` — le commentaire annonce que l'annulation (Ctrl+Z) est désormais refusée, mais ce diff ne montre aucun changement de code dans l'extension (seules les lignes de commentaire changent) ; le test de pile (`v2/contrats/pile/relecture.test.js:224`) et les tests unitaires (`v2/tests/unitaires/garde-suggestions.test.js:76-77`) l'exigent. Le refus vient-il d'un commit antérieur (auquel cas le commentaire corrige une documentation fausse), ou manque-t-il le changement de code dans ce lot ? À vérifier en faisant tourner les tests.
3. **[mineur]** grille 6, `v2/adaptateurs/blocknote/index.jsx:729` — `lier(modeApresAppui)` dans `commencer` est sans effet si `afficheur` est encore nul (`index.jsx:436`), et le commentaire (`index.jsx:726-728`) dit que c'est justement pour ne pas perdre la première touche. Si le texte est touchable, l'afficheur est sans doute prêt, mais le garde-fou mérite une ligne ou un test. Proposer de le noter ou de l'assertion dans le test de pile du format S.
4. **[mineur]** grille 4, `v2/application/client/Edition.jsx:515` — `modeApresAppui={modesPermis[0]}` est passé même quand `surAppuiEnLecture` est `undefined` (ligne 514), c'est-à-dire quand personne ne l'utilisera. Sans conséquence, mais la prop pourrait suivre la même condition que `surAppuiEnLecture` pour la lisibilité.

## Points de grille sans remarque

1, 2, 3, 5, 8, 9, 10 (aucune arête hors graphe — l'adaptateur BlockNote importe ses extensions, ce qui est permis ; aucun texte en dur nouveau ; aucune dépendance nouvelle).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. **Juste, corrigé.** En Corriger, la frappe crée des suggestions : la place dans la liste ne suffit pas. Seul le défilement y est exposé (on n'accepte et ne refuse qu'en Éditer), mais `fraiche` retrouve désormais la suggestion par son contenu (type, auteur, passage), la plus proche de l'ancienne position s'il y en a plusieurs, la place dans la liste en dernier recours. Test de pile ajouté (« accepter aussitôt après une frappe », `contrats/pile/relecture.test.js`) : l'éditrice tape au début puis accepte dans la foulée ; la bonne suggestion est acceptée.
2. **Le refus existait déjà ; seul le commentaire était faux.** L'annulation de ProseMirror est une transaction locale sans méta de la liaison : `filterTransaction` la refusait depuis le premier commit du garde-fou. Le commentaire, qui disait l'inverse, est corrigé ; les tests le vérifient (verts).
3. **Sans objet.** L'afficheur est créé avec l'éditeur (`useMemo`, même rendu) dès que la personne reçoit les suggestions, c'est-à-dire pour tout éditeur et tout correcteur ; `surAppuiEnLecture` n'est donné qu'à eux (au lecteur, rien). Le test du format S du correcteur (`contrats/pile/telephone.test.js`) passe par ce chemin.
4. **Juste, appliqué.** `modeApresAppui` suit la même condition que `surAppuiEnLecture`.

## Arbitrage de Sylvain

(À compléter.)
