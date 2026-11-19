# Audit partiel avant fusion (2026-11-19)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 340396 signes envoyés, 3607 reçus (et 14921 de réflexion) ; réflexion `low` ; 204 s ; arrêt : stop
- Diff audité : `v2/` de `f308f3c` à `85212e6` (15 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse

Le diff rend les cellules de tableau lisibles et corrigeables par Margo (adressage « tableau/ligne.colonne »), côté serveur, client et consignes, avec des tests serveur solides ; il ajoute le contrat du livre de référence de l'étape 7. L'arithmétique des positions dans les tableaux est correcte et vérifiée sur un vrai état Yjs. Les principaux manques : les modifications côté client (bouton « Corriger », sélection, aller-au-bloc) ne sont couvertes par aucun test, et la règle « un seul endroit » est contredite par la duplication du découpage d'identifiant entre client et serveur.

## Constats

1. **[important]** Grille 7 (tests), `v2/adaptateurs/blocknote/index.jsx:99`, `v2/adaptateurs/blocknote/index.jsx:103`, `v2/adaptateurs/blocknote/index.jsx:117`, `v2/adaptateurs/blocknote/index.jsx:703` — Les changements côté client (`aDuTexte`, `selectionEnBlocs` qui admet les tableaux, `BoutonCorriger` qui apparaît sur une sélection de tableau, `allerAuBloc` qui ramène une cellule à son tableau) n'ont aucun test : le diff n'ajoute des tests que pour le serveur (`tests/unitaires/blocknote-serveur.test.js`) et le service (`tests/services/margo.test.js`). La règle 14 demande des tests d'extension sur un éditeur BlockNote réel. Proposer un test client (sélection d'un tableau → le bouton apparaît et envoie la sélection ; clic sur un bloc cité « tab/1.2 » → va au tableau).
2. **[mineur]** Grille 4 (simplicité, redondance), `v2/adaptateurs/blocknote/serveur.js:112` — `ancreCommentaire` appelle `blocsATexte(ancien)` en entier (extraction du texte et des segments de chaque bloc et cellule) uniquement pour retrouver les positions des cellules, alors que la boucle `descendants` au-dessus calcule déjà les positions des blocs. Un parcours de positions seules suffirait ; proposer de ne collecter que `{id, debut, taille}` des cellules, ou de réutiliser `debuts` depuis `blocsATexte`.
3. **[mineur]** Grille 1 / règle « un seul endroit » (§ 1), `v2/adaptateurs/blocknote/index.jsx:703`, `v2/adaptateurs/blocknote/serveur.js:157` — Le découpage `String(id).split('/')[0]` est écrit deux fois : en dur dans le client, et comme `blocDeLUnite` dans le serveur. L'adaptateur BlockNote étant un dossier unique, la convention d'adressage des cellules mérite d'être définie à un seul endroit (par exemple un petit module partagé de l'adaptateur, sans dépendance serveur) ; sinon, au moins renvoyer le client vers `blocDeLUnite` si l'import ne tire pas de code serveur.
4. **[question]** Grille 2 (API publique), `v2/contrats/statiques/livre-de-reference.test.js:88` — `createRequire(...).resolve('@blocknote/xl-typst-compiler/wasm')` résout un sous-chemin du paquet : est-il exposé par le champ `exports` du paquet (auquel cas c'est public) ou s'agit-il d'un chemin interne interdit par la règle 2 ? À vérifier dans le `package.json` de `@blocknote/xl-typst-compiler` ; si interne, passer par ce que l'adaptateur exporte déjà pour le wasm.
5. **[mineur]** Grille 4 (option « au cas où »), `v2/contrats/statiques/livre-de-reference.test.js:81` — `MODELES_LIVRE.a4 ?? Object.values(MODELES_LIVRE)[0]` : le repli sur « le premier modèle » est une option de secours sans besoin établi ; si `a4` manque, mieux vaut que le test échoue nettement. Proposer `MODELES_LIVRE.a4` seul.

## Points de grille sans remarque

3 (redondance avec l'amont), 5 (sécurité et droits), 8 (exports propres : la source Typst de référence est comparée au signe près, NFC couvert par l'existant), 9 (traductions : la consigne mise à jour reste dans le catalogue, langue du document), 10 (licences : aucune dépendance nouvelle).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. Juste, non corrigé : les gestes du navigateur (sélection d'un tableau, bouton « Corriger », clic sur une cellule citée) n'ont pas de test ; dit à Sylvain, à ajouter dans la pile.
2. Accepté : un second parcours du document à la pose d'une ancre, sans conséquence mesurable ; une seule façon de calculer les positions des cellules.
3. Accepté : le client ne peut pas importer la partie serveur de l'adaptateur (elle charge BlockNote hors navigateur) ; la convention tient en une ligne, commentée des deux côtés.
4. Vérifié : `./wasm` est une entrée du champ `exports` du paquet, déjà employée par `typst.test.js`.
5. Juste, corrigé : plus de repli ; les modèles du code sont pris tels qu’ils sont listés (`MODELES_LIVRE` est une liste, le repli masquait que `.a4` n’existait pas).

## Arbitrage de Sylvain

Fusion demandée par Sylvain le 19/11/2026.
