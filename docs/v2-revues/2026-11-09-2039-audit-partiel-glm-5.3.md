# Audit partiel avant fusion (2026-11-09)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 68830 signes envoyés, 3235 reçus (et 3827 de réflexion) ; réflexion `low` ; 13 s ; arrêt : stop
- Diff audité : `v2/` de `e8e14a2` à `ff37c19` (6 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; fusion acceptée par Sylvain (09/11/2026).

## Avis de l'auditeur

## Synthèse
Le lot ajoute une entrée d'essai protégée par clé (comptes en `@essai.amend.invalid`), ferme l'entrée de développement en production et empêche tout courrier vers les adresses `.invalid`. L'ensemble est cohérent avec les décisions de Sylvain citées et plutôt bien testé. Les constats portent surtout sur un test dont l'intitulé ne correspond pas à ce qu'il vérifie, l'absence visible d'arrêt des serveurs de test, et quelques points de robustesse du script d'exploitation.

## Constats
1. **[mineur]** Grille 7 — `v2/tests/services/serveur.test.js:411`. L'assertion « sans clé, la route n'existe pas » est fausse comme intitulé : `enLigne` est démarrée **avec** la clé (`jetonEssai: CLE`, ligne 403) ; l'appel sans en-tête teste « sans jeton fourni », pas « sans clé configurée » (ce dernier cas est bien couvert ligne 414 avec `prod`). Corriger l'intitulé (ou démarrer un serveur réellement sans clé) pour que le test annonce ce qu'il vérifie.
2. **[question]** Grille 6 — `v2/tests/services/serveur.test.js:403` et `v2/tests/services/serveur.test.js:404`. Les serveurs `enLigne` et `courte` sont démarrés dans le test sans qu'on voie d'arrêt (pas de `close()`/`stop()` dans le diff). Si `demarrer` ne s'arrête pas ailleurs (afterEach global), c'est une fuite de ressources et de ports entre tests. Vérifier et fermer.
3. **[mineur]** Grille 5 — `v2/application/serveur/index.js:179`. La route d'essai n'a aucune limitation de débit : qui possède la clé peut créer un nombre illimité de comptes en base (chaque nom distinct crée une personne). C'est la décision de Sylvain, mais un garde-fou simple (plafond de créations par période) protégerait la base de production. À proposer, pas à imposer.
4. **[mineur]** Grille 6 — `v2/exploitation/prod/essai.sh:29`. `grep '^V2_JETON_ESSAI=' "$V2" | tail -1` : si le fichier contient plusieurs lignes `V2_JETON_ESSAI` (ajouts successifs), la valeur affichée peut ne pas être celle lue par le serveur selon l'ordre de lecture de l'environnement. Le test `grep -q` ligne 19 rend ce cas possible justement. Nettoyer les doublons ou refuser le fichier non idempotent.
5. **[mineur]** Grille 4 — `v2/exploitation/prod/essai.sh:23`. Le script redémarre aussi `amend-v2-collab` alors que rien ne le concerne (la clé et `V2_DEV` ne touchent que le serveur). Un redémarrage inutile du processus de collaboration coupe les sessions d'édition en cours pour rien. Limiter à `amend-v2`, ou justifier.
6. **[question]** Grille 5 — `v2/application/serveur/index.js:189`. `console.log` du nom fourni par la requête : un nom contrôlé par l'appelant écrit dans le journal (séquences d'échappement possibles). `nomPersonne` valide probablement la forme, donc le risque est faible ; à confirmer, sinon échapper ou journaliser l'identifiant.
7. **[mineur]** Grille 7 — `v2/tests/unitaires/courrier.test.js:13`. Le test couvre l'adresse avec espaces et majuscules, ce qui est bien, mais pas le cas d'une adresse `.invalid` en sous-domaine inattendu ni d'une adresse vide ; le comportement de `creerCourrier` sans clé avec une vraie adresse n'est pas re-testé ici (il l'est probablement ailleurs). Compléter si la couverture existante ne le fait pas.

## Points de grille sans remarque
1, 2, 3, 8, 9, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

1. **Juste, corrigé.** L'intitulé dit désormais « sans jeton fourni ». Le cas « sans clé configurée » est couvert par le serveur `prod`.
2. **Faux.** `demarrer` range chaque serveur dans `serveurs`, et le `after` du fichier les ferme tous.
3. **Noté.** La clé n'est connue que de l'environnement de Claude, qui ne crée que quelques comptes nommés (« TEST Claude A », « TEST Claude B ») et les réutilise. Un même nom donne le même compte. Pas de plafond tant que le besoin n'est pas constaté.
4. **Faux.** Le script n'ajoute la clé que si elle manque (`grep -q`), donc il n'y a jamais de doublon. Et `tail -1` lit la même ligne que systemd, la dernière.
5. **Juste, corrigé.** Seul `amend-v2` est redémarré : `V2_DEV` et la clé ne concernent pas la collaboration.
6. **Faux, sans risque.** `nomPersonne` refuse les caractères de contrôle et les caractères invisibles (code `nom-caracteres`) : rien d'échappable n'arrive au journal.
7. **Noté.** La vraie adresse avec une clé est testée dans ce fichier, et le cas sans clé dans les tests des comptes. Une adresse vide est refusée bien avant, par le domaine (`adresseCourriel`).

## Arbitrage de Sylvain

(À compléter.)
