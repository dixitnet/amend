# amend.ink v2 : procédure de test (Claude, Mistral, Sylvain)

Statut : **projet** (08/11/2026), à valider par Sylvain. Complète `docs/v2-regles-developpement.md` (§ 5 contrats, § 6 vérification par une autre IA).

## 1. Le principe

Chacun fait ce qu'il fait bien, et rien n'est déclaré « testé » sans trace écrite :

| Qui | Rôle | Ce qu'il ne fait pas |
|---|---|---|
| **Claude** | écrit les tests, les lance, rédige le rapport, trie les propositions de Mistral | se juger seul : sa couverture est relue par Mistral |
| **Mistral** | **attaque** à l'ouverture (scénarios adverses et cas limites), **juge la couverture** à la clôture | écrire ou lancer des tests ; ses propositions sont des avis |
| **Sylvain** | **recette manuelle** de ce qu'aucune machine ne vérifie ici (appareils, WebSocket en ligne, vrai clavier), arbitrage | écrire des tests |

Limites connues de l'environnement de Claude (08/11/2026) : le proxy ne laisse passer **ni les WebSocket ni les ports autres que 80 et 443**, et seul **Chromium** est installé. La collaboration en direct se teste donc sur la pile locale (même code), et en ligne seulement par Sylvain.

## 2. Les niveaux de test

