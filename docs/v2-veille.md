# amend.ink v2 : veille de l'amont

Règle 4.3 de `docs/v2-regles-developpement.md`. Relue à chaque montée de version (une fois par mois au moins). Versions de référence : celles du fichier de verrouillage de `v2/`.

## Fondations suivies

| Fondation | Dépôt | Où regarder |
|---|---|---|
| Yjs 14 (`@y/y`) | https://github.com/yjs/yjs | version stable de la 14 ; tickets v14 |
| `@y/prosemirror` | https://github.com/yjs/y-prosemirror | `CHANGELOG.md` (section non publiée), `CAVEATS.md` |
| BlockNote | https://github.com/TypeCellOS/BlockNote | `CHANGELOG.md` (ruptures signalées ⚠️), exemples `07-collaboration` |
| y/hub (`@y/hub`) | https://github.com/yjs/yhub | versions npm, `API.md` |
| ProseMirror | https://github.com/ProseMirror/prosemirror-view | journal des changements (saisie, composition) |
| Docs | https://github.com/suitenumerique/docs | `CHANGELOG.md`, adaptateur `src/yhub-server/` |
| Typst | https://github.com/typst/typst | versions |

## Sujets en cours en amont qui nous concernent

| Sujet | Lien | Ce qu'on en attend |
|---|---|---|
| Mode suggestion de Docs | https://github.com/suitenumerique/docs/issues/2491 | rôle « peut suggérer » (notre correcteur) ; règles d'affichage |
| Plantage `[lib0/delta] diffing deletes unsupported` (10/11/2026) | https://github.com/yjs/y-prosemirror/issues/288 (ouvert) | déclenché chez nous par la recréation de l'éditeur ; **disparu avec le montage de l'exemple de BlockNote** (11/11/2026) ; ajouter notre déclencheur au ticket (décision de Sylvain) |
| La frappe au contact d'une suggestion la prolonge | https://github.com/yjs/y-prosemirror/issues/245 (jalon M2, reporté) | évité par les trois modes (on n'écrit pas en relecture) ; à revoir si l'amont le corrige |
| Suppression d'un paragraphe entier suggérée : invisible quand l'afficheur part d'un état neuf (rechargement, passage en relecture après coup) (11/11/2026) | aucun ticket ; voisin y-prosemirror#263 | scénarios H21, H22 (`v2/exploitation/campagne/scenarios-complements.mjs`) ; à signaler (décision de Sylvain) |
| En suivi, une suppression qui franchit la fin d'un paragraphe est enregistrée comme une fusion, le texte supprimé n'est pas noté (10/11/2026) | voisins : galerie de BlockNote (« Broken merge »), y-prosemirror#263 | H11, H20 ; à signaler |
| Connexions en lecture seule de y/hub 0.10.1 : des morceaux tapés en même temps par deux éditeurs n'arrivent pas, même après rechargement ; le serveur a tout (10/11/2026) | aucun ticket ; la version suivante de y/hub refait la synchronisation des lecteurs | H18, H19 ; à reprendre à la prochaine version |
| Demande de modification et relecture | https://github.com/suitenumerique/docs/issues/2156 | même besoin |
| Yjs 14, historique BlockNote, PDF par Typst dans Docs | https://github.com/suitenumerique/docs/pull/2895 | intégration de référence à suivre |
| Modèle d'export PDF | https://github.com/suitenumerique/docs/issues/680 | mécanisme générique de modèle |
| Paquets Typst de BlockNote (`xl-typst-exporter`, `xl-typst-compiler`) | https://github.com/TypeCellOS/BlockNote | préambule non réglable (A4, Inter, blanc de 6,9 pt autour des blocs) : nous écrivons le parcours des blocs ; à revoir si BlockNote rend le préambule ou l'enveloppe des blocs réglables (étape 7) |
| MCP dans Docs | https://github.com/suitenumerique/docs/issues/1183 | convergence avec « Inviter Claude » |
| Défauts de saisie en mode suggestion (touche morte sur une sélection, Ctrl+Z, suggestion d'autrui effacée) | aucun ticket amont connu au 07/11/2026 | à signaler (décision de Sylvain) |
| Remplacements à la frappe en mode suggestion (BlockNote 0.57, module `@handlewithcare/prosemirror-inputrules`) : « # » → titre, « - » → liste, et nos règles de typographie ne s'appliquent pas, erreur « Applying a mismatched transaction » (le module envoie deux transactions de suite, la seconde préparée sur un état que la synchronisation du mode suggestion a déjà changé) ; constaté à l'essai du 08/11/2026 (étape 5, lot 0) | aucun ticket amont connu | à signaler (décision de Sylvain) |
| `SuggestionsExtension.getSuggestionAtSelection` (BlockNote 0.57) cherche les marques `insertion`, `deletion` et `modification`, qui n'existent pas (les marques réelles sont `y-attributed-insert`, `-delete`, `-format`) : elle renvoie toujours « rien » ; constaté à l'essai du 08/11/2026 (étape 5) ; `getMarkAtPos` et `getSuggestionAtCoords` fonctionnent | aucun ticket amont connu | à signaler (décision de Sylvain) ; d'ici là, chercher la suggestion au curseur par `getMarkAtPos` avec les vrais noms |
| Découpage des suggestions par Yjs : les lettres communes à l'ancien et au nouveau texte restent hors de la proposition (« beau » → « blanc » : « b » inchangé, « eau » barré, « lanc » ajouté ; un collage « vert » sur « chat noir dort » garde « rt ») ; le texte accepté est juste ; constaté à la campagne du 09/11/2026 | aucun ticket amont connu | à signaler (décision de Sylvain) ; le panneau garde ce découpage (Sylvain, 09/11/2026) |
| Affichage des modifications sur plusieurs paragraphes | `@y/prosemirror`, `CAVEATS.md` (« Visualizing attributed content ») | un affichage lisible |

## Contournements en place (sans correctif de fondation)

| Fondation | Défaut | Contournement | Retrait |
|---|---|---|---|
| BlockNote 0.57.0 | l'option `fontFamily` du thème remplit `--bn-font-family`, mais aucune règle CSS ne l'utilise (`.bn-default-styles` écrit Inter en dur) | **sans objet depuis le 08/11/2026** : la v2 n'impose plus de police (ADR 0008 révisée, Mantine et BlockNote tels quels) ; contournement retiré | à signaler en amont si une police est un jour décidée |
| `@handlewithcare/prosemirror-inputrules` 0.1.4 (dépendance de BlockNote 0.57) | `undoInputRule` réinsère le caractère tapé une seconde fois : le module insère d'abord le caractère, puis applique la règle, mais l'annulation défait la règle **et** réinsère le texte tapé (« l' » + Retour arrière donne « l'' ») ; BlockNote n'utilise pas cette commande | `extensions/typographie` défait seulement les étapes de la règle (`annulerRemplacement`) ; test T5 « Retour arrière » | à signaler en amont (décision de Sylvain) ; retirer notre annulation quand le module est corrigé |
| `@y/hub` 0.10.1 → `minio` → `query-string` → `decode-uri-component` (élevée, déni de service) ; `stream-json` (moyenne) — `npm audit`, 08/11/2026 | dépendances du client S3 de y/hub ; **non atteintes** chez nous : persistance dans PostgreSQL, sans S3 (ADR 0004), aucune adresse ni JSON d'un tiers ne leur parvient | rien à contourner ; réexamen à chaque montée de version de y/hub (mensuelle) | quand y/hub met à jour `minio` ou sépare son client S3 |
| `eslint` 10.14 → `minimatch` (moyenne, déni de service) — `npm audit`, 08/11/2026 | outil de développement seulement, jamais en production | rien | à la montée de version mensuelle d'eslint |
| BlockNote 0.57.0 (`Thread`) | l'affichage d'un fil résolu lève une erreur tant que le nom de qui l'a résolu n'est pas chargé (« …resolved thread …, but their data could not be found ») | `adaptateurs/blocknote/commentaires.js` ne transmet pas `resolvedBy` (la ligne « résolu par » ne s'affiche pas) | quand BlockNote attend le nom au lieu de lever une erreur |
| `@y/prosemirror` 2.0.0-15 (mode suggestion) | une suppression qui franchit la fin d'un paragraphe est enregistrée comme une fusion, sans le texte supprimé ; l'accepter donne un texte faux (H11, H20) | `extensions/limites-du-suivi` refuse, en Suggérer, la sélection à cheval, Retour arrière en début et Suppr en fin de paragraphe, Entrée, frappe, collage et coupe sur une sélection à cheval, avec un message | quand l'amont enregistre ces suppressions (scénarios H20, B3, C3) |
| BlockNote 0.57.0, `@y/prosemirror` (mode suggestion) | une mise en forme suggérée n'est ni appliquée ni listée (B6) | même extension : Mod-B, I, U, barré refusés en Suggérer ; palette sans boutons de forme ni type de bloc ; menu « / » coupé en Suggérer (`adaptateurs/blocknote/palette.js`) | quand le panneau peut lister et appliquer une suggestion de mise en forme |
| `@y/prosemirror` (mode suggestion) | une suppression de paragraphe suggérée disparaît de la liste après un rechargement (H22) | le panneau, en Relire, dit qu'il reste des suggestions non listées et garde « Tout accepter » et « Tout refuser » (`App.jsx`, `invisibles`) | quand l'afficheur retrouve ces suppressions en partant d'un état neuf |
| Yjs 14 (rendu des contenus attribués) | un document peut ne plus s'afficher en suggestion (page blanche, `reading 'copy'`) | filet de sécurité de l'éditeur (`FiletDeLEditeur`, `App.jsx`) : retour en Modifier avec un message, au lieu de la page blanche | quand l'erreur est corrigée en amont (document témoin « Test Claude - verif v2 ») |

## Correctifs temporaires de fondations en place

Aucun.
