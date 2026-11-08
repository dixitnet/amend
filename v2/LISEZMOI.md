# amend.ink v2

Reconstruction d'amend.ink sur BlockNote (éditeur), y/hub (collaboration) et un serveur Node (comptes, droits, IA, exports, publication). Licence AGPL-3.0 (`LICENSE`).

**À lire avant tout travail** : `../docs/v2-regles-developpement.md` (règles), `adr/` (décisions), `../docs/v2-veille.md` (amont), `../docs/v2-renoncements.md`.

## Couches

| Dossier                                                              | Couche                                                   | Peut importer                      |
| -------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------- |
| `domaine/`                                                           | 4, règles d'amend.ink en JS pur                          | rien d'autre que `domaine/`        |
| `adaptateurs/<fondation>/`                                           | 2, une façade par fondation                              | sa fondation seulement             |
| `extensions/`                                                        | 3, points d'extension de BlockNote                       | BlockNote seulement                |
| `application/client/`, `application/serveur/`, `application/collab/` | 5, logique (aucun style, aucun texte)                    | adaptateurs, design, i18n, domaine |
| `design/`                                                            | 6, apparence (jetons, thème, composants de présentation) | Mantine seulement                  |
| `i18n/`                                                              | textes, format ICU                                       | `intl-messageformat` seulement     |
| `exploitation/`                                                      | 7, lancement, mesures                                    | tout (outillage)                   |
| `contrats/`, `tests/`                                                | tests                                                    | tout                               |

Ces frontières sont vérifiées par `npm run lint` (`eslint.config.js`) ; `tests/unitaires/frontieres.test.js` vérifie que le lint refuse bien ce qu'il doit refuser.

## Commandes (dans `v2/`, Node 24)

- `npm run dev` : PostgreSQL et Redis locaux, schéma de y/hub, client construit, serveur (http://127.0.0.1:4300) et y/hub (port 4400). Document : `http://127.0.0.1:4300/#nom-du-document`. Connexion de développement par un simple nom.
  - Droits (étape 2) : la première personne qui ouvre un document le crée et en est **propriétaire** ; les autres n'y ont pas accès tant qu'on ne leur a pas donné un rôle (`lecteur`, `correcteur`, `editeur`). Donner un rôle, depuis la session d'une personne qui peut inviter (propriétaire ou éditeur) : `POST /api/dev/acces` avec `{ "document", "personne" (identifiant rendu par /api/dev/session), "role" }` ; `"role": null` retire l'accès. La table des accès est en mémoire jusqu'à l'étape 6 : un redémarrage du serveur l'efface.
- `npm run lint`, `npm run format:check`, `npm test` (unitaires et contrats statiques, rapides) : avant tout commit.
- `npm run test:pile` : contrats et parcours sur la pile complète (Chromium), une trentaine de secondes.
- `npm run mesurer` : mémoire de chaque processus (PSS) au repos, avec 2 et 10 documents, avec un livre ; temps d'ouverture.

## Processus

1. **Serveur** (`application/serveur/`) : identité (session de développement), droits (décidés par `domaine/droits.js`, table des accès provisoire `acces.js`), fichiers du client. Répond par des codes, jamais par des phrases.
2. **Collaboration** (`application/collab/` + `adaptateurs/yhub/`) : y/hub, qui tient le contenu ; il demande au serveur qui est la personne et ce qu'elle peut faire.
3. **PostgreSQL** et **Redis** (ou Valkey) : stockage de y/hub.
