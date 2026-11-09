# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 131650 signes envoyés, 2884 reçus (et 10992 de réflexion) ; réflexion `low` ; 37 s ; arrêt : stop
- Diff audité : `v2/` de `50df8c4` à `b6915e1` (18 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitré.

## Avis de l'auditeur

## Synthèse
Lot cohérent (étape 6c : dossiers personnels, « Partagé avec moi », retrait de soi) respectant les couches : règles en domaine pur, SQL dans l'adaptateur, présentation dans `v2/design/`, textes en catalogues ICU avec pluriels et dates par `Intl`. Tests unitaires, de service et de pile couvrent bien les nouveaux comportements, y compris les cas limites (boucle, dernier propriétaire, dossier d'autrui). Les constats portent sur des cas limites de logique (transfert de propriété, courses, application partielle) et deux questions de design et de libellé.

## Constats
1. **[important]** grille 6 — `v2/domaine/dossiers.js:42`, `v2/domaine/dossiers.js:45`, `v2/adaptateurs/postgres/comptes.js:67`. `emplacement` est fixé au créateur et jamais mis à jour : après un transfert de propriété (capacité `transferer`, étape 6a), le document reste rangé dans « Mes documents » de l'ancien propriétaire et le nouveau ne peut pas le ranger (`peutRanger` exige `emplacement === moi`). Proposer à Sylvain de mettre `emplacement` à jour au transfert, ou de le noter comme écart assumé.
2. **[mineur]** grille 6 — `v2/application/serveur/comptes.js:219-221`. Le contrôle de boucle (`refusDeplacementDossier`) se fait sur un instantané (`dossiersDe`) puis le déplacement s'exécute hors transaction : deux déplacements simultanés peuvent créer un cycle en base. Le client s'en protège (`cheminDe` coupe les boucles, `App.jsx:174`), mais la base peut devenir incohérente. Faire le contrôle et l'update dans une même transaction (comme `modifierAcces`).
3. **[mineur]** grille 6 — `v2/adaptateurs/postgres/comptes.js:252-253`. `donnerAcces` en conflit ne met à jour que `role`, pas `auteur` : une personne réinvitée par quelqu'un d'autre garde « partagé par » le premier auteur. Mettre `auteur = excluded.auteur` dans l'`on conflict`.
4. **[mineur]** grille 6 — `v2/application/serveur/comptes.js:213-222`. `PUT /api/dossiers/:id` applique le renommage avant de contrôler le déplacement : si le parent est refusé (404/409), le nom est déjà changé alors que la réponse dit échec. Contrôler le parent d'abord, ou tout faire en transaction.
5. **[question]** grille 1 — `v2/application/client/App.jsx:284`, `v2/application/client/App.jsx:298`, `v2/application/client/App.jsx:330`. `window.prompt` / `window.confirm` dans la couche application : les textes sont traduits, mais l'apparence de ces dialogues natifs échappe à `v2/design/` (règle 17). Est-ce un choix assumé en attendant les lots design de l'étape 6, ou un écart à corriger ?
6. **[question]** grille 9 — `v2/i18n/fr.json:105`, `v2/i18n/en.json:105`. Le titre d'écran « Tous les documents » / « All documents » alors que l'onglet actif ne montre que « Mes documents » ou « Partagé avec moi » : le libellé ne correspond à aucune des deux vues. Vérifier l'intention avec Sylvain.

## Points de grille sans remarque
2, 3, 5, 7, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

1. **Juste, corrigé autrement.** Il n'y a pas de transfert à proprement parler depuis 6a : on nomme un autre propriétaire, puis on se retire. Un document doit donc toujours être rangé chez l'un de ses propriétaires.
   - Dans la transaction de `modifierAcces` : quand la personne chez qui il est rangé cesse d'être propriétaire, il passe à la racine de Mes documents du plus ancien des autres propriétaires.
   - Test : « un propriétaire qui part ».
2. **Juste, corrigé.** `deplacerDossier` verrouille les dossiers de la personne et applique la règle du domaine (passée en fonction) dans la même transaction.
3. **Juste, corrigé.** En cas de conflit, `auteur` prend le nouvel auteur s'il est donné (`coalesce`), sinon garde l'ancien. Un simple changement de rôle sans auteur ne l'efface pas.
4. **Juste, corrigé.** Le nom est vérifié d'abord, puis vient le déplacement (en transaction), puis seulement le renommage. Test : « un nom valide mais un parent refusé ne change rien ».
5. **Question pour Sylvain.** C'est un choix provisoire, noté dans le plan de 6c : les boîtes de dialogue natives servent en attendant les écrans de 6b, où la saisie d'un nom et les confirmations auront leur composant de design.
6. **Juste, corrigé.** Le titre est celui de l'onglet affiché (« Mes documents » ou « Partagé avec moi »).

## Arbitrage de Sylvain

09/11/2026 : « ok » (réponses acceptées ; constat 5 : boîtes de dialogue natives gardées jusqu'aux écrans de 6b) ; accord de fusion de l'étape 6c.
