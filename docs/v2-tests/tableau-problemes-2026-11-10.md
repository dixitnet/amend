# amend.ink v2 : tableau des problèmes, après diagnostic (10/11/2026)

Prototype : pas de restriction de fonction (Sylvain, 10/11/2026). Sources : `constats-et-precos-2026-11-10.md`, `synthese-2026-11-10.md`, `plan-amont-2026-11-10.md`.

## Comment le diagnostic a été fait

- Scénarios de diagnostic H13 à H20 (`v2/exploitation/campagne/scenarios-complements.mjs`), qui séparent les gestes un à un.
- **Comparaison avec le montage de référence de BlockNote** (exemple `07-collaboration/12-multi-doc-versioning`, branché sur y/hub) : un seul éditeur et un seul afficheur des suggestions ; le mode change par `enableSuggestions` / `viewSuggestions` / `disableSuggestions`. Notre montage, lui, **recrée l'éditeur et l'afficheur à chaque bascule** de l'interrupteur, et **reconstruit l'afficheur avec les auteurs** que donne y/hub (un ajout à nous). Les cas ont été rejoués dans une copie de travail (non commitée) : (a) sans recréation à la bascule ; (b) en plus, sans la reconstruction avec les auteurs. Ce qui disparaît dans (a) ou (b) vient de notre montage ; ce qui reste vient des fondations.

## Tableau

