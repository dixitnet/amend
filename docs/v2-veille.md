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
| Demande de modification et relecture | https://github.com/suitenumerique/docs/issues/2156 | même besoin |
| Yjs 14, historique BlockNote, PDF par Typst dans Docs | https://github.com/suitenumerique/docs/pull/2895 | intégration de référence à suivre |
| Modèle d'export PDF | https://github.com/suitenumerique/docs/issues/680 | mécanisme générique de modèle |
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

## Correctifs temporaires de fondations en place

Aucun.
