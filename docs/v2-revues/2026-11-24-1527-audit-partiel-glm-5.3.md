# Audit partiel avant fusion (2026-11-24)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 426632 signes envoyés, 3224 reçus (et 5494 de réflexion) ; réflexion `low` ; 110 s ; arrêt : stop
- Diff audité : `v2/` de `ff28f60` à `14388dd` (6 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff ajoute un correctif temporaire (`correctif-forme.js`) pour un défaut d'affichage de Yjs 14, son branchement dans l'afficheur de suggestions, la mise à jour du lint et une couverture de tests solide (unitaire + pile, dont un test qui échoue sans le correctif). Le principal écart est procédural : la règle § 4.5 exige un ticket amont **ouvert** avant un correctif de fondation, or l'en-tête dit « à ouvrir ». Deux accès à des membres privés ou non documentés de Yjs (`_observers` dans le test, champs internes dans le correctif) contredisent la règle 2, même si le second est signalé comme écart assumé.

## Constats
1. **[important]** Grille 2 / règle § 4.5, `v2/adaptateurs/blocknote/correctif-forme.js:6` — Les quatre conditions d'un correctif temporaire de fondation incluent « un ticket amont est ouvert » ; l'en-tête écrit « Ticket amont : à ouvrir ». Le correctif est livré sans que la condition soit remplie. Proposer : ouvrir le ticket (le texte est prêt dans la veille) avant la fusion, ou faire valider le report par Sylvain.
2. **[important]** Grille 2 (membre privé), `v2/tests/unitaires/correctif-forme.test.js:101` — `texte._observers` lit un membre privé (souligné) de Y.Doc, contraire à la règle « aucun membre privé ». Proposer : compter les écoutes par un moyen public (appeler une transaction et observer l'effet), ou noter cette dérogation dans la veille avec le reste du correctif.
3. **[question]** Grille 2 (API publique), `v2/adaptateurs/blocknote/correctif-forme.js:29` — `Y.ContentFormat`, `Y.iterateStructsByIdSet`, `Y.createIdSet`, `Y.mergeIdSets`, `Y.diffIdSet` et les champs `left`, `right`, `parent`, `content` : l'en-tête admet que ces champs ne sont pas documentés comme stables, mais je ne peux pas vérifier ici lesquels font réellement partie de la surface publique de `@y/y`. Si `ContentFormat` ou `iterateStructsByIdSet` ne sont pas exportés documentés, l'écart va au-delà de ce que la règle 1 (troisième exception) autorise, et il devrait être validé par Sylvain comme le reste du correctif (marqué « à valider » dans les règles).
4. **[mineur]** Grille 6 (cas limite), `v2/adaptateurs/blocknote/correctif-forme.js:69-74` — L'enveloppe d'`emit` ne corrige que la **première** émission `'change'` après une transaction (les identifiants sont remis à `null` ligne 72-73). Si l'afficheur émet `'change'` plusieurs fois pour une même transaction (émission fractionnée), les suivantes ne bénéficieraient pas de la correction. Vérifier dans le code de `DiffRenderer` qu'une transaction n'émet qu'une fois, ou ne consommer les identifiants qu'au moment où une transaction suivante les remet à zéro.
5. **[mineur]** Grille 7 (test), `v2/contrats/pile/margo.test.js:265` et `v2/contrats/pile/margo.test.js:423` — `await attendre(5000)` / `attendre(4000)` : attentes fixes longues qui ralentissent la suite et peuvent laisser passer une lenteur (le test passe même si l'action n'est pas finie). Proposer : attendre une condition (disparition des cartes, texte attendu) avec délai maximal, comme le font les boucles voisines (lignes 416, 422).

## Points de grille sans remarque
1 (arborescence et lint mis à jour cohéremment, `v2/eslint.config.js:267-271`), 3, 4, 5, 8, 9, 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

Second passage, sur le lot entier (le premier, à 14 h 43, portait sur le premier commit).

1. **Juste, question pour Sylvain.** Le ticket amont n'est pas ouvert : Claude n'a pas accès au dépôt `yjs/yjs`, le texte est prêt dans la veille. Sylvain a demandé la fusion (« Fusionne dès que possible ») en sachant le ticket non ouvert (dit dans les comptes rendus du jour) : le correctif part avec cette condition en attente, à lever par Sylvain (ouvrir le ticket) ou à reporter par lui explicitement.
2. **Juste, corrigé.** Le test ne lit plus `_observers` : il compte les écoutes par les méthodes publiques `on` et `off` du document.
3. **Vérifié.** `ContentFormat`, `Item`, `iterateStructsByIdSet`, `createIdSet`, `mergeIdSets`, `diffIdSet` sont des exports de `@y/y` (`src/index.js`). Seuls les champs `left`, `right`, `parent`, `content` des éléments et l'événement `beforeObserverCalls` ne sont pas documentés comme stables : écart noté dans la veille et dans l'en-tête, validé avec la fusion (règle 1 complétée).
4. **Faux.** L'afficheur n'émet `'change'` qu'une fois par transaction du document du texte (`Renderer.js`, une seule émission à la fin de son écoute `beforeObserverCalls`). Les autres émissions (`poserAuteurs`, chez nous) ont lieu hors transaction, quand les deux ensembles sont déjà remis à zéro.
5. **Juste pour le nouvel essai, corrigé ; hors lot pour les deux lignes citées.** Les lignes 265 et 423 sont d'avant ce lot. Le nouvel essai (« porte du gras ») attend maintenant la disparition des cartes, puis une seconde pour constater que rien ne revient (une absence ne se prouve pas sans un court délai).

## Arbitrage de Sylvain

(À compléter.)
