# amend.ink v2 : la campagne de test

Statut : **en place** depuis le 13/11/2026 (Sylvain : « restructure une vraie campagne de test pour les 3 navigateurs, qui sera rejouée et ajustée de temps en temps » ; « je veux supprimer tous les échecs connus sur les 3 navigateurs »). Elle remplace le relevé du 10/11/2026 (`procedure-relecture.md`, dont elle reprend les scénarios).

## À quoi elle sert

Les tests d'interface (`npm run test:pile`, T5) vérifient chaque fonction, à chaque fusion, dans les trois navigateurs. La campagne joue des **scénarios à plusieurs personnes** (une éditrice, une correctrice, une lectrice qui travaillent en même temps sur un document) : ce que chacune voit, ce qui arrive au texte, aux corrections, aux commentaires. Elle dure plus d'une heure : on la lance **à la demande**, pas à chaque fusion, et elle ne bloque pas une fusion.

## Comment fait Docs

Docs joue une seule suite Playwright dans Chromium, WebKit et Firefox, les mêmes tests partout ; les écarts entre navigateurs sont rares et déclarés dans le test lui-même. Nous faisons de même : mêmes scénarios partout, exceptions déclarées dans la référence.

## Ce qui est joué

- **Trois navigateurs** : Chromium, WebKit (Safari), Firefox.
- **Trois formats d'écran** : L (Mac, 1 440 × 900), M (iPad en portrait, 820 × 1 180, tactile), S (iPhone, 390 × 844, tactile).
- **Huit familles** de scénarios (`v2/exploitation/campagne/scenarios-<famille>.mjs`) : `editeur` (A), `suivi` (B), `correcteurs` (C), `commentaires` (D), `roles` (E), `robustesse` (F), `historique` (G), `complements` (H). Chaque scénario est joué **trois fois**, sur un document neuf (les défauts de synchronisation ne se montrent pas à chaque fois).
- **En ligne** : les mêmes familles contre `v2.amend.ink`, avec les comptes d'essai, sous Chromium et en format L seulement, une famille à la fois (pour ne pas charger le VPS).

## Les statuts d'un scénario

L'état attendu de chaque scénario est écrit dans **la référence**, `v2/exploitation/campagne/reference.json`, commitée dans le dépôt :

| Statut       | Sens                                                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attendu`    | doit passer, partout                                                                                                                                                                    |
| `connu`      | défaut connu : on s'attend à ce qu'il échoue ; la référence dit pourquoi (`note`) et où il est suivi (`lien` : veille, ticket amont). La campagne signale le jour où il se met à passer |
| `diagnostic` | un relevé, sans verdict                                                                                                                                                                 |

Une exception pour un navigateur ou un format s'écrit dans le scénario (`sauf`, du plus précis au plus large : `"firefox/S"`, `"firefox"`, `"S"`), avec sa raison. `qualifiees` liste les combinaisons navigateur et format déjà passées au bilan ; sur les autres, rien n'est une régression : tout y est « à qualifier ».

## Les verdicts d'un passage

| Verdict         | Sens                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| passé           | réussi les trois fois                                                                                     |
| échoué          | jamais réussi, le script étant allé au bout                                                               |
| instable        | réussi une partie des fois                                                                                |
| script en panne | le script a planté à chaque fois, avant de savoir ce que fait le produit : c'est l'outil qui est en cause |

## Le bilan

`bilan.mjs` compare les relevés à la référence et écrit le rapport : un tableau par famille et par combinaison, puis les régressions, les scénarios instables, les scripts en panne, les défauts connus qui passent maintenant, ce qui reste à qualifier, les défauts connus toujours là. **La campagne échoue** dès qu'un scénario `attendu` ne passe plus (régression, instable ou script en panne). Le rapport d'une campagne qui compte est copié dans `docs/v2-tests/campagnes/`.

## Corriger : l'ordre

Règle de Sylvain (13/11/2026) : « un échec sur un navigateur doit prioritairement générer une modification globale du code, ou un correctif spécifique uniquement quand ce n'est pas possible de faire autrement ».

1. **Une correction globale du code** d'amend.ink, qui vaut pour tous les navigateurs.
2. **Une correction des gestes** (`gestes.mjs`), si c'est le script qui est en cause : une seule façon de poser un curseur, de sélectionner, de cliquer, pour les trois navigateurs et les trois formats.
3. **Un correctif propre à un navigateur**, en dernier recours seulement, avec sa raison dans la veille (`docs/v2-veille.md`) et, si le scénario reste différent, une exception `sauf` dans la référence.

Chaque défaut connu a une issue, une seule : corrigé chez nous (le scénario devient `attendu`), contourné chez nous (la veille dit comment le retirer), signalé en amont (il reste `connu`, avec son ticket), ou scénario retiré s'il n'a plus d'objet. Objectif : **aucun échec non expliqué**.

## Lancer une campagne

- **Sur GitHub** (les trois navigateurs) : flux `v2-campagne`, « Run workflow ». On peut restreindre les navigateurs, les formats, les familles. Le rapport est dans le résumé du flux et en artefact (`rapport-campagne`).
- **En local** (Chromium seul dans l'environnement de Claude) :
  ```
  cd v2
  node exploitation/campagne/scenarios-suivi.mjs --fois=3 --sortie=releves      # une famille
  FORMAT=S NAVIGATEUR=chromium node exploitation/campagne/scenarios-roles.mjs --sortie=releves
  node exploitation/campagne/bilan.mjs releves --rapport=rapport.md              # le bilan
  ```
- **Mettre la référence à jour** : à la main, dans `reference.json`, après décision ; `bilan.mjs … --referencer=chromium/L,webkit/L` y inscrit les scénarios qui n'y sont pas encore (attendu s'ils passent partout, sinon `connu`, « à qualifier au bilan »), à relire avant de commiter.

## Ajuster la campagne

- Un nouveau scénario : dans le script de sa famille, puis dans la référence.
- Un geste qui ne marche pas partout : dans `gestes.mjs`, jamais dans un scénario.
- Un scénario qui n'a plus d'objet : retiré du script et de la référence, avec un mot dans le journal des décisions.

## Fichiers

| Fichier                                    | Rôle                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `v2/exploitation/campagne/scenarios-*.mjs` | les scénarios, par famille                                                            |
| `v2/exploitation/campagne/gestes.mjs`      | les gestes sur la page, les formats, le choix du mode                                 |
| `v2/exploitation/campagne/commun.mjs`      | les personnes, le document de chaque cas, le lanceur, le relevé                       |
| `v2/exploitation/campagne/verdicts.mjs`    | verdicts, comparaison, rapport (testés : `tests/unitaires/campagne-verdicts.test.js`) |
| `v2/exploitation/campagne/bilan.mjs`       | le bilan d'une campagne                                                               |
| `v2/exploitation/campagne/reference.json`  | l'état attendu de chaque scénario                                                     |
| `.github/workflows/v2-campagne.yml`        | le flux GitHub                                                                        |
