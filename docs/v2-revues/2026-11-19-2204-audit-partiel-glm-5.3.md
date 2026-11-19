# Audit partiel avant fusion (2026-11-19)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 458570 signes envoyés, 3118 reçus (et 11197 de réflexion) ; réflexion `low` ; 23 s ; arrêt : stop
- Diff audité : `v2/` de `a89aac2` à `ded283c` (12 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot met en place la coloration des corrections par auteur (table d'attributions de y/hub posée sur l'afficheur Yjs), la pastille des cartes du volet, et la palette restreinte à huit teintes avec le vert réservé aux agents. L'ensemble est couvert par un test de pile ambitieux et les réglages sont bien inscrits dans l'ADR 0008. Le point sensible est l'écriture directe dans l'état de l'afficheur Yjs (`inserts`, `deletes`, `emit`), dont le caractère public mérite vérification, et deux cas limites de la re-signature.

## Constats
1. **[question]**, grille 2, `v2/adaptateurs/blocknote/suggestions.js:61` (aussi `:62`, `:65`) — `poserAuteurs` écrit directement dans `afficheur.inserts` et `afficheur.deletes`, remplace les champs de la `ContentMap` (`attributions.inserts = table.inserts`, ligne 50-51) et émet un événement `change` fabriqué (`afficheur.emit('change', [touches, poserAuteurs, false])`, ligne 65). Si ces membres et cet événement font partie de l'API publique documentée de l'afficheur de `@y/prosemirror`, tout va bien ; sinon c'est un contournement de la règle 2 (API publique seulement) qui cassera à la première montée de version. Proposer de vérifier dans la documentation/contrats de Yjs 14, et d'ajouter un test de contrat qui épinglerait cet usage.
2. **[mineur]**, grille 6, `v2/adaptateurs/blocknote/suggestions.js:63` — les identifiants signés (`etat.signes`) ne grandissent que dans un sens : si la table de y/hub corrige l'auteur d'un changement déjà affiché et signé, la correction garde son ancienne couleur pour toujours (le diff `affiches − dejaSignes` l'exclut). Cas improbable mais réel (reconnexion, correction serveur). Proposer de vider `signes` quand la table change d'auteur pour un identifiant déjà signé, ou de le noter comme limite acceptée.
3. **[question]**, grille 6, `v2/design/feuilles/editeur.css:165` vs `:168` — en thème sombre, le trait sous un ajout passe à `--user-color-dark` (ligne 165) mais la suppression reste barrée de `--user-color-light` (ligne 168), alors que le réglage `css.editeur.suggestions` dit « suppression barrée d'un trait de 2 px de la même couleur ». Est-ce voulu (lisibilité du barré sur fond sombre) ou oubli ? Si voulu, le noter dans la colonne décision de l'ADR 0008.
4. **[mineur]**, grille 6, `v2/adaptateurs/blocknote/suggestions.js:50` — `poserAuteurs` ne vérifie que `table` (ligne 47), pas la présence de `table.inserts` / `table.deletes` ; une table partielle mettrait `undefined` dans la `ContentMap` et casserait les transactions suivantes de l'afficheur. Un garde `table.inserts ?? attributions.inserts` suffirait, ou une assertion dans le contrat.
5. **[mineur]**, grille 7, `v2/contrats/pile/margo.test.js:303` — l'attente de la couleur de Margo ne vérifie pas l'échec : si le vert n'arrive jamais, la boucle expire silencieusement et l'assertion suivante (`assert.equal(couleurs.margo, VERT)`, ligne 305) échoue avec un message peu parlant, après 15 s. Un compteur d'échec explicite (comme pour `bloc`, ligne 282) rendrait le diagnostic plus net. Facultatif.

## Points de grille sans remarque
1, 3, 5, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. **Vérifié, et épinglé.** L'afficheur vient de Yjs (`@y/y`, `createDiffRenderer`), pas de `@y/prosemirror`. Ses déclarations publiées donnent l'option `attributions`, les champs `inserts` et `deletes` (des `IdMap`) et l'événement `change` ; les fonctions employées (`intersectMaps`, `insertIntoIdMap`, `diffIdSet`…) sont exportées par le paquet. Rien n'est lu hors de l'API exportée, mais poser des auteurs après coup n'est pas un usage documenté : un contrat l'épingle (`contrats/statiques/fondations-suivi.test.js`, « donner à l'afficheur les auteurs reçus après coup »), et la veille le note (`docs/v2-veille.md`). La cause est en amont : y/hub garde les auteurs sans les envoyer en direct ; s'il vient à le faire, ce code se retire.
2. **Limite acceptée, notée dans le code.** y/hub ne change pas l'auteur d'un changement enregistré ; un passage signé garde son auteur.
3. **Juste, corrigé.** En sombre, le barré d'une suppression est maintenant à la même couleur que le trait d'un ajout (`--user-color-dark`) ; l'ADR 0008 le dit.
4. **Juste, corrigé.** Une table incomplète est ignorée ; le contrat le vérifie.
5. **Juste, corrigé.** L'assertion porte un message.

Après corrections : `npm run format:check`, `npm run lint`, `npm test` au vert ; pile de Margo (dont le test des couleurs) repassée.

## Arbitrage de Sylvain

(À compléter.)
