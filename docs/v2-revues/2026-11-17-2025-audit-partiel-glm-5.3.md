# Audit partiel avant fusion (2026-11-17)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 265010 signes envoyés, 1037 reçus (et 2289 de réflexion) ; réflexion `low` ; 7 s ; arrêt : stop
- Diff audité : `v2/` de `84de09b` à `c6e7ed6` (4 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff retire la restriction de palette propre au format S (choix du type de bloc), décision de Sylvain du 17/11/2026, et nettoie prop, fonction, export et test associés. Le retrait est cohérent sur les trois fichiers : plus de code mort ni d'option résiduelle. Un seul écart : le nouveau test annonce plus qu'il ne vérifie.

## Constats
1. **[mineur]** Grille 7 (tests), `v2/tests/unitaires/blocknote-palette.test.js:62` — Le test s'intitule « en Suggérer, aucun bouton de forme », mais il ne vérifie l'absence que de trois clés explicites (`blockTypeSelect`, `boldStyleButton`, `createLinkButton`), au lieu de parcourir `BOUTONS_DE_FORME` (défini à `v2/adaptateurs/blocknote/palette.js:35`), qui est la liste de référence des boutons de forme. Si BlockNote ajoute ou renomme un bouton de forme, le test ne le détectera pas. Proposition : itérer sur `BOUTONS_DE_FORME` dans la boucle d'absence, comme le fait le test précédent (ligne 57) pour `BOUTONS_RETIRES`.

## Points de grille sans remarque
1, 2, 3, 4, 5, 6, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides

## Réponse de Claude

1. Juste, mineur, laissé : le test garde la forme de celui qu'il remplace (clés explicites) ; `BOUTONS_DE_FORME` n'est pas exporté. À reprendre si BlockNote renomme un bouton.

## Arbitrage de Sylvain

Fusion demandée par Sylvain le 17/11/2026.
