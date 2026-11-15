# Audit partiel avant fusion (2026-11-15)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 255863 signes envoyés, 3015 reçus (et 4198 de réflexion) ; réflexion `low` ; 11 s ; arrêt : stop
- Diff audité : `v2/` de `269a61d` à `4472b55` (13 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff fait deux choses : colle « Tout accepter » / « Tout refuser » en haut du volet (réglage `css.suggestions.actions`, décidé par Sylvain, tests de pile à l'appui), et retire l'option « Tous » du filtre des fils de commentaires. L'ensemble est cohérent entre adaptateur, application, i18n, design et tests. Je relève surtout une règle CSS du téléphone sans clé de réglage (contrat de l'ADR 0008), une valeur dupliquée attribuée à tort à Mantine, et des contextes de navigateurs non fermés dans les tests.

## Constats
1. **[important]** Grille 1/8 (design décidé) — `v2/design/feuilles/telephone.css:116` : la nouvelle règle `.amend-volet-onglets .amend-suggestions-actions` ne porte pas de commentaire `/* réglage : … */`, alors que l'ADR 0008 (révision du 08/11/2026) exige que chaque règle de `design/feuilles/` porte la clé d'un réglage de la table, vérifié par le contrat statique. Si elle relève de `css.suggestions.actions`, il faut le dire ; sinon elle échappe à la décision. Proposer d'ajouter la clé (et, si c'est un réglage distinct, sa ligne dans la table de l'ADR 0008).
2. **[mineur]** Grille 6/8 — `v2/design/feuilles/telephone.css:115` : le commentaire dit « 60 px chez Mantine », mais l'ADR 0008 (`coquille.bandeau`) présente les 60 px comme la valeur des exemples de la documentation de l'AppShell, sans valeur par défaut — une décision de Sylvain, pas une valeur de Mantine. La valeur est de plus dupliquée en dur (`3.75rem`) au lieu de renvoyer au réglage `coquille.bandeau` : deux endroits à changer si la hauteur du bandeau bouge. Proposer de corriger le commentaire et de noter la dépendance envers `coquille.bandeau`.
3. **[mineur]** Grille 6 — `v2/contrats/pile/relecture.test.js:516` et `v2/contrats/pile/telephone.test.js:440` : seuls les contextes de Paule sont fermés ; ceux de Carla (`c`) et d'Edith (`e`, telephone.test.js:421) restent ouverts, contrairement aux tests voisins (relecture.test.js:464-465). Fuite de ressources de test, sans gravité mais incohérent. Proposer de fermer tous les contextes ouverts.
4. **[mineur]** Grille 7 — `v2/contrats/pile/telephone.test.js:425-431` : la logique de recherche du conteneur défilant et de défilement duplique le helper `resteVisible` de `v2/contrats/pile/relecture.test.js:491-503`. Proposer de factoriser (un helper partagé ou l'import du même module d'aide).
5. **[question]** Grille 9/11 (documentation) — `v2/application/client/Edition.jsx:513`, `v2/i18n/fr.json:133`, `v2/i18n/en.json:133` : le retrait de l'option « Tous » du filtre des fils n'apparaît dans aucune pièce fournie (ni table de l'ADR 0008, ni registre des renoncements) ; seuls les noms des tests citent « Sylvain, 15/11/2026 ». S'agit-il d'une décision de Sylvain à documenter, et `filtreFils` peut-il garder une valeur « all » persistée d'une session précédente (état local ou serveur) qui n'est plus dans les options ? À vérifier avant fusion.

## Points de grille sans remarque
2, 3, 4, 5, 10 (les grilles 1, 6, 7, 8, 9 sont traitées ci-dessus).

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides

## Réponse de Claude

1. *Faux*, avec la preuve : la règle suit le bloc `/* réglage : css.telephone.volets */` (une clé par bloc) et le contrat `design-decide.test.js` passe ; l'ADR 0008 porte la phrase du décalage dans la ligne de `css.telephone.volets`.
2. *Faux* sur le fond, corrigé sur la forme : les 3,75 rem sont le `min-height` de l'en-tête de `ModalBase.css` de Mantine (le tiroir), sans rapport avec le bandeau de l'AppShell (`coquille.bandeau`) ; le commentaire cite maintenant la source.
3. *Juste*, corrigé : tous les contextes sont fermés.
4. *Juste*, corrigé : `defilerJusquEnBas` (outils.mjs) sert aux deux tests.
5. *Juste* pour la documentation (ligne ajoutée au journal) ; *faux* pour l'état : `filtreFils` est un `useState('open')`, jamais gardé, donc aucune valeur « all » ne peut revenir.

## Arbitrage de Sylvain

(À compléter.)
