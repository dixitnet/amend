# amend.ink v2, étape 5 « Relecture » : rapport de tests (09/11/2026)

## Résultats

| Ensemble | Résultat |
|---|---|
| Tests rapides (T0 à T4 : domaine, serveur, commentaires contre PostgreSQL, y/hub par branche et par rôle, contrats statiques, design, traductions) | 118 / 118 |
| Pile complète dans Chromium (T5, dont `contrats/pile/relecture.test.js` : accepter avec l'auteur, nouveau paragraphe du correcteur, tout refuser, commentaire ancré par le serveur, présence, historique selon le rôle) | 35 / 35 |
| Campagne v2 (`exploitation/campagne/invariants.mjs`, 90 cas : 7 natures de sélection, 4 gestes, 5 saisies, éditrice sans suggestion et correctrice en suggestion) | 298 vérifications, 0 échec |

Campagne v2, par invariant :

| Invariant | Échecs / vérifications |
|---|---|
| sans suggestion : aucune marque | 0 / 45 |
| sans suggestion : le passage est remplacé | 0 / 28 |
| en suggestion : rien de perdu (le départ se lit, barré compris) | 0 / 45 |
| « tout refuser » rend le départ | 0 / 45 |
| le même geste puis « tout accepter » = le geste sans suggestion | 0 / 45 |
| aucune erreur de console | 0 / 90 |

## Ce qui a été questionné

- La campagne de la v1, transposée d'abord telle quelle (266 cas), n'a relevé aucune perte ; ses échecs portaient sur des critères de présentation (comme Google Docs). Sylvain : ne garder de la v1 que des idées ; critère de sortie réécrit.
- Une fausse alerte de « corruption » (paragraphe coupé au milieu) venait du script : Fin puis Entrée sans laisser ProseMirror lire la sélection.

## Limites connues

- Découpage des suggestions par Yjs (lettres communes hors de la proposition) : gardé (Sylvain, 9b), veille.
- Après un retour au « Début du document », la première suggestion qui recrée la structure s'affiche mal chez l'éditeur (données justes ; rechargement suffisant).
- La lectrice ne voit pas les curseurs des autres (placés dans le document des suggestions).
- Une suggestion toute fraîche reste un instant sans nom (auteurs relus dans y/hub 1,5 s après le dernier changement).
- Non testé ici : Safari et Firefox (la CI fait passer les tests de la pile sur les trois moteurs) ; Annuler en suggestion (plus tard, décision de Sylvain).
