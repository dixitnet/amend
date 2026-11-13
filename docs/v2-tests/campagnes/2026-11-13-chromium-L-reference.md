# Campagne de test de la v2, 2026-11-13

**Aucune régression.**

Défauts connus toujours là : 8. Défauts connus qui passent maintenant : 0. À qualifier (combinaison jamais passée au bilan) : 0. Scénarios hors référence : 0. Scénarios de la référence non joués : 0.

## Tableau

Scénarios passés sur scénarios joués (hors diagnostics), par famille.

| Famille | chromium/L |
| --- | --- |
| commentaires | 13/15 |
| complements | 11/12 |
| correcteurs | 14/15 |
| editeur | 12/14 |
| historique | 1/1 |
| robustesse | 6/6 |
| roles | 2/4 |
| suivi | 21/21 |

## Défauts connus toujours là (8)

Suivis dans la référence, avec leur issue.

- **D2 rouvrir un fil résolu** (commentaires, chromium/L) : 0/3 ; à qualifier au bilan
  - accès aux fils résolus dans l’interface : oui
  - rouvert par l’API : l’ancre revient chez Edith NON
- **D2 retrouver un fil résolu dans l’onglet « Commentaires » et le rouvrir** (commentaires, chromium/L) : 0/3 ; à qualifier au bilan
  - onglet « Commentaires » : ouverts 0, résolus 1
  - actions du fil résolu : ajouteruneréaction | rouvrir | plusd'actions
  - rouvert par l’interface, ancre revenue chez Edith : NON
- **H8 (P23) instantanés : combien après deux minutes de travail, et « Version actuelle » est-elle à jour ?** (complements, chromium/L) : 0/3 ; à qualifier au bilan
  - versions (2) : Version actuelle, 13 novembre 2026 à 10:44, Paule | Début du document, 13 novembre 2026 à 10:42, Paule
  - « Version actuelle » montre la dernière phrase : oui
  - versions (2) : Version actuelle, 13 novembre 2026 à 10:46, Paule | Début du document, 13 novembre 2026 à 10:44, Paule
- **C2 deux correcteurs au même endroit, en même temps** (correcteurs, chromium/L) : 0/3 ; à qualifier au bilan
  - affiché : Carla « Il faisait nuit sur la ville.  CCayrrlila.. », Cyril « Il faisait nuit sur la ville.  CCayrrlila.. », Paule « Il faisait nuit sur la ville.  CCayrrlila.. »
  - panneau de Paule (1) : Cyril ajoute « CCayrrlila.. »
  - Accepter « Cyril ajoute « CCayrrlila.. » » : fait
- **A3 typographie à la frappe, en suivi des modifications** (editeur, chromium/L) : 0/3 ; à qualifier au bilan
  - panneau : Paule ajoute «⍽Il dit "oui" ; bien.⍽»
  - affiché chez Edith : « Paule marchait vers la gare. Il dit "oui" ; bien. »
- **A4 deux éditeurs en même temps, au même endroit** (editeur, chromium/L) : 1/3 ; à qualifier au bilan
  - convergence : oui ; § 1 : « Il faisait nuit sur la ville.  Edith.Paule. »
  - convergence : oui ; § 1 : « Il faisait nuit sur la ville.  PEadith.ule. »
  - convergence : oui ; § 1 : « Il faisait nuit sur la ville.  PEaduitlhe.. »
- **E1 ce que chacun voit et peut faire** (roles, chromium/L) : 0/3 ; à qualifier au bilan
  - exception : locator.click: Timeout 30000ms exceeded.
- **E2 Edith passe d’éditrice à lectrice, le document ouvert** (roles, chromium/L) : 0/3 ; à qualifier au bilan
  - exception : locator.click: Timeout 30000ms exceeded.

## Diagnostics (7)

Des relevés, sans verdict.

- ✔ H13 (diagnostic de 4) Paule fait une suggestion et arrête le suivi ; on attend, Edith tape ailleurs, puis Paule tape ailleurs (chromium/L) : juste après l’arrêt : Paule Paule ajoute « Ajout. » ; Edith Paule ajoute « Ajout. » ; affiché chez Paule oui
- ✔ H14 (diagnostic de 4) Paule fait une suggestion et garde le suivi ; Edith tape ailleurs (chromium/L) : panneau d’Edith (Paule en suivi) : Paule ajoute « Ajout. »
- ✔ H15 (diagnostic de 4) Paule fait une suggestion, arrête, puis tape AVANT elle dans le même paragraphe (chromium/L) : panneau de Paule : Paule ajoute « Ajout. »
- ✔ H16 (diagnostic de 6) Carla propose un paragraphe ; Paule fait « Tout accepter » (chromium/L) : texte principal (Lucie) : « Il faisait nuit sur la ville. ⏎ Nouveau paragraphe. ⏎ Les quais étaient déserts et le vent soufflait. ⏎ Paule marchait vers la gare. » ; panneau ensuite (vide)
- ✔ H18 (diagnostic de 8) lectrice et éditrice spectatrice après deux éditeurs au même endroit ; rechargement si en retard (chromium/L) : référence (Paule) : « Il faisait nuit sur la ville.  Edith.Paule. »
- ✔ H19 (diagnostic de 8) deux éditeurs au même endroit, puis tout le monde ferme : le texte est-il complet à la réouverture ? (chromium/L) : Paule « Il faisait nuit sur la ville.  EPaduilteh.. » ; Edith pareil
- ✖ H20 (diagnostic de 1) en suivi, supprimer un paragraphe par double-clic et Suppr, puis « Tout accepter » (chromium/L) : panneau : Paule supprime « X »
