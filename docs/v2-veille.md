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
| Affichage des modifications sur plusieurs paragraphes | `@y/prosemirror`, `CAVEATS.md` (« Visualizing attributed content ») | un affichage lisible |

## Correctifs temporaires de fondations en place

Aucun.
