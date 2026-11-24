# Audit partiel avant fusion (2026-11-24)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 417501 signes envoyés, 3673 reçus (et 5708 de réflexion) ; réflexion `low` ; 44 s ; arrêt : stop
- Diff audité : `v2/` de `ff28f60` à `21f9b91` (5 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff ajoute un « filet » qui détecte un affichage de corrections périmé après un arbitrage, fondé sur une comparaison des deux documents Yjs (`rienEnAttente`), et remonte l'éditeur. La mécanique est propre, dans les exceptions d'import prévues (règle 1, `suggestions.js`), avec un nettoyage de minuterie correct. Les réserves portent sur l'efficacité réelle des tests (le défaut étant non reproduit, le filet lui-même n'est pas exercé), un `console.warn` en français en dur, et des temporisations fixes fragiles.

## Constats

**A1 — [important]** Grille 7 (tests), `v2/contrats/pile/margo.test.js:369` et `v2/contrats/statiques/fondations-suivi.test.js:127`. Le nouveau test de pile (« Tout accepter ne laisse aucune correction ») vérifie l'état final, mais le défaut corrigé est déclaré « non reproduit » (`v2/adaptateurs/blocknote/suggestions.js:56`) : le test passera donc probablement même sans le filet, et le mécanisme de secours (`controler`, `surAffichagePerime`, la remontée par `setEssaiEditeur`) n'est jamais déclenché ni vérifié nulle part. Proposer un test qui force l'état périmé (par exemple en simulant un affichage désynchronisé, ou en testant au moins unitairement que `surAffichagePerime` est rappelé quand `affichagePerime` est vrai après un arbitrage).

**A2 — [mineur]** Grille 9 (traductions), `v2/adaptateurs/blocknote/index.jsx:567`. Le `console.warn` contient une phrase française en dur (« …correction(s) affichée(s)… éditeur remonté »). La règle 23 vise les textes destinés à une personne ; un journal destiné aux développeurs est à la frontière. À trancher : soit l'assumer comme message technique (le préciser quelque part, comme l'exception de l'ADR 0010), soit le passer en anglais ou en code.

**A3 — [mineur]** Grille 6 (correction), `v2/adaptateurs/blocknote/index.jsx:87` et `v2/contrats/pile/margo.test.js:270`, `:428`. Le contrôle repose sur une temporisation fixe de 1 500 ms (« le temps que l'éditeur se redessine ») et les tests sur des `attendre(5000)` / `attendre(4000)` fixes : sur une machine lente, le contrôle peut partir avant le redessin (faux négatif, `signale` restant à faux bloque ensuite tout nouveau contrôle pour la durée de vie de l'effet) ; sur une machine rapide, les tests perdent du temps. Proposer d'annuler et relancer le contrôle tant que l'état n'est pas tranché, ou de réarmer `signale` tant que l'affichage reste périmé.

**A4 — [mineur]** Grille 7 (tests), `v2/contrats/pile/margo.test.js:263-268`. Dans le test du tableau, le clic sur « Relecture » est suivi de `.catch(() => {})` et l'ouverture de l'onglet Corrections est conditionnelle (`if (await corrections.count())`) : si le bouton ou l'onglet manque, le test continue et échoue plus loin sur « Tout accepter » avec un message trompeur, ou risque de cliquer un mauvais élément. Retirer le `catch` silencieux et assumer l'échec à la bonne ligne.

**A5 — [question]** Grille 2 (API publique), `v2/adaptateurs/blocknote/suggestions.js:48-51`. `rienEnAttente` s'appuie sur `Y.createInsertSetFromStructStore`, `Y.createDeleteSetFromStructStore`, `Y.diffIdSet`, `Y.intersectSets`. L'import de `@y/y` dans `suggestions.js` est couvert par la troisième exception (règle 1), mais ces fonctions de comparaison d'ensembles d'identifiants sont-elles une API publique stable et documentée de Yjs 14, ou des utilitaires de bas niveau susceptibles de changer ? Si c'est le second cas, un contrat dédié (en plus du test de `fondations-suivi.test.js:127`, qui les exerce déjà) devrait le noter comme dépendance assumée dans `docs/v2-veille.md`.

## Points de grille sans remarque
1, 3, 4 (hors A3 sur la temporisation, classé correction), 5, 8, 10.

## Citations vérifiées par le script

- A1 : citations valides
- A2 : citations valides
- A3 : citations valides
- A4 : citations valides
- A5 : citations valides

## Réponse de Claude

A1. **Juste, en partie corrigé.** Le contrôle est maintenant une fonction à part (`creerControle`), testée seule : signalement quand l'affichage est périmé, une seule fois, délai qui repart du dernier geste, arrêt (`tests/unitaires/extensions-branchement.test.js`). Le jugement lui-même (`rienEnAttente`, `affichagePerime`) a son contrat sur de vrais documents Yjs. Reste non exercé dans un navigateur : l'état périmé lui-même, que je n'ai pas su provoquer, donc la remontée de l'éditeur dans ce cas. Elle emploie le mécanisme déjà en service pour une panne d'affichage (`essaiEditeur`).
A2. **Assumé.** C'est un message technique pour la console, comme les autres journaux du code, tous en français ; il n'est lu par personne dans l'interface. Un commentaire le dit.
A3. **Juste, corrigé.** Deux regards après chaque geste (1,5 s puis 5 s) : une machine lente est couverte par le second, et `signale` ne se pose qu'au signalement réel.
A4. **Juste, corrigé.** Le test ouvre l'onglet « Corrections » sans condition ni erreur avalée.
A5. **Épinglé.** Ces fonctions sont exportées par `@y/y` et typées ; le contrat `fondations-suivi.test.js` les exerce sur de vrais documents, et la veille nomme `rienEnAttente` comme dépendance assumée.

Après corrections : `npm run format:check`, `npm run lint`, `npm test` (555) au vert ; pile de Margo et de la relecture repassée.

## Arbitrage de Sylvain

(À compléter.)