| # | Problème | Cause (diagnostic) | Brique | Identifié par les dev | Préco |
|---|---|---|---|---|---|
| 1 | Supprimer un paragraphe (double-clic, Suppr, en suivi) puis accepter : le texte est faux (« XLigne C », ou « Ligne C » en double si on accepte ligne à ligne) | **fondation, établi** : en suivi, une suppression qui franchit la fin d'un paragraphe est enregistrée comme une fusion (le texte supprimé n'est pas noté) ; l'accepter, en tout ou en partie, donne un texte faux ; identique dans le montage de BlockNote | `@y/prosemirror` (mode suggestion) | en partie : « Broken merge… a flat document model would be needed » (galerie de BlockNote), y-prosemirror#263 ; notre cas exact : non | cas minimal, signaler |
| 2 | Un document ne peut plus passer en suivi (page blanche, `reading 'copy'`) | **non isolé** : erreur dans le rendu des contenus attribués de Yjs 14 ; le document avait connu 1, 4 et 6 ; recette non retrouvée (H11, H12) | Yjs 14 (`@y/y`), déclenché peut-être par notre montage (3, 4) | non | rattraper l'erreur (rester hors suivi, avec un message) ; réessayer sur le document témoin après les corrections de 3 et 4 ; signaler si ça persiste |
| 3 | Écran blanc en activant le suivi juste après la résolution d'un fil | **notre montage, établi** : la recréation de l'éditeur à la bascule ; sans recréation, plus de plantage (B7, 2/2) ; l'erreur elle-même est en amont | notre adaptateur (`adaptateurs/blocknote`) ; `@y/prosemirror` | oui pour l'erreur : y-prosemirror#288 | **corriger chez nous** : montage de BlockNote, sans recréation (correctif prêt) ; ajouter notre déclencheur au ticket |
| 4 | Les suggestions d'un éditeur sortent des panneaux dès qu'il tape en direct | **notre montage, établi** : la reconstruction de l'afficheur avec les auteurs de y/hub ; seule la frappe de l'auteur de la suggestion la fait sortir (H13) ; sans cette reconstruction, la suggestion reste (H2, 2/2) | notre adaptateur (`suivreAuteurs`, `creerAfficheur`) | sans objet | **corriger chez nous** : revoir la façon d'obtenir les auteurs (voir comment BlockNote et y/hub le prévoient) |
| 5 | Après l'arrêt du suivi, la frappe collée à une suggestion la prolonge | **fondation, établi** : persiste dans le montage de BlockNote ; choix de conception | `@y/prosemirror` | oui : y-prosemirror#245 (jalon M2, reporté) | attendre ; le dire aux testeurs |
| 6 | Accepter (ligne à ligne) ne fait rien sur un paragraphe proposé | **notre panneau, établi** : la plage transmise couvre le texte, pas le paragraphe ; « Tout accepter » le fait entrer (H16) | notre adaptateur (`listeDesSuggestions`) | sans objet | **corriger chez nous** : plage élargie au paragraphe proposé |
| 7 | Suppression d'un paragraphe par un correcteur absente du panneau | **notre montage, établi** : avec la reconstruction des auteurs, elle n'est pas marquée ; sans elle, elle est listée (mais Accepter ne fait rien, comme 6) | notre adaptateur (`suivreAuteurs`) ; puis plage (6) | sans objet | corriger avec 4 et 6 |
| 8 | Une lectrice reste sur un texte périmé après deux éditeurs au même endroit | **fondation, établi** : le serveur a tout (une nouvelle éditrice et la réouverture ont le texte complet, H19) ; seule la connexion **en lecture seule** perd des morceaux, même après rechargement (H18) | y/hub 0.10.1 (synchronisation des connexions en lecture) | pas de ticket ; la version suivante de y/hub refait justement cette synchronisation (journal, « Unreleased ») | signaler avec le cas ; réessayer à la prochaine version |
| 9 | Texte tapé en direct devenu suggestion (une fois, à la main) | probable : même cause que 4 (afficheur reconstruit avec les auteurs) | notre adaptateur | — | revoir après la correction de 4 |
| 10 | Retirer un accès ou rétrograder ne prend effet qu'au rechargement | nous n'appelons pas la revérification des connexions | **notre serveur** (y/hub fournit `recheckAuth`) | outil fourni (yhub#72) ; Docs l'utilise | **corriger chez nous**, comme Docs |
| 11 | « Restaurer » sans confirmation ; perte de données en ligne | notre branchement de l'historique ; en local l'état d'avant est gardé, en ligne non : écart à voir en ligne | **notre code**, y/hub (`rollback`) | Docs : confirmation + `rollback` | **corriger chez nous**, comme Docs |
| 12 | Instantanés rares | notre réglage | **notre code** | — | régler (décision de Sylvain) |
| 13 | Fils résolus introuvables | liste des fils non affichée | **notre code** (BlockNote fournit `ThreadsSidebar`) | Docs : « Ouverts / Résolus » | **ajouter chez nous**, comme Docs |
| 14 | Typographie absente en suivi et dans les commentaires | en suivi, nous la retirons (défaut des règles de saisie en mode suggestion, « mismatched transaction ») ; les commentaires n'ont pas notre extension | règles de saisie (`@handlewithcare/prosemirror-inputrules`, BlockNote) ; notre code | en partie : BlockNote#2843 (non intégrée), #3310 en cours | réessayer avec le montage sans recréation (3) ; brancher la typographie sur les commentaires ; signaler |
| 15 | Gras en suivi non arbitrable | suggestions de mise en forme non listées | BlockNote, `@y/prosemirror` | voisins : y-prosemirror#289, #241 | revoir après 4 (même montage), puis signaler |
| 16 | « Quelqu'un » avant le nom, parfois durable | **notre montage** : l'afficheur part sans auteurs, puis est reconstruit quand y/hub les donne (1,5 s, ou jamais s'il ne répond pas) | notre adaptateur (`suivreAuteurs`) | — | corriger avec 4 |
| 17 | Panneau trompeur sur coupures, fusions, suppressions à cheval | rendu par blocs ; même famille que 1 | `@y/prosemirror` | oui : `CAVEATS.md` | accepter pour l'instant |
| 18 | Lettres entremêlées au même endroit | algorithme de fusion de Yjs | Yjs | rien de prévu | accepter (rare) |
| 19 | « deux:points » ouvre les émojis | menu « : » de BlockNote | BlockNote | non | régler chez nous |
| 20 | Info-bulle « Supprimé par » qui reste affichée | non diagnostiqué (vu à la main seulement) | BlockNote ou nous | non | reproduire avec Sylvain |
| 21 | Clic en fin de ligne, curseur au premier paragraphe | non reproduit (H4 à H6, 9/9 corrects) | — | — | reproduire avec Sylvain |
| 22 | `getSuggestionAtSelection` cherche des marques inexistantes | noms périmés | BlockNote | non | signaler |

## Après la reconstruction (11/11/2026)

Montage de l'exemple de BlockNote, trois modes (Modifier, Suggérer, Relire), auteurs lus à part, historique par 5 minutes (`docs/journal-decisions.md`, 10/11/2026). Campagne rejouée en local (Chromium, 2 fois chaque famille) :

| # | État |
|---|---|
| 3 écran blanc après résolution d'un fil | **corrigé** (B7 2/2) |
| 4, 9 suggestions qui sortent du panneau | **corrigé** (H2, H13, H15 2/2) |
| 5 frappe qui prolonge une suggestion | **évité par les modes** : on n'écrit plus par-dessus des suggestions affichées ; en Modifier, la frappe collée à une suggestion va dans le texte (B2 « juste après » 2/2) |
| 6 paragraphe proposé qu'Accepter ignorait | **corrigé** (C3 2/2) |
| 16 « Quelqu'un » | **corrigé** pour les ajouts et remplacements ; reste pour certaines suppressions (auteur des contenus supprimés pas retrouvé) |
| 7 suppression d'un paragraphe entier par un correcteur | **fondation, établi** : visible si l'éditrice est en relecture au moment où elle arrive (H21), **perdue de l'affichage après un rechargement** ou si l'éditrice était en Modifier (H22, C3) : l'afficheur ne la retrouve pas en partant d'un état neuf ; « Tout accepter » l'applique quand même. À signaler à `@y/prosemirror` |
| 8 lectrice en retard | non reproduit dans cette série (H9, H18, H19 2/2) ; à surveiller |
| 1, 15, 17, 18 | inchangés (fondations) |
| 10, 11, 12, 13, 14 (commentaires), 19 | inchangés (lots suivants) ; 12 : le regroupement par 5 minutes ne se voit pas dans un essai de 2 minutes (H8) |

## Ce que ça change

- **Notre montage du suivi explique une grande partie des défauts** : 3 (écran blanc), 4 et 9 (suggestions perdues), 6 et 7 (paragraphes non arbitrables), 16 (« Quelqu'un »), et peut-être 2 et 15. Deux écarts au montage de BlockNote en sont la cause : la recréation de l'éditeur à chaque bascule, et la reconstruction de l'afficheur avec les auteurs de y/hub.
- **Restent aux fondations** : 1 (suppression à travers un paragraphe), 5 (frappe qui prolonge), 8 (lecteurs de y/hub), 17, 18, et l'erreur de fond de 2 et 3.
- **Préconisation principale** : revenir au montage de BlockNote (un éditeur, un afficheur, changement de mode par l'extension), revoir l'obtention des auteurs, élargir la plage d'acceptation ; puis rejouer toute la campagne et les essais à la main avant de signaler à l'amont ce qui reste.
