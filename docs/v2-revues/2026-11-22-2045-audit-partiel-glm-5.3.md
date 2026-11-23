# Audit partiel avant fusion (2026-11-22)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 429568 signes envoyés, 3653 reçus (et 6232 de réflexion) ; réflexion `low` ; 16 s ; arrêt : stop
- Diff audité : `v2/` de `1f74dda` à `54e1c49` (6 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot ajoute le clic dans le texte sur une correction pour ouvrir le volet « Corrections » sur sa carte, avec défilement et surbrillance, plus le réglage de fond clair de la carte active. L'ADR 0008 et la feuille `coquille.css` sont correctement mises à jour en accord, et un test de pile couvre le parcours. Les constats portent sur des classes CSS internes de BlockNote utilisées comme repères, des cas limites d'indices (suggestion acceptée, suggestions adjacentes) et le placement du défilement automatique dans un composant de présentation.

## Constats
1. **[question]** Grille 2 (API publique) — `v2/adaptateurs/blocknote/index.jsx:583`. Le repère du clic s'appuie sur les classes de rendu `.bn-suggestion-mark` et `.bn-suggestion-node`, qui ne sont pas une API publique documentée de BlockNote : une montée de version peut les renommer silencieusement, et le contrat ne semble pas les couvrir. Vérifier si BlockNote expose un point d'extension ou un sélecteur officiel, sinon ajouter un test de contrat qui échoue si ces classes disparaissent.
2. **[mineur]** Grille 6 (correction) — `v2/adaptateurs/blocknote/index.jsx:595`. `findIndex` avec `position >= s.debut && position <= s.fin` : deux suggestions adjacentes (ou imbriquées) partagent la position frontière, et la première de la liste gagne, pas nécessairement celle cliquée ; de même, un clic sur la fin d'un ajout peut tomber sur la suggestion suivante. Proposer un choix plus précis (position du clic via `posAtDOM(e.target, e.offsetX?)` ou comparaison stricte du côté) ou documenter l'approximation.
3. **[question]** Grille 6 (correction) — `v2/application/client/Edition.jsx:415`. `setSuggestionActive(indice)` : l'indice est celui de la liste au moment du clic ; après acceptation ou refus d'une suggestion, la liste se raccourcit et l'indice actif peut désigner une autre carte (ou dépasser la fin). Vérifier que `suggestionActive` est remis à zéro ou recalculé quand la liste change.
4. **[mineur]** Grille 1/16 (couches) — `v2/design/composants/PanneauSuggestions.jsx:46-56`. Le défilement automatique vers la carte active (`scrollIntoView`) est un comportement d'interaction placé dans un composant de présentation, que la règle 16 veut limité à l'apparence. L'effet est court et isolé, mais si d'autres comportements s'accumulent ainsi, la frontière s'effrite ; envisager de le remonter à l'application (via une ref ou un rappel) ou l'assumer dans une note de l'ADR 0008.
5. **[mineur]** Grille 7 (tests) — `v2/contrats/pile/relecture.test.js:678-700`. Le test ne couvre que les insertions (`.bn-editor ins .bn-suggestion-mark`) : ni le clic sur une suppression (barrée), ni sur un bloc suggéré (`.bn-suggestion-node`), ni le cas d'une sélection étendue qui ne doit rien ouvrir (le commentaire le dit ligne 581, mais rien ne le vérifie). Compléter le test de ces trois cas.
6. **[question]** Grille 6 (correction) — `v2/adaptateurs/blocknote/index.jsx:582-599`. `surClic` lit `donnee` capturée à la création de l'effet ; l'effet ne redémarre pas quand la liste change (dépendances ligne 618). Si `donnee` est bien une référence mutable mise à jour par `signaler`, c'est correct ; sinon le clic comparerait des positions à une liste périmée. À confirmer dans le code complet.
7. **[question]** Grille 5/22 (accessibilité) — `v2/adaptateurs/blocknote/index.jsx:582`. La fonction n'est atteignable que par un clic de souris ; la règle 22 demande une navigation au clavier équivalente. Existe-t-il un moyen clavier d'ouvrir la carte d'une correction (Tab + Entrée sur la marque) ? Sinon, le noter pour l'étape concernée.

## Points de grille sans remarque
3, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

1. **Juste, épinglé.** BlockNote n'offre pas d'événement pour ce clic. Un contrat vérifie que son rendu porte toujours `bn-suggestion-mark`, `bn-suggestion-mark--delete` et `bn-suggestion-node` (`contrats/statiques/fondations-suivi.test.js`) ; notre feuille en dépend déjà (`css.editeur.suggestions`).
2. **Juste, corrigé.** La correction retenue est celle qui contient la position (début inclus, fin exclue) ; à défaut seulement, celle qui s'y termine. Deux corrections qui se touchent ne se confondent plus.
3. **Déjà traité.** `Edition.jsx` remet la carte active à zéro dès que l'empreinte de la liste change (`useEffect(() => setSuggestionActive(null), [empreinteListe])`, hors du diff).
4. **Assumé.** Le composant ne fait que garder à l'écran la carte que l'application lui dit active, comme `PanneauMargo` garde le dernier message à l'écran ; aucune règle ni appel n'y entre.
5. **En partie corrigé.** Le test vérifie maintenant qu'une sélection étendue jusqu'à une correction n'ouvre pas le volet. Une suppression proposée porte la même classe que l'ajout (`bn-suggestion-mark`) et passe par le même code ; le bloc entier proposé n'est pas testé dans le navigateur.
6. **Confirmé.** `donnee` est une variable de l'effet que `signaler` réaffecte à chaque nouvelle liste ; `surClic` lit donc la liste en cours.
7. **Noté.** Au clavier, les cartes du volet mènent au texte (elles sont atteignables et activables) ; le chemin inverse, du texte vers la carte, n'existe pas au clavier, pas plus que pour les commentaires. À reprendre avec l'accessibilité de la relecture, pas dans ce lot.

Après corrections : `npm run format:check`, `npm run lint`, `npm test` au vert ; pile de la relecture repassée ; les trois moteurs vérifiés dans GitHub avant la fusion.

## Arbitrage de Sylvain

(À compléter.)
