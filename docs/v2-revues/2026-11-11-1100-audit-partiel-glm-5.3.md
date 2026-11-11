# Audit partiel avant fusion (2026-11-11)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 115326 signes envoyés, 2993 reçus (et 8321 de réflexion) ; réflexion `low` ; 23 s ; arrêt : stop
- Diff audité : `v2/` de `02b81a7` à `620a99b` (5 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff implémente l'héritage des images entre copies (comme Docs) : adresse par `origine`, table d'héritage, transfert à l'effacement de la source, avec un test de service couvrant le parcours complet. La logique de droits est globalement saine (404 sans distinction, contrôle serveur). Deux points notables : l'appel à `heritierImages` hors de la transaction de copie (incohérence possible en cas d'échec), et le choix arbitraire de l'héritier receveur à l'effacement, qui peut désigner un document déjà en corbeille.

## Constats
1. **[important]** Grille 6 (correction, atomicité), `v2/application/serveur/comptes.js:688` — `await comptes.heriterImages(id, docId)` est appelé après le bloc `try/catch` qui garantit « un échec défaut toute la copie » (ligne 681-684) : si cet appel échoue, la copie existe mais n'hérite pas des images, et l'erreur remonte sans nettoyage — un état à moitié fait, contraire au commentaire de la ligne 681. Proposer de l'intégrer à la transaction/au bloc protégé, avec le même `effacer(id)` en cas d'échec.
2. **[mineur]** Grille 6 (cas limite), `v2/adaptateurs/postgres/comptes.js:320-322` — le `distinct on (origine) … order by origine, document` choisit l'héritier receveur par ordre d'identifiant, sans écarter les documents déjà mis à la corbeille (`supprime_le is not null`) : l'image peut transiter par un document condamné avant de repartir à son effacement. Le comportement final reste correct (re-transfert au purgeage), mais un test ne le couvre pas. Proposer d'exclure les documents supprimés du receveur, ou de documenter et tester ce transit.
3. **[mineur]** Grille 7 (tests), `v2/tests/services/partage.test.js:572` — l'assertion étiquetée « sans accès à la copie : rien » vérifie en fait l'absence de tout accès (Luc n'a accès ni à la source ni à la copie à ce stade) ; le cas « accès à la source mais pas à la copie » n'est pas testé séparément. Proposer une assertion où Luc lit la source sans accès à la copie, pour couvrir la branche `lit(image.document)` de `v2/application/serveur/images.js:71`.
4. **[mineur]** Grille 4 (simplicité), `v2/application/serveur/images.js:72` — la boucle sur `heritiersImages` fait une requête de rôle par héritier (N+1). À l'échelle d'amend.ink cela reste supportable, mais un plafond ou une jointure côté adaptateur éviterait une énumération non bornée. À noter, pas forcément à corriger maintenant.
5. **[question]** Grille 6, `v2/adaptateurs/postgres/comptes.js:319-323` — le transfert ne déplace que les images dont `document = id` ; les images dont `origine = id` mais déjà déplacées ne sont pas concernées, et celles sans héritier disparaissent avec le document (le test ligne 594 le confirme). Je suppose une cascade `on delete` sur `images.document` hors diff ; si elle n'existe pas, des images orphelines resteraient. À vérifier dans le schéma complet.

## Points de grille sans remarque
1 (couches), 2 (API publique), 3 (redondance amont), 8 (exports), 9 (traductions), 10 (licences).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

Périmètre : les changements de logique depuis l'audit partiel de 10 h 10 (images d'une copie, plafonds de mémoire, plan), audités sur le commit `620a99b`. Les découpages qui suivent (routes des comptes, dépôt PostgreSQL, `App.jsx`) ne sont pas passés à l'auditeur : le diff complet (661 183 signes) dépasse ce que le script accepte, et ce sont des déplacements de code, vérifiés autrement (comparaison des lignes avant et après, ordre des routes relu par Claude, aucun test modifié). Contrôles sur l'ensemble final : `lint`, `format:check` et `knip` propres ; 353 tests rapides, 352 passés, 1 sauté ; 60 parcours de la pile, 59 passés, 1 sauté.

1. **Juste, corrigé.** L'héritage des images est posé dans le bloc protégé, avant la copie du texte : un échec défait toute la copie.
2. **Sans conséquence, laissé.** Qui lit une copie héritière lit l'image, quel que soit le document qui la garde ; si le receveur est à la corbeille, l'image repart à son effacement.
3. **Juste, et la branche était inutile.** Le document qui garde une image après l'effacement de sa source est toujours une copie héritière : la vérification « lit le document qui la garde » faisait double emploi. Retirée ; le test existant couvre les deux chemins restants (lecteur de la source, lecteur d'une copie).
4. **Noté.** Une requête de rôle par copie héritière ; le nombre de copies d'un document est petit.
5. **Vérifié.** `amend.images.document` a bien `on delete cascade` (schéma).

À savoir : une copie hérite de toutes les images envoyées dans sa source, y compris après la copie (Docs s'arrête à celles que le texte cite au moment de la copie). Leur nom est un aléa de 128 bits, qu'on ne connaît qu'en lisant le document : sans conséquence pratique, noté ici.

## Arbitrage de Sylvain

(À compléter.)
