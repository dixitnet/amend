# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 211853 signes envoyés, 2718 reçus (et 7690 de réflexion) ; réflexion `low` ; 15 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `9331ed0` (7 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff ajoute l'essai « barre de mise en forme en bandeau » au format S, décidé par Sylvain (ADR 0008, `css.telephone.barre`) : un portail BlockNote vers un élément du bandeau, activé par paramètre d'URL mémorisé. L'architecture est respectée (l'adaptateur ne pose ni classe ni style, le design porte l'apparence, réglage inscrit dans la table). Deux points demandent attention : la palette remplacée perd des fonctions existantes (bouton « Corriger »), et le recours à `RenderInPortalElement` et aux clés d'items mérite vérification d'API publique. Le test couvre l'essai par localStorage mais pas le paramètre d'URL.

## Constats
1. **[important]** grille 6 (correction) — `v2/adaptateurs/blocknote/index.jsx:879` (et `v2/adaptateurs/blocknote/index.jsx:213`). Quand la barre d'essai est active, la palette flottante n'est plus montée du tout, or elle portait aussi `BoutonCorriger` en mode Corriger (et les autres items : type de bloc, etc.) : au format S avec l'essai, un correcteur perd l'accès au mode suggestion par la palette. L'essai « quatre boutons » est décidé, mais la perte du bouton « Corriger » n'est pas mentionnée dans l'ADR. Proposer : inclure le bouton « Corriger » dans `BarreEnBandeau` quand `corriger` est actif, ou noter l'écart dans l'ADR 0008.
2. **[question]** grille 2 (API publique) — `v2/adaptateurs/blocknote/index.jsx:223` et `v2/adaptateurs/blocknote/index.jsx:880`. `getFormattingToolbarItems` et `RenderInPortalElement` sont-elles des exports publics et stables des paquets BlockNote (et non des chemins internes) ? De même, filtrer sur `b.key` (`index.jsx:224`) s'appuie sur les clés des éléments React retournés, qui ne sont pas documentées comme contrat : une montée de version peut les changer silencieusement. Vérifier dans les exports et ajouter un test de contrat sur les quatre boutons présents.
3. **[mineur]** grille 7 (tests) — `v2/contrats/pile/telephone.test.js:229`. Le test active l'essai en écrivant directement `localStorage`, mais le chemin réel d'activation (`?barre=bandeau` dans l'adresse, qui écrit puis mémorise, et `?barre=flottante` qui désactive, `v2/application/client/aidesEdition.jsx:64-73`) n'est pas couvert. Ajouter un test du paramètre d'URL dans les deux sens.
4. **[mineur]** grille 4 (simplicité) — `v2/application/client/Edition.jsx:616`. `refBarre` est passé dès que l'essai est actif, même hors format S, où `cibleBarre` ne sert jamais (`Edition.jsx:523` le conditionne à `formatS`). Sans effet de bord, mais la condition peut être rapprochée : `refBarre={formatS && essaiBarre ? setCibleBarre : undefined}`.

## Points de grille sans remarque
1 (couches), 3 (redondance), 5 (sécurité), 8 (exports), 9 (traductions), 10 (licences).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides

## Réponse de Claude

1. *Juste* : l'essai garde le bouton « Corriger » de Margo et ne propose aucune mise en forme en mode Corriger, comme la palette ; seuls les types de bloc et les styles rares (barré, couleur, exposant, retraits) manquent à l'essai, ce qui est son but (« essai réduit »).
2. *Faux en partie* : `getFormattingToolbarItems` et `RenderInPortalElement` sont des exports publics de `@blocknote/react`, déjà utilisés par la palette et la liste des fils ; la dépendance aux clés existe déjà dans `palette.js` (un test vérifie qu'elles existent), et le test de pile de l'essai vérifie que le bouton « Gras » est présent.
3. *Juste* : test de pile ajouté (`?barre=bandeau` active et retient, `?barre=flottante` retire).
4. *Voulu* : `refBarre` ne sert qu'au format S mais ce composant n'est monté qu'à ce format ; sans effet ailleurs.

## Arbitrage de Sylvain

(À compléter.)