| N° | Niveau | Quoi | Où | Qui, quand |
|---|---|---|---|---|
| N1 | **Rapide** | tests unitaires (domaine, i18n), frontières du lint, contrats statiques (une seule copie de Yjs, licences, dictionnaire) | `v2/tests/unitaires/`, `v2/contrats/statiques/` ; `npm test` | Claude, **à chaque commit** |
| N2 | **Pile** | contrats des fondations et parcours de bout en bout sur la pile locale complète (PostgreSQL, Redis, y/hub, serveur, Chromium) | `v2/contrats/pile/` ; `npm run test:pile` | Claude, **à chaque clôture d'étape et à chaque montée de version** |
| N3 | **Saisie** | campagne de gestes réels : touches mortes, dictée, collage, sélection sur plusieurs blocs, deux personnes au même endroit, Ctrl+Z, en mode normal et en suggestion | outils de campagne adaptés à la v2 (à partir de l'étape 4) | Claude, **aux clôtures des étapes 4 et 5, puis à chaque montée de version de BlockNote** |
| N4 | **En ligne, automatique** | ce qui passe en HTTP : refus sans mot de passe, en-têtes, configuration servie, version déployée, connexion | script de fumée contre `v2.amend.ink` | Claude, **après chaque déploiement** |
| N5 | **En ligne, manuel** | collaboration réelle sur deux appareils, Safari et iPhone, clavier français (touches mortes), réseau coupé puis rétabli, port 4400 fermé | liste de recette de l'étape | Sylvain, **après chaque déploiement d'étape** |
| N6 | **Mémoire** | mémoire par processus, au repos, avec 10 documents, avec un livre ; pointes en ligne | `npm run mesurer` (local), `mesurer.sh` (VPS) | Claude en local à chaque clôture ; Sylvain sur le VPS après une séance |

Règle : un niveau qui ne peut pas tourner est **dit**, avec la raison ; il n'est jamais compté comme réussi.

## 3. Le cycle d'une étape

| Moment | Étape du cycle | Qui | Ce qui en sort |
|---|---|---|---|
| Ouverture | 1. Plan de l'étape, avec ses critères de sortie | Claude | `docs/v2-etape-N-plan.md` |
| | 2. Revue d'architecture du plan (existant) | Mistral | `docs/v2-revues/…-ouverture.md` |
| | 3. **Scénarios adverses** : Mistral reçoit le plan, les règles, la liste des tests existants, et propose des scénarios numérotés (S1, S2…) avec leur résultat attendu et leur gravité | Mistral | `docs/v2-tests/etape-N-scenarios.md` |
| | 4. **Tri** : pour chaque scénario, *retenu* (il devient un test, à quel niveau), *manuel* (il rejoint la recette de Sylvain), *écarté* (avec la raison) | Claude | même fichier |
| | 5. Arbitrage du plan, des réponses et du tri | Sylvain | |
| Pendant | 6. Développement ; N1 à chaque commit | Claude | |
| Clôture | 7. N2, N3 selon l'étape, N6 ; **rapport de tests** : nombres, échecs, ce qui n'a pas pu tourner, mesures, scénarios retenus et leur test | Claude | `docs/v2-tests/etape-N-rapport.md` |
| | 8. **Revue de clôture**, architecture, code **et couverture** : chaque scénario retenu a-t-il son test ? que manque-t-il ? (Mistral reçoit le diff, le rapport et le tri) | Mistral | `docs/v2-revues/…-cloture.md` |
| | 9. Réponses point par point, corrections | Claude | |
| | 10. Arbitrage, fusion | Sylvain | |
| Mise en ligne | 11. Déploiement (blocs Mac et VPS) | Sylvain | |
| | 12. N4 (fumée en ligne) | Claude | ajouté au rapport |
| | 13. N5 (recette manuelle) et N6 en ligne | Sylvain | `docs/v2-tests/etape-N-recette.md` cochée |
| | 14. Constats de recette : un défaut devient un test (N1 ou N2) **avant** sa correction, quand c'est possible | Claude | |

Une étape n'est close qu'avec le rapport (7) et la revue de clôture arbitrée (10). La recette en ligne (13) clôt la mise en ligne de l'étape, pas l'étape elle-même.

## 4. Ce qu'on demande à Mistral, précisément

1. **Scénarios adverses (ouverture)** : « trouve ce qui peut casser ». Grille : droits et contournements (un lecteur qui écrit, un correcteur qui modifie la base, une session forgée, un document d'un autre) ; concurrence (deux personnes, réseau coupé, redémarrage en pleine frappe) ; données limites (document vide, très long, caractères combinants, emoji, NFC) ; saisie (touches mortes, collage, dictée) ; exploitation (mémoire, redémarrage, base indisponible) ; traductions (texte manquant, pluriels). Chaque scénario : préconditions, gestes, résultat attendu, gravité, niveau de test suggéré.
2. **Couverture (clôture)** : pour chaque scénario retenu, le test qui le couvre existe-t-il, et vérifie-t-il vraiment le résultat attendu ? Quels risques du plan restent sans test ?
3. **Pas** de scénarios génériques (« tester les performances ») : chaque proposition doit citer un élément du plan ou du code.
4. Le texte de Mistral est un avis : Claude trie, Sylvain arbitre.

## 5. La recette manuelle de Sylvain

Une liste courte par étape, dans `docs/v2-tests/etape-N-recette.md`, rédigée par Claude à partir du plan et des scénarios « manuels » ; chaque ligne : appareil et navigateur, gestes, résultat attendu, case à cocher, remarque. Durée visée : un quart d'heure. Exemple pour l'étape 1 :

1. Mac, Safari : `https://v2.amend.ink/#recette`, mot de passe, un nom ; « Synchronisé ».
2. iPhone : même document ; la frappe de l'un apparaît chez l'autre en moins d'une seconde.
3. Mac, clavier français : « être » tapé avec la touche morte ^ ; pas de « ^ » resté.
4. Couper le Wi-Fi de l'iPhone, taper, le rétablir : le texte arrive chez l'autre.
5. Recharger : le texte est là.
6. Mac : `nc -vz -w 5 92.243.27.71 4400` échoue.
7. VPS : `mesurer.sh` ; noter les pointes.

## 6. Traces et unités

- Tous les fichiers de test, de rapport et de recette vivent dans `docs/v2-tests/` et sont commités.
- La consommation de Mistral est notée **en signes** envoyés et reçus (règle 5 de `CLAUDE.md`), pas en jetons.
- Les documents créés en ligne pour un test s'intitulent `verif-…` ou `recette-…`.

## 7. Outillage à écrire (après validation)

1. `tools/revue-ia.mjs` : deux phases de plus, `scenarios` (ouverture) et `couverture` (clôture, avec le rapport et le tri) ; consommation en signes au lieu de jetons.
2. `v2/exploitation/rapport-tests.mjs` : lance N1, N2 (et N6 en local), et écrit le squelette de `etape-N-rapport.md` (nombres, échecs, durées, ce qui n'a pas tourné).
3. `v2/exploitation/prod/fumee.mjs` : N4 contre `v2.amend.ink` (HTTP seulement).
4. Gabarits : `docs/v2-tests/` (scénarios, rapport, recette).

Application rétroactive à l'étape 1 : scénarios adverses de Mistral sur ce qui existe, recette ci-dessus par Sylvain, fumée N4.
