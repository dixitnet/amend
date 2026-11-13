# Audit partiel avant fusion (2026-11-13)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 235088 signes envoyés, 3891 reçus (et 10518 de réflexion) ; réflexion `low` ; 22 s ; arrêt : stop
- Diff audité : `v2/` de `6018818` à `901feb5` (6 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff remplace les modèles « base + écarts » par des copies complètes réglées style par style, avec un module de migration transitoire dans le domaine. L'architecture est respectée (domaine pur, tests libres d'importer le design), pas de dépendance nouvelle ni de texte destiné aux personnes. Les constats portent surtout sur la migration : cas non couverts (récursion, cycle, reprise après création de modèles au nouveau format), un test affaibli qui ne vérifie plus la valeur de l'alinéa, et quelques cas limites de `completerModele` et `blancSurGrille`.

## Constats
1. **[important]** Grille 7 (tests) — `v2/tests/unitaires/migration-modeles.test.js:9` : le seul test de `ancienModele` couvre le cas « base = modèle du code » ; la résolution via un modèle de l'instance (récursion, ligne 44 de `migrationModeles.js`), la garde `profondeur > 3` (ligne 41) et l'écart `chapitre.bellePage: false` (ligne 48) ne sont pas testés. Proposer d'ajouter ces cas, la récursion étant le cœur du code transitoire.
2. **[important]** Grille 6 (correction) — `v2/domaine/migrationModeles.js:41` : un cycle (A → B → A) ou une base inconnue aboutit silencieusement à `A4_ANCIEN`, alors que l'ancien `resoudreModele` rendait `modele-introuvable` ; une reprise de données fausses passerait inaperçue. Proposer un refus explicite (code `modele-introuvable` ou équivalent) plutôt qu'un repli muet.
3. **[mineur]** Grille 6 (correction) — `v2/domaine/migrationModeles.js:39` : la reprise tourne « au démarrage du serveur » ; si elle est rejouée après que des modèles au nouveau format (`valeurs`, sans `base`/`ecarts`) existent, `instance(entree.base)` peut renvoyer un modèle complet interprété comme base + écarts et produire un modèle faux. Question pour Claude : la reprise est-elle garantie de ne rencontrer que des lignes anciennes (drapeau en base, exécution unique) ? Si non, prévoir la détection du format.
4. **[mineur]** Grille 7 (tests) — `v2/tests/unitaires/miseEnPage.test.js:41` : le test relâche l'assertion sur l'alinéa (`4\.5mm` devient `\d+(\.\d+)?mm`) : il ne vérifie plus la valeur qu'il annonçait vérifier. Si la valeur de « TàT - Poche » est connue, rétablir l'assertion exacte.
5. **[mineur]** Grille 6 (correction) — `v2/domaine/miseEnPage.js:386` : `completerModele` avec `valeurs` primitif non nul (une chaîne, par exemple) fait `Object.entries('abc')` et fusionne des paires index/caractère dans le défaut, corrompant le modèle. Si ce cas est jugé impossible (jsonb contrôlé en amont), le dire dans le contrat ; sinon rejeter.
6. **[mineur]** Grille 6 (correction) — `v2/domaine/miseEnPage.js:125` : `blancSurGrille` renonce après `n + 60` itérations et rend `ordinaire` silencieusement, ce qui peut faire dévier le texte de la grille sans erreur. Le plafond de 60 n'est pas justifié ; proposer soit de le documenter, soit de rendre un code d'erreur.
7. **[mineur]** Grille 4 (simplicité) — `v2/domaine/migrationModeles.js:24` et `v2/domaine/miseEnPage.js:325` : la fonction `poser` est dupliquée à l'identique dans deux fichiers du domaine. La sortir dans un module partagé du domaine (ou l'exporter de `miseEnPage.js`).
8. **[mineur]** Grille 7 (tests) — `v2/tests/unitaires/miseEnPage.test.js:149` : le test avec `__proto__: null` (les réglages venant d'un objet sans prototype) a été retiré ; c'était une couverture du comportement de `Object.entries`/`poser` sur des entrées atypiques. Le rétablir ou noter pourquoi il n'a plus d'objet.
9. **[question]** Grille 6 (correction) — `v2/domaine/migrationModeles.js:7` : `A4_ANCIEN` duplique les valeurs de l'A4 simple qui vivent aussi dans `design/livre.js` ; le gel est voulu (c'est l'A4 *d'avant* le 13/11), mais si les deux doivent rester identiques, un test de non-divergence serait utile. À confirmer avec Claude.

## Points de grille sans remarque
1, 2, 3 (hors duplication mineure traitée en A7), 5, 8, 9, 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides
- 8 : citations valides
- 9 : citations valides

## Réponse de Claude

1. *Juste* : tests ajoutés (récursion par une base d'instance, base disparue, cycle, ancienne belle page).
2. *Voulu* : le repli muet sur l'A4 d'une base disparue ou d'un cycle est un choix de la conversion (les documents ne doivent pas rester sans modèle) ; code transitoire, noté au journal.
3. *Faux* : la conversion ne lit que les lignes dont `valeurs` est nul (`modelesAConvertir`), et la résolution des bases n'utilise que `base`/`ecarts` ; un modèle au nouveau format n'y entre jamais.
4. *Juste* : l'assertion exacte (alinéa de 4,5 mm) est rétablie.
5. *Hors sujet* : `valeurs` vient d'un jsonb écrit par le serveur seul, toujours un objet.
6. *Hors sujet pour ce lot* : plafond ancien de `blancSurGrille`, inchangé ; noté pour l'audit complet.
7. *Juste* : `poser` est exportée de `miseEnPage.js` et réutilisée.
8. *Juste* : le cas `__proto__: null` est rétabli dans les tests des réglages.
9. *Voulu* : l'A4 d'avant le 13/11 est gelé dans la conversion ; l'A4 du code a changé exprès (police, styles).

## Arbitrage de Sylvain

(À compléter.)
