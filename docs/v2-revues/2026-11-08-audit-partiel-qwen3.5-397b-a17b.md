# Audit partiel avant fusion (2026-11-08)

- Auditeur : Scaleway, modèle `qwen3.5-397b-a17b` ; consommation : 143827 signes envoyés, 2249 reçus ; 56 s
- Diff audité : `v2/` de `bec9478` à `2388c1f` (41 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff implémente l'étape 4 (éditeur) avec les extensions note et typographie, le schéma du livre, et les tests de contrat associés. L'architecture en couches est globalement respectée. Trois points d'attention : un bug potentiel de mémorisation dans App.jsx, une limitation dans le parcours des notes, et les licences des nouvelles dépendances à vérifier.

## Constats

**A1** [important] Grille 4, `application/client/App.jsx:118-123` : `libelles` est mémorisé avec `useMemo` et un tableau de dépendances vide `[]`, mais il dépend de `t` (la fonction de traduction). Si la langue de l'interface change, `libelles` ne sera pas recalculé avec les nouvelles traductions. Proposer : ajouter `t` ou `t.langue` dans le tableau de dépendances.

**A2** [question] Grille 6, `extensions/note/index.js:96-112` : `notesDuDocument` parcourt les blocs et gère `tableContent`, mais ne gère pas explicitement d'autres structures imbriquées potentielles (ex: blocs dans des blocs personnalisés futurs). Le code fonctionne-t-il pour tous les types de blocs du schéma BlockNote ? À vérifier avec un contrat supplémentaire.

**A3** [question] Grille 8, `v2/package.json:15,25-26` : Trois nouvelles dépendances sont ajoutées (`@handlewithcare/prosemirror-inputrules`, `prosemirror-model`, `prosemirror-state`). Leurs licences sont-elles compatibles AGPL-3.0 ? ProseMirror est MIT, mais `@handlewithcare/prosemirror-inputrules` doit être vérifié explicitement dans la revue de licence.

**A4** [mineur] Grille 7, `contrats/pile/editeur.test.js:43-45` : Les tests de presse-papiers sont skipés pour Firefox avec une raison documentée. C'est acceptable, mais un contrat manuel (recette) devrait être ajouté dans `docs/v2-procedure-tests.md` pour couvrir Firefox avant la mise en production.

**A5** [mineur] Grille 2, `adaptateurs/blocknote/serveur.js:29-33` : La conversion d'erreur utilise `Object.assign` avec un message en dur `'blocs invalides'`. Selon la règle 25, le serveur devrait rendre un code (`blocs-invalides`) et le message devrait venir des catalogues de traduction côté client. Ici c'est côté serveur pour les exports/IA, donc acceptable, mais à harmoniser si ce code est exposé à l'interface.

## Points de grille sans remarque
1, 5, 9, 10

## Citations vérifiées par le script

- A1 : citations valides
- A2 : citations valides
- A3 : citations valides
- A4 : citations valides
- A5 : citations valides

## Réponse de Claude

- **A1 : faux.** `t` est créé une fois au chargement du module (`App.jsx`, l. 14) et ne change jamais : la langue se choisit au chargement de la page. `[]` est juste.
- **A2 : juste (test manquant).** `notesDuDocument` lit bien les notes des cellules de tableau (vérifié), mais aucun test ne le prouvait : ajouté (`tests/unitaires/blocknote-serveur.test.js`, « note de bas de page dans une cellule de tableau »).
- **A3 : faux.** `@handlewithcare/prosemirror-inputrules` est sous licence MIT ; le contrat `contrats/statiques/licences.test.js` vérifie déjà la licence de chaque dépendance.
- **A4 : déjà fait.** La recette Firefox est dans `docs/v2-tests/etape-4-rapport.md` (point 5).
- **A5 : faux.** La règle 25 est respectée : l'erreur porte le code `blocs-invalides` ; le message de l'objet `Error` est interne, jamais montré.

Bilan : 5 constats, 1 juste (un test manquant), 4 faux ou déjà traités ; citations toutes valides.

## Arbitrage de Sylvain

(À compléter.)
