# Campagne de test de la v2, 2026-11-14 (04dd04e)

**À traiter : 2 régression(s), 0 scénario(s) instable(s), 1 script(s) en panne.**

Défauts connus toujours là : 2. Défauts connus qui passent maintenant : 2. À qualifier (combinaison jamais passée au bilan) : 65. Scénarios hors référence : 0. Scénarios de la référence non joués : 0.

## Tableau

Scénarios passés sur scénarios joués (hors diagnostics et sans objet), par famille ; entre parenthèses, les scripts en panne.

| Famille | chromium/L | chromium/M | chromium/S | en ligne | firefox/L | firefox/M | firefox/S | webkit/L | webkit/M | webkit/S |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| commentaires | 13/15 | 13/15 | 14/15 (1) | 15/15 | 13/15 | 13/15 | 14/15 (1) | 13/15 | 10/15 (2) | 11/15 (3) |
| complements | 11/11 | 11/11 | 9/11 (2) | 11/11 | 11/11 | 11/11 | 9/11 (2) | 8/11 | 8/11 | 7/11 (2) |
| correcteurs | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 |
| editeur | 13/13 | 13/13 | 13/13 | 13/13 | 8/13 | 8/13 | 8/13 | 13/13 | 13/13 | 13/13 |
| historique | 1/1 | 1/1 | – | 1/1 | 1/1 | 1/1 | – | 1/1 | 1/1 | – |
| robustesse | 6/6 | 6/6 | 6/6 | 5/5 | 5/6 | 5/6 | 5/6 | 5/6 | 5/6 | 5/6 |
| roles | 4/4 | 4/4 | 4/4 | 3/4 (1) | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 |
| suivi | 20/21 | 19/21 | 20/21 | 20/21 | 20/21 | 19/21 | 20/21 | 20/21 | 19/21 | 20/21 |
| **Total** | 82/85 | 81/85 | 80/84 (3) | 82/84 (1) | 76/85 | 75/85 | 74/84 (3) | 78/85 | 74/85 (2) | 74/84 (5) |

## Régressions (2)

Attendus, et ne passent plus : à corriger, dans le code d’abord.

- **2 fois**, echoue : Accepter « … » » : RIEN
  - où : chromium/L, en ligne
  - scénarios : B10

## Scripts en panne (1)

Le script n’est pas allé au bout (« préparation » : le cas n’a pas pu être monté) : à réparer dans les gestes.

- **1 fois**, préparation : préparation en panne : texte de départ absent chez Lucie (commun.mjs:N)
  - où : en ligne
  - scénarios : E2

## À qualifier (65)

Première fois sur cette combinaison : à passer au bilan, puis à inscrire dans la référence.

- **8 fois**, echoue : texte : « … »
  - où : webkit/L, webkit/M, webkit/S
  - scénarios : H4, H5, H6
- **8 fois**, echoue : Accepter « … » » : RIEN
  - où : chromium/M, chromium/S, firefox/L, firefox/M, firefox/S, webkit/L, webkit/M, webkit/S
  - scénarios : B10
- **6 fois**, panne : exception : locator.click: Timeout Nms exceeded. (scenarios-complements.mjs:N)
  - où : chromium/S, firefox/S, webkit/S
  - scénarios : H6, H7
- **6 fois**, echoue : arrivé chez Lucie en N.N s ; N signes de plus
  - où : firefox/L, firefox/M, firefox/S
  - scénarios : A2
- **6 fois**, echoue : pendant la coupure, chez Lucie : déjà là ?
  - où : firefox/L, firefox/M, firefox/S, webkit/L, webkit/M, webkit/S
  - scénarios : F1
- **4 fois**, echoue : accès aux fils résolus dans l’interface : oui
  - où : firefox/L, firefox/M, webkit/L, webkit/M
  - scénarios : D2
- **3 fois**, echoue : onglet « … » : ouverts N, résolus N
  - où : chromium/M, webkit/L, webkit/M
  - scénarios : D2
- **3 fois**, panne : exception : locator.click: Timeout Nms exceeded. (scenarios-commentaires.mjs:N)
  - où : chromium/S, firefox/S, webkit/S
  - scénarios : D2
- **3 fois**, echoue : texte (Lucie) : « … »
  - où : firefox/L, firefox/M, firefox/S
  - scénarios : A2
- **3 fois**, echoue : blocs (Edith) : paragraph, paragraph, paragraph, paragraph
  - où : firefox/L, firefox/M, firefox/S
  - scénarios : A2
- **3 fois**, echoue : obtenu : « … »
  - où : firefox/L, firefox/M, firefox/S
  - scénarios : A3
- **3 fois**, echoue : mode après rechargement : Éditer (attendu : Lire)
  - où : chromium/M, firefox/M, webkit/M
  - scénarios : B9
- **2 fois**, instable : onglet « … » : ouverts N, résolus N
  - où : firefox/L, firefox/M
  - scénarios : D2
- **2 fois**, echoue : messages (API) : Pourquoi la nuit ?
  - où : webkit/M, webkit/S
  - scénarios : D1
- **2 fois**, panne : exception : locator.hover: Timeout Nms exceeded. (scenarios-commentaires.mjs:N)
  - où : webkit/M, webkit/S
  - scénarios : D1
- **2 fois**, panne : exception : locator.click: Timeout Nms exceeded. (gestes.mjs:N)
  - où : webkit/M, webkit/S
  - scénarios : D2
- **1 fois**, instable : accès aux fils résolus dans l’interface : oui
  - où : chromium/M
  - scénarios : D2

## Défauts connus toujours là (2)

Suivis dans la référence, avec leur issue.

- **1 fois**, echoue : accès aux fils résolus dans l’interface : oui
  - où : chromium/L
  - scénarios : D2
- **1 fois**, echoue : onglet « … » : ouverts N, résolus N
  - où : chromium/L
  - scénarios : D2

## Défauts connus qui passent maintenant (2)

À reclasser « attendu » dans la référence.

- **D2 rouvrir un fil résolu** (commentaires, en ligne) : 2/2 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - accès aux fils résolus dans l’interface : oui
  - rouvert par l’API : l’ancre revient chez Edith oui
- **D2 retrouver un fil résolu dans l’onglet « Commentaires » et le rouvrir** (commentaires, en ligne) : 2/2 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - onglet « Commentaires » : ouverts 0, résolus 1
  - actions du fil résolu : ajouteruneréaction | rouvrir | plusd'actions
  - rouvert par l’interface, ancre revenue chez Edith : oui

## Écarts entre local et en ligne (3)

Le même scénario, sous Chromium en format L, ne donne pas le même verdict sur la pile locale et sur v2.amend.ink.

- **D2 rouvrir un fil résolu** (commentaires) : echoue en local, passe en ligne ; accès aux fils résolus dans l’interface : oui
- **D2 retrouver un fil résolu dans l’onglet « Commentaires » et le rouvrir** (commentaires) : echoue en local, passe en ligne ; onglet « Commentaires » : ouverts 0, résolus 1
- **E2 Carla passe de correctrice à éditrice, le document ouvert** (roles) : passe en local, panne en ligne ; préparation en panne : texte de départ absent chez Lucie (commun.mjs:165)

