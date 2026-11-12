# Essai du mode « Éditer » (12/11/2026)

Demande de Sylvain (12/11/2026) : trois modes, **Éditer** (suggestions et commentaires visibles, frappe dans le texte, accepter et refuser), **Corriger** (la frappe devient une suggestion), **Lire** (le texte seul). Question préalable : peut-on écrire directement dans le texte avec les suggestions affichées, alors que y-prosemirror#245 (« la frappe au contact d'une suggestion la prolonge ») avait conduit le 10/11 à séparer Modifier et Relire ?

## Comment Docs le fait

Docs (`suitenumerique/docs`, `main` du 12/11/2026) n'a qu'un mode pour qui peut modifier : `DocEditor.tsx` choisit `BlockNoteEditor` (édition directe) ou `BlockNoteReader` (lecture seule) selon `abilities.partial_update`. Pas de suggestions aujourd'hui ; l'épopée suitenumerique/docs#2491 prévoit un mode suggestion réservé aux éditeurs, avec les suggestions **affichées en permanence** sur le document principal (une couleur pour l'insertion, une pour la suppression). Pour qui ne voit pas les commentaires, Docs rend les marques transparentes (`DocsCommentsStyle`, `canSeeComment`). Docs n'a pas de mode lecture pour qui peut modifier : notre mode Lire est un écart (décision de Sylvain).

## Montage essayé

Le montage de la v2 (exemple `07-collaboration/12-multi-doc-versioning` de BlockNote) : en `viewSuggestions()`, l'éditeur est lié au texte avec les suggestions affichées (`DiffRenderer`, `suggestionMode = false`) ; ce qu'on y tape va dans le texte. Le mode Relire de l'époque coupait la frappe ; l'essai l'a rouverte (correctif provisoire, non commité). Pile locale, Chromium ; trois personnes : Paule (éditrice), Carla (correctrice), Léa (lectrice, qui montre le texte de base).

## 1. Ce qui marche

| Geste de l'éditrice, loin de toute suggestion                   | Résultat                                  |
| --------------------------------------------------------------- | ----------------------------------------- |
| frappe                                                          | dans le texte de base, aussitôt chez Léa  |
| typographie à la frappe (`"oui"` → `« oui »`, insécables)        | appliquée (elle échoue en mode suggestion) |
| gras, italique (raccourci et palette)                           | dans le texte de base                     |
| « # » → titre, « - » → liste, menu « / », note de bas de page   | dans le texte de base                     |
| nouveau paragraphe après une suggestion                         | dans le texte de base                     |

Aucune erreur dans la console.

## 2. Ce qui ne va pas : y-prosemirror#245

| Geste de Paule, Carla ayant suggéré « Ajout » ou « donc »                       | Résultat                                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| frappe juste après la suggestion                                               | absorbée : « Carla ajoute « Ajout Suite » » ; refuser la suggestion efface le texte de Paule |
| frappe juste avant la suggestion (fin de paragraphe)                           | absorbée, et **toute la suggestion passe au nom de Paule**                                  |
| frappe un signe après la fin de la suggestion (début du mot suivant)           | encore absorbée ; la liste montre un texte faux (« c nQ »)                                   |
| remplacement d'une sélection qui chevauche la suggestion                       | **la suggestion de Carla disparaît sans trace**                                             |
| frappe au milieu d'un mot dont la suppression est suggérée                     | dans le texte de base ; la suppression est coupée en deux suggestions                       |
| Retour arrière juste après la suggestion                                       | modifie la suggestion de Carla                                                             |

Portée mesurée (une frappe à chaque position de « Il faisait nuit noire sur la ville endormie. ») : pour une insertion, absorption **dans la suggestion, à sa fin et au signe qui suit** (l'espace d'après) ; libre avant la suggestion et dès le mot suivant. Pour une suppression, jamais d'absorption, mais la frappe coupe la suggestion.

## 3. Le garde-fou retenu (option 1, Sylvain, 12/11/2026)

`extensions/garde-suggestions/` : en Éditer, tout changement du texte par la personne qui touche une **zone protégée** est refusé, avec un message. Zone : la suggestion, étendue de chaque côté d'au plus une espace puis du mot voisin (marge au-delà de la portée mesurée). Refusés : frappe (avant d'atteindre la page, `handleTextInput`), Entrée, Retour arrière, Suppr, collage, dépôt, coupe, mise en forme, menu « / » (`filterTransaction`). Permis : ce qui vient de la collaboration (méta `y-sync-transaction`, `y-sync$`), les transactions ajoutées, les marques de commentaire. Limite connue : une saisie composée que ProseMirror ne passe pas par `handleTextInput` serait refusée par le filtre après coup ; non rencontrée.

À retirer quand l'amont corrige #245 (commentaire préparé : `docs/v2-tickets-amont.md`, n° 8).

## 4. Tenue sur un livre (1 000 paragraphes de 500 signes)

Banc `exploitation/dev/mesurer-relecture.mjs` adapté (l'éditrice tape 200 signes à 50 ms la touche ; un correcteur regarde). Délai entre la touche et le signe affiché, en ms (moyenne / pire).

Avant le garde-fou (essai du mode Relire rendu modifiable) :

| Suggestions en attente                                            | 0         | 200         |
| ----------------------------------------------------------------- | --------- | ----------- |
| éditrice qui tape, suggestions masquées (ancien Modifier)         | 10 / 27   | 11 / 33     |
| éditrice qui tape, suggestions affichées (Éditer)                 | 13 / 68   | 16 / 62     |
| processeur de l'onglet de l'éditrice, Éditer comparé à Modifier   | × 1,3     | × 4         |
| ce que l'éditrice en Éditer voit de la frappe du correcteur       | 17 / 81   | 135 / 306   |

Le palier à 1 000 suggestions s'était arrêté (onglet fermé), cause non établie. Avec le garde-fou : voir § 5.

## 5. Palier à 1 000 suggestions, avec le garde-fou

(complété après la mesure)