## Matrice

✔ passé, ✖ échoué, ≈ instable, ⚠ script en panne, · diagnostic ou sans objet, vide : non joué.

| Scénario | chromium/L | chromium/M | chromium/S | en ligne | firefox/L | firefox/M | firefox/S | webkit/L | webkit/M | webkit/S |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| commentaires : D1 Carla (correctrice) crée un commentaire | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| commentaires : D1 Carla modifie son message | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| commentaires : D1 Edith répond par l’interface ; Paule voit la réponse dans le fil | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ |
| commentaires : D1 Edith supprime sa réponse | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ⚠ | ⚠ |
| commentaires : D1 Paule (éditrice) crée un commentaire : l’ancre chez Edith et Carla, pas  | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| commentaires : D1 Paule réagit au message de Carla | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| commentaires : D2 Carla supprime son fil (son seul message) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| commentaires : D2 le fil reste à qui l’a ouvert (Q4) : Carla supprime son premier message  | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ⚠ | ⚠ |
| commentaires : D2 Paule résout par l’interface : l’ancre disparaît chez tous | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| commentaires : D2 retrouver un fil résolu dans l’onglet « Commentaires » et le rouvrir | ✖ | ✖ | ⚠ | ✔ | ≈ | ≈ | ⚠ | ✖ | ✖ | ⚠ |
| commentaires : D2 rouvrir un fil résolu | ✖ | ≈ | ✔ | ✔ | ✖ | ✖ | ✔ | ✖ | ✖ | ✔ |
| commentaires : D3 commenter un mot, puis Carla le remplace en suggestion ; Paule accepte | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| commentaires : D3 commenter un mot, puis Paule le remplace en direct | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| commentaires : D3 commenter un passage, puis Paule le supprime | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| commentaires : D4 commenter une sélection à cheval sur deux paragraphes : le message (Q3) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| complements : H1 (P19) Carla propose ; Paule tape ailleurs en direct : la suggestion reste | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| complements : H10 (P24) « deux:points » ouvre-t-il le sélecteur d’émojis ? | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| complements : H11 (P18) recette : en suivi, supprimer un paragraphe par double-clic et Sup | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| complements : H12 (P18) recette : la même suppression, puis refuser, puis rebasculer | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| complements : H13 (diagnostic de 4) Paule fait une suggestion et arrête le suivi ; on atte | · | · | · | · | · | · | · | · | · | · |
| complements : H14 (diagnostic de 4) Paule fait une suggestion et garde le suivi ; Edith ta | · | · | · | · | · | · | · | · | · | · |
| complements : H15 (diagnostic de 4) Paule fait une suggestion, arrête, puis tape AVANT ell | · | · | · | · | · | · | · | · | · | · |
| complements : H16 (diagnostic de 6) Carla propose un paragraphe ; Paule fait « Tout accept | · | · | · | · | · | · | · | · | · | · |
| complements : H18 (diagnostic de 8) lectrice et éditrice spectatrice après deux éditeurs a | · | · | · | · | · | · | · | · | · | · |
| complements : H19 (diagnostic de 8) deux éditeurs au même endroit, puis tout le monde ferm | · | · | · | · | · | · | · | · | · | · |
| complements : H2 (P19) Paule fait une suggestion, l’arrête, puis tape ailleurs : la sugges | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| complements : H20 (diagnostic de 1) en suivi, supprimer un paragraphe par double-clic et S | · | · | · | · | · | · | · | · | · | · |
| complements : H3 (P19) Carla propose ; Paule active le suivi puis recharge : la suggestion | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| complements : H4 (P22) clic au bout de la dernière ligne, sans rien avant (témoin) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ |
| complements : H5 (P22) clic au bout de la dernière ligne, après une bascule du suivi | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ |
| complements : H6 (P22) clic au bout de la dernière ligne, après la fermeture de l’historiq | ✔ | ✔ | ⚠ | ✔ | ✔ | ✔ | ⚠ | ✖ | ✖ | ⚠ |
| complements : H7 (P21) restaurer une version : confirmation ? l’état d’avant est-il gardé  | ✔ | ✔ | ⚠ | ✔ | ✔ | ✔ | ⚠ | ✔ | ✔ | ⚠ |
| complements : H8 (P23) instantanés : combien après deux minutes de travail, et « Version a | · | · | · | · | · | · | · | · | · | · |
| complements : H9 (P16) la lectrice rattrape-t-elle deux éditeurs qui tapent au même endroi | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| correcteurs : C1 ajout à la fin | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| correcteurs : C1 ajout au début | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| correcteurs : C1 ajout au milieu (un mot) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| correcteurs : C1 ajout au milieu (une phrase, défaut d’affichage connu) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| correcteurs : C1 remplacement à la fin | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| correcteurs : C1 remplacement au début | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| correcteurs : C1 remplacement au milieu | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| correcteurs : C1 suppression à la fin | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| correcteurs : C1 suppression au début | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| correcteurs : C1 suppression au milieu | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| correcteurs : C2 deux correcteurs au même endroit, en même temps | · | · | · | · | · | · | · | · | · | · |
| correcteurs : C2 une suggestion sur une suggestion (Cyril corrige l’ajout de Carla) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| correcteurs : C3 nouveau paragraphe proposé | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| correcteurs : C3 paragraphe entier supprimé proposé : refusé à cheval, accepté vidé | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| correcteurs : C4 Paule arbitre pendant que Carla continue d’écrire | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| editeur : A1 Annuler et Rétablir : Paule n’annule que ce qu’elle a fait | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| editeur : A1 frappe, Entrée, puis Retour arrière en début de paragraphe (fusion) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| editeur : A1 gras et italique (Ctrl+B, Ctrl+I) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| editeur : A1 titre et liste par les raccourcis « # » et « - » | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| editeur : A2 collage de 10 000 signes | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✔ | ✔ | ✔ |
| editeur : A2 collage de 100 000 signes | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✔ | ✔ | ✔ |
| editeur : A2 collage de texte brut sur plusieurs lignes | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✔ | ✔ | ✔ |
| editeur : A2 collage HTML d’un traitement de texte | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✔ | ✔ | ✔ |
| editeur : A3 en Corriger, la typographie à la frappe est coupée : la frappe reste telle qu | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| editeur : A3 typographie à la frappe | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| editeur : A3 typographie au collage | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✔ | ✔ | ✔ |
| editeur : A4 deux éditeurs en même temps, au même endroit | · | · | · | · | · | · | · | · | · | · |
| editeur : A4 deux éditeurs en même temps, dans des paragraphes différents | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| editeur : A4 deux éditeurs en même temps, dans le même paragraphe | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| historique : G1 nommer une version, relire, puis revenir à cette version | ✔ | ✔ | · | ✔ | ✔ | ✔ | · | ✔ | ✔ | · |
| robustesse : F1 Carla (correctrice) perd le réseau en proposant, puis le retrouve | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| robustesse : F1 Edith perd le réseau en écrivant en direct, puis le retrouve | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| robustesse : F1 Paule perd le réseau en écrivant en suivi, puis le retrouve | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| robustesse : F2 Paule a deux onglets sur le même document et écrit dans les deux | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| robustesse : F2 Paule recharge juste après avoir tapé | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| robustesse : F3 le service de collaboration redémarre pendant que Paule écrit et que Carla | ✔ | ✔ | ✔ |  | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| roles : E1 ce que chacun voit et peut faire | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| roles : E2 Carla passe de correctrice à éditrice, le document ouvert | ✔ | ✔ | ✔ | ⚠ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| roles : E2 Carla perd son accès, le document ouvert | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| roles : E2 Edith passe d’éditrice à lectrice, le document ouvert | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B1 accepter une à une sa propre suggestion | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B1 refuser une à une sa propre suggestion | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B1 Tout accepter sa propre suggestion | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B10 une autre éditrice accepte une à une la suggestion de Paule | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| suivi : B2 activer puis arrêter le suivi, sans rien taper ; puis taper : la frappe est-ell | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B2 après une suggestion, arrêter le suivi et taper AILLEURS | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B2 après une suggestion, arrêter le suivi et taper JUSTE APRÈS elle | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B2 bascules rapides et répétées, une lettre entre chaque | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B2 bascules répétées, une seconde après chaque bascule | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B2 sans jamais activer le suivi, la frappe est directe (témoin) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B3 remplacement d’un mot en suivi | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B3 suppression à cheval sur deux paragraphes : refusée, avec un message (contourne | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B3 suppression d’un mot en suivi, puis acceptée une à une | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B4 couper un paragraphe (Entrée) puis en fusionner deux, en suivi | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B4 insertions au début, au milieu et à la fin, en suivi | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B5 Annuler en suivi, puis après l’arrêt | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B6 mise en forme (gras) en suivi : refusée (contournement) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B7 basculer juste après la résolution d’un fil | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B7 basculer pendant que Carla écrit | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B8 deux éditeurs au même paragraphe, l’un en suivi, l’autre en direct | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| suivi : B9 recharger en Corriger : le mode revient à celui de l’ouverture, les suggestions | ✔ | ✖ | ✔ | ✔ | ✔ | ✖ | ✔ | ✔ | ✖ | ✔ |

## Annexe : le détail des écarts (70)

- **B10 une autre éditrice accepte une à une la suggestion de Paule** (suivi, chromium/L) : 0/3
  - Accepter « Paule ajoute « Ajout. » » : RIEN
- **B10 une autre éditrice accepte une à une la suggestion de Paule** (suivi, en ligne) : 0/2
  - Accepter « TEST Claude Paule ajoute « Ajout. » » : RIEN
- **E2 Carla passe de correctrice à éditrice, le document ouvert** (roles, en ligne) : 0/2
  - préparation en panne : texte de départ absent chez Lucie (commun.mjs:165)
- **D2 rouvrir un fil résolu** (commentaires, chromium/M) : 1/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - accès aux fils résolus dans l’interface : oui
  - rouvert par l’API : l’ancre revient chez Edith NON
  - rouvert par l’API : l’ancre revient chez Edith oui
- **D2 retrouver un fil résolu dans l’onglet « Commentaires » et le rouvrir** (commentaires, chromium/M) : 0/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - onglet « Commentaires » : ouverts 0, résolus 1
  - actions du fil résolu : ajouteruneréaction | rouvrir | plusd'actions
  - rouvert par l’interface, ancre revenue chez Edith : NON
- **D2 retrouver un fil résolu dans l’onglet « Commentaires » et le rouvrir** (commentaires, chromium/S) : 0/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - exception : locator.click: Timeout 30000ms exceeded. (scenarios-commentaires.mjs:338)
- **D2 rouvrir un fil résolu** (commentaires, firefox/L) : 0/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - accès aux fils résolus dans l’interface : oui
  - rouvert par l’API : l’ancre revient chez Edith NON
- **D2 retrouver un fil résolu dans l’onglet « Commentaires » et le rouvrir** (commentaires, firefox/L) : 2/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - onglet « Commentaires » : ouverts 0, résolus 1
  - actions du fil résolu : ajouteruneréaction | rouvrir | plusd'actions
  - rouvert par l’interface, ancre revenue chez Edith : oui
- **D2 rouvrir un fil résolu** (commentaires, firefox/M) : 0/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - accès aux fils résolus dans l’interface : oui
  - rouvert par l’API : l’ancre revient chez Edith NON
- **D2 retrouver un fil résolu dans l’onglet « Commentaires » et le rouvrir** (commentaires, firefox/M) : 2/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - onglet « Commentaires » : ouverts 0, résolus 1
  - actions du fil résolu : ajouteruneréaction | rouvrir | plusd'actions
  - rouvert par l’interface, ancre revenue chez Edith : oui
- **D2 retrouver un fil résolu dans l’onglet « Commentaires » et le rouvrir** (commentaires, firefox/S) : 0/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - exception : locator.click: Timeout 30000ms exceeded. (scenarios-commentaires.mjs:338)
- **D2 rouvrir un fil résolu** (commentaires, webkit/L) : 0/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - accès aux fils résolus dans l’interface : oui
  - rouvert par l’API : l’ancre revient chez Edith NON
- **D2 retrouver un fil résolu dans l’onglet « Commentaires » et le rouvrir** (commentaires, webkit/L) : 0/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - onglet « Commentaires » : ouverts 0, résolus 1
  - actions du fil résolu : ajouteruneréaction | rouvrir | plusd'actions
  - rouvert par l’interface, ancre revenue chez Edith : NON
- **D1 Edith répond par l’interface ; Paule voit la réponse dans le fil** (commentaires, webkit/M) : 0/3
  - messages (API) : Pourquoi la nuit ?
  - fil affiché chez Paule : Carla14 nov. / Pourquoi la nuit ?
  - exception : locator.click: Timeout 30000ms exceeded. (gestes.mjs:291)
- **D1 Edith supprime sa réponse** (commentaires, webkit/M) : 0/3
  - exception : locator.hover: Timeout 30000ms exceeded. (scenarios-commentaires.mjs:29)
- **D2 rouvrir un fil résolu** (commentaires, webkit/M) : 0/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - accès aux fils résolus dans l’interface : oui
  - rouvert par l’API : l’ancre revient chez Edith NON
- **D2 le fil reste à qui l’a ouvert (Q4) : Carla supprime son premier message après la réponse d’Edith** (commentaires, webkit/M) : 0/3
  - exception : locator.click: Timeout 30000ms exceeded. (gestes.mjs:291)
- **D2 retrouver un fil résolu dans l’onglet « Commentaires » et le rouvrir** (commentaires, webkit/M) : 0/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - onglet « Commentaires » : ouverts 0, résolus 1
  - actions du fil résolu : ajouteruneréaction | rouvrir | plusd'actions
  - rouvert par l’interface, ancre revenue chez Edith : NON
- **D1 Edith répond par l’interface ; Paule voit la réponse dans le fil** (commentaires, webkit/S) : 0/3
  - messages (API) : Pourquoi la nuit ?
  - fil affiché chez Paule : Carla14 nov. / Pourquoi la nuit ?
  - exception : locator.click: Timeout 30000ms exceeded. (gestes.mjs:291)
- **D1 Edith supprime sa réponse** (commentaires, webkit/S) : 0/3
  - exception : locator.hover: Timeout 30000ms exceeded. (scenarios-commentaires.mjs:29)
- **D2 le fil reste à qui l’a ouvert (Q4) : Carla supprime son premier message après la réponse d’Edith** (commentaires, webkit/S) : 0/3
  - exception : locator.click: Timeout 30000ms exceeded. (gestes.mjs:291)
- **D2 retrouver un fil résolu dans l’onglet « Commentaires » et le rouvrir** (commentaires, webkit/S) : 0/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - exception : locator.click: Timeout 30000ms exceeded. (scenarios-commentaires.mjs:338)
- **H6 (P22) clic au bout de la dernière ligne, après la fermeture de l’historique** (complements, chromium/S) : 0/3
  - exception : locator.click: Timeout 30000ms exceeded. (scenarios-complements.mjs:44)
- **H7 (P21) restaurer une version : confirmation ? l’état d’avant est-il gardé ?** (complements, chromium/S) : 0/3
  - exception : locator.click: Timeout 30000ms exceeded. (scenarios-complements.mjs:44)
- **H6 (P22) clic au bout de la dernière ligne, après la fermeture de l’historique** (complements, firefox/S) : 0/3
  - exception : locator.click: Timeout 30000ms exceeded. (scenarios-complements.mjs:44)
- **H7 (P21) restaurer une version : confirmation ? l’état d’avant est-il gardé ?** (complements, firefox/S) : 0/3
  - exception : locator.click: Timeout 30000ms exceeded. (scenarios-complements.mjs:44)
- **H4 (P22) clic au bout de la dernière ligne, sans rien avant (témoin)** (complements, webkit/L) : 0/3
  - texte : « Il faisait nuit sur la ville. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare Fin.. »
- **H5 (P22) clic au bout de la dernière ligne, après une bascule du suivi** (complements, webkit/L) : 0/3
  - texte : « Il faisait nuit sur la ville. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare Fin. ⏎ Nouveau.. »
- **H6 (P22) clic au bout de la dernière ligne, après la fermeture de l’historique** (complements, webkit/L) : 0/3
  - texte : « Il faisait nuit sur la ville. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare Fin.. »
- **H4 (P22) clic au bout de la dernière ligne, sans rien avant (témoin)** (complements, webkit/M) : 0/3
  - texte : « Il faisait nuit sur la ville. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare Fin.. »
- **H5 (P22) clic au bout de la dernière ligne, après une bascule du suivi** (complements, webkit/M) : 0/3
  - texte : « Il faisait nuit sur la ville. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare Fin. ⏎ Nouveau.. »
- **H6 (P22) clic au bout de la dernière ligne, après la fermeture de l’historique** (complements, webkit/M) : 0/3
  - texte : « Il faisait nuit sur la ville. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare Fin.. »
- **H4 (P22) clic au bout de la dernière ligne, sans rien avant (témoin)** (complements, webkit/S) : 0/3
  - texte : « Il faisait nuit sur la ville. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare Fin.. »
- **H5 (P22) clic au bout de la dernière ligne, après une bascule du suivi** (complements, webkit/S) : 0/3
  - texte : « Il faisait nuit sur la ville. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare Fin. ⏎ Nouveau.. »
- **H6 (P22) clic au bout de la dernière ligne, après la fermeture de l’historique** (complements, webkit/S) : 0/3
  - exception : locator.click: Timeout 30000ms exceeded. (scenarios-complements.mjs:44)
- **H7 (P21) restaurer une version : confirmation ? l’état d’avant est-il gardé ?** (complements, webkit/S) : 0/3
  - exception : locator.click: Timeout 30000ms exceeded. (scenarios-complements.mjs:44)
- **A2 collage de texte brut sur plusieurs lignes** (editeur, firefox/L) : 0/3
  - texte (Lucie) : « Il faisait nuit sur la ville. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. »
- **A2 collage HTML d’un traitement de texte** (editeur, firefox/L) : 0/3
  - blocs (Edith) : paragraph, paragraph, paragraph, paragraph
  - mises en forme : 
  - texte : « Il faisait nuit sur la ville. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. »
- **A2 collage de 10 000 signes** (editeur, firefox/L) : 0/3
  - arrivé chez Lucie en 20.1 s ; 0 signes de plus
- **A2 collage de 100 000 signes** (editeur, firefox/L) : 0/3
  - arrivé chez Lucie en 60.1 s ; 0 signes de plus
  - frappe ensuite, arrivée chez Lucie en 0.2 s
  - frappe ensuite, arrivée chez Lucie en 0.3 s
- **A3 typographie au collage** (editeur, firefox/L) : 0/3
  - obtenu : «  »
- **A2 collage de texte brut sur plusieurs lignes** (editeur, firefox/M) : 0/3
  - texte (Lucie) : « Il faisait nuit sur la ville. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. »
- **A2 collage HTML d’un traitement de texte** (editeur, firefox/M) : 0/3
  - blocs (Edith) : paragraph, paragraph, paragraph, paragraph
  - mises en forme : 
  - texte : « Il faisait nuit sur la ville. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. »
- **A2 collage de 10 000 signes** (editeur, firefox/M) : 0/3
  - arrivé chez Lucie en 20.1 s ; 0 signes de plus
  - arrivé chez Lucie en 20.2 s ; 0 signes de plus
- **A2 collage de 100 000 signes** (editeur, firefox/M) : 0/3
  - arrivé chez Lucie en 60.2 s ; 0 signes de plus
  - frappe ensuite, arrivée chez Lucie en 0.2 s
  - arrivé chez Lucie en 60.1 s ; 0 signes de plus
- **A3 typographie au collage** (editeur, firefox/M) : 0/3
  - obtenu : «  »
- **A2 collage de texte brut sur plusieurs lignes** (editeur, firefox/S) : 0/3
  - texte (Lucie) : « Il faisait nuit sur la ville. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. »
- **A2 collage HTML d’un traitement de texte** (editeur, firefox/S) : 0/3
  - blocs (Edith) : paragraph, paragraph, paragraph, paragraph
  - mises en forme : 
  - texte : « Il faisait nuit sur la ville. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. »
- **A2 collage de 10 000 signes** (editeur, firefox/S) : 0/3
  - arrivé chez Lucie en 20.2 s ; 0 signes de plus
  - arrivé chez Lucie en 20.1 s ; 0 signes de plus
- **A2 collage de 100 000 signes** (editeur, firefox/S) : 0/3
  - arrivé chez Lucie en 60.2 s ; 0 signes de plus
  - frappe ensuite, arrivée chez Lucie en 0.1 s
- **A3 typographie au collage** (editeur, firefox/S) : 0/3
  - obtenu : «  »
- **F1 Edith perd le réseau en écrivant en direct, puis le retrouve** (robustesse, firefox/L) : 0/3
  - pendant la coupure, chez Lucie : déjà là ?
  - au retour : arrivé, 1 fois
- **F1 Edith perd le réseau en écrivant en direct, puis le retrouve** (robustesse, firefox/M) : 0/3
  - pendant la coupure, chez Lucie : déjà là ?
  - au retour : arrivé, 1 fois
- **F1 Edith perd le réseau en écrivant en direct, puis le retrouve** (robustesse, firefox/S) : 0/3
  - pendant la coupure, chez Lucie : déjà là ?
  - au retour : arrivé, 1 fois
- **F1 Edith perd le réseau en écrivant en direct, puis le retrouve** (robustesse, webkit/L) : 0/3
  - pendant la coupure, chez Lucie : déjà là ?
  - au retour : arrivé, 1 fois
- **F1 Edith perd le réseau en écrivant en direct, puis le retrouve** (robustesse, webkit/M) : 0/3
  - pendant la coupure, chez Lucie : déjà là ?
  - au retour : arrivé, 1 fois
- **F1 Edith perd le réseau en écrivant en direct, puis le retrouve** (robustesse, webkit/S) : 0/3
  - pendant la coupure, chez Lucie : déjà là ?
  - au retour : arrivé, 1 fois
- **B10 une autre éditrice accepte une à une la suggestion de Paule** (suivi, chromium/M) : 0/3
  - Accepter « Paule ajoute « Ajout. » » : RIEN
- **B9 recharger en Corriger : le mode revient à celui de l’ouverture, les suggestions restent** (suivi, chromium/M) : 0/3
  - mode après rechargement : Éditer (attendu : Lire)
  - panneau : Paule ajoute « Ajout. »
- **B10 une autre éditrice accepte une à une la suggestion de Paule** (suivi, chromium/S) : 0/3
  - Accepter « Paule ajoute « Ajout. » » : RIEN
- **B10 une autre éditrice accepte une à une la suggestion de Paule** (suivi, firefox/L) : 0/3
  - Accepter « Paule ajoute « Ajout. » » : RIEN
- **B10 une autre éditrice accepte une à une la suggestion de Paule** (suivi, firefox/M) : 0/3
  - Accepter « Paule ajoute « Ajout. » » : RIEN
- **B9 recharger en Corriger : le mode revient à celui de l’ouverture, les suggestions restent** (suivi, firefox/M) : 0/3
  - mode après rechargement : Éditer (attendu : Lire)
  - panneau : Paule ajoute « Ajout. »
- **B10 une autre éditrice accepte une à une la suggestion de Paule** (suivi, firefox/S) : 0/3
  - Accepter « Paule ajoute « Ajout. » » : RIEN
- **B10 une autre éditrice accepte une à une la suggestion de Paule** (suivi, webkit/L) : 0/3
  - Accepter « Paule ajoute « Ajout. » » : RIEN
- **B10 une autre éditrice accepte une à une la suggestion de Paule** (suivi, webkit/M) : 0/3
  - Accepter « Paule ajoute « Ajout. » » : RIEN
- **B9 recharger en Corriger : le mode revient à celui de l’ouverture, les suggestions restent** (suivi, webkit/M) : 0/3
  - mode après rechargement : Éditer (attendu : Lire)
  - panneau : Paule ajoute « Ajout. »
- **B10 une autre éditrice accepte une à une la suggestion de Paule** (suivi, webkit/S) : 0/3
  - Accepter « Paule ajoute « Ajout. » » : RIEN
- **D2 rouvrir un fil résolu** (commentaires, chromium/L) : 0/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - accès aux fils résolus dans l’interface : oui
  - rouvert par l’API : l’ancre revient chez Edith NON
- **D2 retrouver un fil résolu dans l’onglet « Commentaires » et le rouvrir** (commentaires, chromium/L) : 0/3 ; passe en ligne, échoue sur la pile locale : écart de la pile locale à comprendre (bilan du 13/11/2026) (docs/v2-tests/campagnes/2026-11-13-bilan.md)
  - onglet « Commentaires » : ouverts 0, résolus 1
  - actions du fil résolu : ajouteruneréaction | rouvrir | plusd'actions
  - rouvert par l’interface, ancre revenue chez Edith : NON

## Annexe : diagnostics (100)

Des relevés, sans verdict.

- ✖ H8 (P23) instantanés : combien après deux minutes de travail, et « Version actuelle » est-elle à jour ? (chromium/L) : versions (2) : Version actuelle, 14 novembre 2026 à 1:12, Paule | Début du document, 14 novembre 2026 à 1:10, Paule
- ✔ H13 (diagnostic de 4) Paule fait une suggestion et arrête le suivi ; on attend, Edith tape ailleurs, puis Paule tape ailleurs (chromium/L) : juste après l’arrêt : Paule Paule ajoute « Ajout. » ; Edith Paule ajoute « Ajout. » ; affiché chez Paule oui
- ✔ H14 (diagnostic de 4) Paule fait une suggestion et garde le suivi ; Edith tape ailleurs (chromium/L) : panneau d’Edith (Paule en suivi) : Paule ajoute « Ajout. »
- ✔ H15 (diagnostic de 4) Paule fait une suggestion, arrête, puis tape AVANT elle dans le même paragraphe (chromium/L) : panneau de Paule : Paule ajoute « Ajout. »
- ✔ H16 (diagnostic de 6) Carla propose un paragraphe ; Paule fait « Tout accepter » (chromium/L) : texte principal (Lucie) : « Il faisait nuit sur la ville. ⏎ Nouveau paragraphe. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. » ; panneau ensuite (vide)
- ✔ H18 (diagnostic de 8) lectrice et éditrice spectatrice après deux éditeurs au même endroit ; rechargement si en retard (chromium/L) : référence (Paule) : « Il faisait nuit sur la ville.  EPdith.aule. »
- ✔ H19 (diagnostic de 8) deux éditeurs au même endroit, puis tout le monde ferme : le texte est-il complet à la réouverture ? (chromium/L) : Paule « Il faisait nuit sur la ville.  Edith.Paule. » ; Edith pareil
- ✖ H20 (diagnostic de 1) en suivi, supprimer un paragraphe par double-clic et Suppr, puis « Tout accepter » (chromium/L) : panneau : Paule supprime « X »
- ✖ H8 (P23) instantanés : combien après deux minutes de travail, et « Version actuelle » est-elle à jour ? (chromium/M) : versions (2) : Version actuelle, 14 novembre 2026 à 1:18, Paule | Début du document, 14 novembre 2026 à 1:16, Paule
- ✔ H13 (diagnostic de 4) Paule fait une suggestion et arrête le suivi ; on attend, Edith tape ailleurs, puis Paule tape ailleurs (chromium/M) : juste après l’arrêt : Paule Paule ajoute « Ajout. » ; Edith Paule ajoute « Ajout. » ; affiché chez Paule oui
- ✔ H14 (diagnostic de 4) Paule fait une suggestion et garde le suivi ; Edith tape ailleurs (chromium/M) : panneau d’Edith (Paule en suivi) : Paule ajoute « Ajout. »
- ✔ H15 (diagnostic de 4) Paule fait une suggestion, arrête, puis tape AVANT elle dans le même paragraphe (chromium/M) : panneau de Paule : Paule ajoute « Ajout. »
- ✔ H16 (diagnostic de 6) Carla propose un paragraphe ; Paule fait « Tout accepter » (chromium/M) : texte principal (Lucie) : « Il faisait nuit sur la ville. ⏎ Nouveau paragraphe. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. » ; panneau ensuite (vide)
- ✔ H18 (diagnostic de 8) lectrice et éditrice spectatrice après deux éditeurs au même endroit ; rechargement si en retard (chromium/M) : référence (Paule) : « Il faisait nuit sur la ville.  EPdith.aule. »
- ✔ H19 (diagnostic de 8) deux éditeurs au même endroit, puis tout le monde ferme : le texte est-il complet à la réouverture ? (chromium/M) : Paule « Il faisait nuit sur la ville.  PEaduile.th. » ; Edith pareil
- ✖ H20 (diagnostic de 1) en suivi, supprimer un paragraphe par double-clic et Suppr, puis « Tout accepter » (chromium/M) : panneau : Paule supprime « X »
- ⚠ H8 (P23) instantanés : combien après deux minutes de travail, et « Version actuelle » est-elle à jour ? (chromium/S) : exception : locator.click: Timeout 30000ms exceeded. (scenarios-complements.mjs:44)
- ✔ H13 (diagnostic de 4) Paule fait une suggestion et arrête le suivi ; on attend, Edith tape ailleurs, puis Paule tape ailleurs (chromium/S) : juste après l’arrêt : Paule Paule ajoute « Ajout. » ; Edith Paule ajoute « Ajout. » ; affiché chez Paule oui
- ✔ H14 (diagnostic de 4) Paule fait une suggestion et garde le suivi ; Edith tape ailleurs (chromium/S) : panneau d’Edith (Paule en suivi) : Paule ajoute « Ajout. »
- ✔ H15 (diagnostic de 4) Paule fait une suggestion, arrête, puis tape AVANT elle dans le même paragraphe (chromium/S) : panneau de Paule : Paule ajoute « Ajout. »
- ✔ H16 (diagnostic de 6) Carla propose un paragraphe ; Paule fait « Tout accepter » (chromium/S) : texte principal (Lucie) : « Il faisait nuit sur la ville. ⏎ Nouveau paragraphe. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. » ; panneau ensuite (vide)
- ✔ H18 (diagnostic de 8) lectrice et éditrice spectatrice après deux éditeurs au même endroit ; rechargement si en retard (chromium/S) : référence (Paule) : « Il faisait nuit sur la ville.  PEaduilteh.. »
- ✔ H19 (diagnostic de 8) deux éditeurs au même endroit, puis tout le monde ferme : le texte est-il complet à la réouverture ? (chromium/S) : Paule « Il faisait nuit sur la ville.  Edith.Paule. » ; Edith pareil
- ✖ H20 (diagnostic de 1) en suivi, supprimer un paragraphe par double-clic et Suppr, puis « Tout accepter » (chromium/S) : panneau : Paule supprime « X »
- ✖ H8 (P23) instantanés : combien après deux minutes de travail, et « Version actuelle » est-elle à jour ? (en ligne) : versions (2) : Version actuelle, 14 novembre 2026 à 2:26, TEST Claude Paule | Début du document, 14 novembre 2026 à 2:24, TEST Claude Paule
- ✔ H13 (diagnostic de 4) Paule fait une suggestion et arrête le suivi ; on attend, Edith tape ailleurs, puis Paule tape ailleurs (en ligne) : juste après l’arrêt : Paule TEST Claude Paule ajoute « Ajout. » ; Edith TEST Claude Paule ajoute « Ajout. » ; affiché chez Paule oui
- ✔ H14 (diagnostic de 4) Paule fait une suggestion et garde le suivi ; Edith tape ailleurs (en ligne) : panneau d’Edith (Paule en suivi) : TEST Claude Paule ajoute « Ajout. »
- ✔ H15 (diagnostic de 4) Paule fait une suggestion, arrête, puis tape AVANT elle dans le même paragraphe (en ligne) : panneau de Paule : TEST Claude Paule ajoute « Ajout. »
- ✔ H16 (diagnostic de 6) Carla propose un paragraphe ; Paule fait « Tout accepter » (en ligne) : texte principal (Lucie) : « Il faisait nuit sur la ville. ⏎ Nouveau paragraphe. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. » ; panneau ensuite (vide)
- ✔ H18 (diagnostic de 8) lectrice et éditrice spectatrice après deux éditeurs au même endroit ; rechargement si en retard (en ligne) : référence (Paule) : « Il faisait nuit sur la ville. Ed ith.Paule. »
- ⚠ H19 (diagnostic de 8) deux éditeurs au même endroit, puis tout le monde ferme : le texte est-il complet à la réouverture ? (en ligne) : exception : page.waitForSelector: Timeout 30000ms exceeded. (scenarios-complements.mjs:428)
- ✖ H20 (diagnostic de 1) en suivi, supprimer un paragraphe par double-clic et Suppr, puis « Tout accepter » (en ligne) : panneau : TEST Claude Paule supprime « X »
- ✖ H8 (P23) instantanés : combien après deux minutes de travail, et « Version actuelle » est-elle à jour ? (firefox/L) : versions (2) : Version actuelle, 14 novembre 2026 à 01:25, Paule | Début du document, 14 novembre 2026 à 01:24, Paule
- ✔ H13 (diagnostic de 4) Paule fait une suggestion et arrête le suivi ; on attend, Edith tape ailleurs, puis Paule tape ailleurs (firefox/L) : juste après l’arrêt : Paule Paule ajoute « Ajout. » ; Edith Paule ajoute « Ajout. » ; affiché chez Paule oui
- ✔ H14 (diagnostic de 4) Paule fait une suggestion et garde le suivi ; Edith tape ailleurs (firefox/L) : panneau d’Edith (Paule en suivi) : Paule ajoute « Ajout. »
- ✔ H15 (diagnostic de 4) Paule fait une suggestion, arrête, puis tape AVANT elle dans le même paragraphe (firefox/L) : panneau de Paule : Paule ajoute « Ajout. »
- ✔ H16 (diagnostic de 6) Carla propose un paragraphe ; Paule fait « Tout accepter » (firefox/L) : texte principal (Lucie) : « Il faisait nuit sur la ville. ⏎ Nouveau paragraphe. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. » ; panneau ensuite (vide)
- ✔ H18 (diagnostic de 8) lectrice et éditrice spectatrice après deux éditeurs au même endroit ; rechargement si en retard (firefox/L) : référence (Paule) : « Il faisait nuit sur la ville.  PaEudlei.th. »
- ✔ H19 (diagnostic de 8) deux éditeurs au même endroit, puis tout le monde ferme : le texte est-il complet à la réouverture ? (firefox/L) : Paule « Il faisait nuit sur la ville.  PEaudliet.h. » ; Edith pareil
- ✖ H20 (diagnostic de 1) en suivi, supprimer un paragraphe par double-clic et Suppr, puis « Tout accepter » (firefox/L) : panneau : Paule supprime « X »
- ✖ H8 (P23) instantanés : combien après deux minutes de travail, et « Version actuelle » est-elle à jour ? (firefox/M) : versions (2) : Version actuelle, 14 novembre 2026 à 01:18, Paule | Début du document, 14 novembre 2026 à 01:16, Paule
- ✔ H13 (diagnostic de 4) Paule fait une suggestion et arrête le suivi ; on attend, Edith tape ailleurs, puis Paule tape ailleurs (firefox/M) : juste après l’arrêt : Paule Paule ajoute « Ajout. » ; Edith Paule ajoute « Ajout. » ; affiché chez Paule oui
- ✔ H14 (diagnostic de 4) Paule fait une suggestion et garde le suivi ; Edith tape ailleurs (firefox/M) : panneau d’Edith (Paule en suivi) : Paule ajoute « Ajout. »
- ✔ H15 (diagnostic de 4) Paule fait une suggestion, arrête, puis tape AVANT elle dans le même paragraphe (firefox/M) : panneau de Paule : Paule ajoute « Ajout. »
- ✔ H16 (diagnostic de 6) Carla propose un paragraphe ; Paule fait « Tout accepter » (firefox/M) : texte principal (Lucie) : « Il faisait nuit sur la ville. ⏎ Nouveau paragraphe. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. » ; panneau ensuite (vide)
- ✔ H18 (diagnostic de 8) lectrice et éditrice spectatrice après deux éditeurs au même endroit ; rechargement si en retard (firefox/M) : référence (Paule) : « Il faisait nuit sur la ville.  EPdauilte.h. »
- ✔ H19 (diagnostic de 8) deux éditeurs au même endroit, puis tout le monde ferme : le texte est-il complet à la réouverture ? (firefox/M) : Paule « Il faisait nuit sur la ville.  PEaduitlhe.. » ; Edith pareil
- ✖ H20 (diagnostic de 1) en suivi, supprimer un paragraphe par double-clic et Suppr, puis « Tout accepter » (firefox/M) : panneau : Paule supprime « X »
- ⚠ H8 (P23) instantanés : combien après deux minutes de travail, et « Version actuelle » est-elle à jour ? (firefox/S) : exception : locator.click: Timeout 30000ms exceeded. (scenarios-complements.mjs:44)
- ✔ H13 (diagnostic de 4) Paule fait une suggestion et arrête le suivi ; on attend, Edith tape ailleurs, puis Paule tape ailleurs (firefox/S) : juste après l’arrêt : Paule Paule ajoute « Ajout. » ; Edith Paule ajoute « Ajout. » ; affiché chez Paule oui
- ✔ H14 (diagnostic de 4) Paule fait une suggestion et garde le suivi ; Edith tape ailleurs (firefox/S) : panneau d’Edith (Paule en suivi) : Paule ajoute « Ajout. »
- ✔ H15 (diagnostic de 4) Paule fait une suggestion, arrête, puis tape AVANT elle dans le même paragraphe (firefox/S) : panneau de Paule : Paule ajoute « Ajout. »
- ✔ H16 (diagnostic de 6) Carla propose un paragraphe ; Paule fait « Tout accepter » (firefox/S) : texte principal (Lucie) : « Il faisait nuit sur la ville. ⏎ Nouveau paragraphe. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. » ; panneau ensuite (vide)
- ✔ H18 (diagnostic de 8) lectrice et éditrice spectatrice après deux éditeurs au même endroit ; rechargement si en retard (firefox/S) : référence (Paule) : « Il faisait nuit sur la ville.  PEaduilteh.. »
- ✔ H19 (diagnostic de 8) deux éditeurs au même endroit, puis tout le monde ferme : le texte est-il complet à la réouverture ? (firefox/S) : Paule « Il faisait nuit sur la ville.  PEaduilteh.. » ; Edith pareil
- ✖ H20 (diagnostic de 1) en suivi, supprimer un paragraphe par double-clic et Suppr, puis « Tout accepter » (firefox/S) : panneau : Paule supprime « X »
- ✖ H8 (P23) instantanés : combien après deux minutes de travail, et « Version actuelle » est-elle à jour ? (webkit/L) : versions (2) : Version actuelle, 14 novembre 2026 à 1:08, Paule | Début du document, 14 novembre 2026 à 1:06, Paule
- ✔ H13 (diagnostic de 4) Paule fait une suggestion et arrête le suivi ; on attend, Edith tape ailleurs, puis Paule tape ailleurs (webkit/L) : juste après l’arrêt : Paule Paule ajoute « Ajout. » ; Edith Paule ajoute « Ajout. » ; affiché chez Paule oui
- ✔ H14 (diagnostic de 4) Paule fait une suggestion et garde le suivi ; Edith tape ailleurs (webkit/L) : panneau d’Edith (Paule en suivi) : Paule ajoute « Ajout. »
- ✔ H15 (diagnostic de 4) Paule fait une suggestion, arrête, puis tape AVANT elle dans le même paragraphe (webkit/L) : panneau de Paule : Paule ajoute « Ajout. »
- ✔ H16 (diagnostic de 6) Carla propose un paragraphe ; Paule fait « Tout accepter » (webkit/L) : texte principal (Lucie) : « Il faisait nuit sur la ville. ⏎ Nouveau paragraphe. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. » ; panneau ensuite (vide)
- ✔ H18 (diagnostic de 8) lectrice et éditrice spectatrice après deux éditeurs au même endroit ; rechargement si en retard (webkit/L) : référence (Paule) : « Il faisait nuit sur la ville.  PaEudliet.h. »
- ✔ H19 (diagnostic de 8) deux éditeurs au même endroit, puis tout le monde ferme : le texte est-il complet à la réouverture ? (webkit/L) : Paule « Il faisait nuit sur la ville.  PauEdlieth.. » ; Edith pareil
- ✖ H20 (diagnostic de 1) en suivi, supprimer un paragraphe par double-clic et Suppr, puis « Tout accepter » (webkit/L) : panneau : Paule supprime « X »
- ✖ H8 (P23) instantanés : combien après deux minutes de travail, et « Version actuelle » est-elle à jour ? (webkit/M) : versions (2) : Version actuelle, 14 novembre 2026 à 1:28, Paule | Début du document, 14 novembre 2026 à 1:26, Paule
- ✔ H13 (diagnostic de 4) Paule fait une suggestion et arrête le suivi ; on attend, Edith tape ailleurs, puis Paule tape ailleurs (webkit/M) : juste après l’arrêt : Paule Paule ajoute « Ajout. » ; Edith Paule ajoute « Ajout. » ; affiché chez Paule oui
- ✔ H14 (diagnostic de 4) Paule fait une suggestion et garde le suivi ; Edith tape ailleurs (webkit/M) : panneau d’Edith (Paule en suivi) : Paule ajoute « Ajout. »
- ✔ H15 (diagnostic de 4) Paule fait une suggestion, arrête, puis tape AVANT elle dans le même paragraphe (webkit/M) : panneau de Paule : Paule ajoute « Ajout. »
- ✔ H16 (diagnostic de 6) Carla propose un paragraphe ; Paule fait « Tout accepter » (webkit/M) : texte principal (Lucie) : « Il faisait nuit sur la ville. ⏎ Nouveau paragraphe. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. » ; panneau ensuite (vide)
- ✔ H18 (diagnostic de 8) lectrice et éditrice spectatrice après deux éditeurs au même endroit ; rechargement si en retard (webkit/M) : référence (Paule) : « Il faisait nuit sur la ville.  EPdauilet.h. »
- ✔ H19 (diagnostic de 8) deux éditeurs au même endroit, puis tout le monde ferme : le texte est-il complet à la réouverture ? (webkit/M) : Paule « Il faisait nuit sur la ville.  EPdaiutle.h. » ; Edith pareil
- ✖ H20 (diagnostic de 1) en suivi, supprimer un paragraphe par double-clic et Suppr, puis « Tout accepter » (webkit/M) : panneau : Paule supprime « X »
- ⚠ H8 (P23) instantanés : combien après deux minutes de travail, et « Version actuelle » est-elle à jour ? (webkit/S) : exception : locator.click: Timeout 30000ms exceeded. (scenarios-complements.mjs:44)
- ✔ H13 (diagnostic de 4) Paule fait une suggestion et arrête le suivi ; on attend, Edith tape ailleurs, puis Paule tape ailleurs (webkit/S) : juste après l’arrêt : Paule Paule ajoute « Ajout. » ; Edith Paule ajoute « Ajout. » ; affiché chez Paule oui
- ✔ H14 (diagnostic de 4) Paule fait une suggestion et garde le suivi ; Edith tape ailleurs (webkit/S) : panneau d’Edith (Paule en suivi) : Paule ajoute « Ajout. »
- ✔ H15 (diagnostic de 4) Paule fait une suggestion, arrête, puis tape AVANT elle dans le même paragraphe (webkit/S) : panneau de Paule : Paule ajoute « Ajout. »
- ✔ H16 (diagnostic de 6) Carla propose un paragraphe ; Paule fait « Tout accepter » (webkit/S) : texte principal (Lucie) : « Il faisait nuit sur la ville. ⏎ Nouveau paragraphe. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. » ; panneau ensuite (vide)
- ✔ H18 (diagnostic de 8) lectrice et éditrice spectatrice après deux éditeurs au même endroit ; rechargement si en retard (webkit/S) : référence (Paule) : « Il faisait nuit sur la ville.  PEaudlie.th. »
- ✔ H19 (diagnostic de 8) deux éditeurs au même endroit, puis tout le monde ferme : le texte est-il complet à la réouverture ? (webkit/S) : Paule « Il faisait nuit sur la ville.  PEaduilteh.. » ; Edith pareil
- ✖ H20 (diagnostic de 1) en suivi, supprimer un paragraphe par double-clic et Suppr, puis « Tout accepter » (webkit/S) : panneau : Paule supprime « X »
- ✖ C2 deux correcteurs au même endroit, en même temps (chromium/L) : affiché : Carla « Il faisait nuit sur la ville.  CCayrrlial.. », Cyril « Il faisait nuit sur la ville.  CCayrrlial.. », Paule « Il faisait nuit sur la ville.  CCayrrlial.. »
- ✖ C2 deux correcteurs au même endroit, en même temps (chromium/M) : affiché : Carla « Il faisait nuit sur la ville.  CCyarrilla.. », Cyril « Il faisait nuit sur la ville.  CCyarrilla.. », Paule « Il faisait nuit sur la ville.  CCyarrilla.. »
- ✖ C2 deux correcteurs au même endroit, en même temps (chromium/S) : affiché : Carla « Il faisait nuit sur la ville.  CCyarrilla.. », Cyril « Il faisait nuit sur la ville.  CCyarrilla.. », Paule « Il faisait nuit sur la ville.  CCyarrilla.. »
- ✖ C2 deux correcteurs au même endroit, en même temps (en ligne) : affiché : Carla « Il faisait nuit sur la ville. Ca rClyar.il. », Cyril « Il faisait nuit sur la ville. Ca rClyar.il. », Paule « Il faisait nuit sur la ville. Ca rClyar.il. »
- ✖ C2 deux correcteurs au même endroit, en même temps (firefox/L) : affiché : Carla « Il faisait nuit sur la ville.  CCayrrlial.. », Cyril « Il faisait nuit sur la ville.  CCayrrlial.. », Paule « Il faisait nuit sur la ville.  CCayrrlial.. »
- ✖ C2 deux correcteurs au même endroit, en même temps (firefox/M) : affiché : Carla « Il faisait nuit sur la ville.  CCyarrilla.. », Cyril « Il faisait nuit sur la ville.  CCyarrilla.. », Paule « Il faisait nuit sur la ville.  CCyarrilla.. »
- ✖ C2 deux correcteurs au même endroit, en même temps (firefox/S) : affiché : Carla « Il faisait nuit sur la ville.  CCayrrlial.. », Cyril « Il faisait nuit sur la ville.  CCayrrlial.. », Paule « Il faisait nuit sur la ville.  CCayrrlial.. »
- ✖ C2 deux correcteurs au même endroit, en même temps (webkit/L) : affiché : Carla « Il faisait nuit sur la ville.  CCayrrilla.. », Cyril « Il faisait nuit sur la ville.  CCayrrilla.. », Paule « Il faisait nuit sur la ville.  CCayrrilla.. »
- ✖ C2 deux correcteurs au même endroit, en même temps (webkit/M) : affiché : Carla « Il faisait nuit sur la ville.  CyCarrlial.. », Cyril « Il faisait nuit sur la ville.  CyCarrlial.. », Paule « Il faisait nuit sur la ville.  CyCarrlial.. »
- ✖ C2 deux correcteurs au même endroit, en même temps (webkit/S) : affiché : Carla « Il faisait nuit sur la ville.  CCyrailr.la. », Cyril « Il faisait nuit sur la ville.  CCyrailr.la. », Paule « Il faisait nuit sur la ville.  CCyrailr.la. »
- ✖ A4 deux éditeurs en même temps, au même endroit (chromium/L) : convergence : oui ; § 1 : « Il faisait nuit sur la ville.  EPdaiuthle.. »
- ✖ A4 deux éditeurs en même temps, au même endroit (chromium/M) : convergence : oui ; § 1 : « Il faisait nuit sur la ville.  PEaduilteh.. »
- ✖ A4 deux éditeurs en même temps, au même endroit (chromium/S) : convergence : oui ; § 1 : « Il faisait nuit sur la ville.  PEaduilteh.. »
- ✖ A4 deux éditeurs en même temps, au même endroit (en ligne) : convergence : oui ; § 1 : « Il faisait nuit sur la ville. P aEudlieth.. »
- ✖ A4 deux éditeurs en même temps, au même endroit (firefox/L) : convergence : oui ; § 1 : « Il faisait nuit sur la ville.  PEaduilet.h. »
- ✖ A4 deux éditeurs en même temps, au même endroit (firefox/M) : convergence : oui ; § 1 : « Il faisait nuit sur la ville.  EPdaiutlhe.. »
- ✖ A4 deux éditeurs en même temps, au même endroit (firefox/S) : convergence : oui ; § 1 : « Il faisait nuit sur la ville.  PEaduilteh.. »
- ✖ A4 deux éditeurs en même temps, au même endroit (webkit/L) : convergence : oui ; § 1 : « Il faisait nuit sur la ville.  PEaduilte.h. »
- ≈ A4 deux éditeurs en même temps, au même endroit (webkit/M) : convergence : oui ; § 1 : « Il faisait nuit sur la ville.  EdPaiuthl.e. »
- ✖ A4 deux éditeurs en même temps, au même endroit (webkit/S) : convergence : oui ; § 1 : « Il faisait nuit sur la ville.  PEdaiutlhe.. »
