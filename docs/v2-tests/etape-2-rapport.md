# Rapport de tests de l'étape 2, « Droits » (08/11/2026)

Procédure : `docs/v2-procedure-tests.md`. Mistral étant suspendu, les scénarios sont ceux de Claude (`etape-2-scenarios.md`), et c'est Claude qui vérifie la couverture.

## Résultats dans la session de Claude

| Couche | Commande | Résultat |
|---|---|---|
| T0 statique | `npm run lint`, `npm run format:check`, contrats statiques | vert ; nouveau contrat « API publique seulement » (R2), vérifié contre deux fautes plantées exprès |
| T1 à T4 | `npm test` | 67 tests, tous verts (dont 8 T1 des droits, 8 T3 des droits, 5 T2 des droits) |
| T5 (Chromium) | `npm run test:pile` | 21 tests, tous verts (dont 2 nouveaux sur les droits) |
| T6 | `npm run test:en-ligne` (avec `NODE_USE_ENV_PROXY=1`) | 2 verts, 3 sautés comme prévu (WebSocket et ports hors de portée de la session) |
| Mesure | `npm run mesurer` | 257 Mo au total avec un livre de 500 000 signes ouvert à deux (étape 1 : 265 Mo) ; ouverture du livre en 0,4 s |

WebKit, Firefox et le T6 complet tournent dans GitHub (`.github/workflows/v2.yml`).

## Couverture des scénarios

| Couche | Scénario | Test |
|---|---|---|
| T1 | quatre rôles ordonnés ; chaque rôle a les capacités du précédent | `tests/unitaires/droits.test.js` |
| T1 | supprimer et transférer : au propriétaire seul ; inviter : éditeur et propriétaire | idem |
| T1 | accès au texte : écriture pour éditeur et propriétaire, lecture pour correcteur et lecteur, rien sans rôle | idem |
| T1 | rôle effectif = le plus fort ; liste vide ; rôle inconnu dans la liste | idem |
| T1 | rôles piégés (casse, accents, NFD, invisibles, `__proto__`, `toString`, tableau, nombre…) : le plus restrictif, jamais une erreur | idem, données `tests/donnees/piegees.json` (`roles`) |
| T3 | créateur propriétaire ; une seule création par document | `tests/unitaires/serveur.test.js` |
| T3 | sans rôle : 404, identique à un document inconnu (pas de fuite d'existence) ; route interne : `null` | idem |
| T3 | chaque rôle donné et ce que y/hub doit autoriser | idem |
| T3 | un éditeur invite et retire un éditeur ; un correcteur ne peut pas inviter | idem |
| T3 | le propriétaire ne se nomme ni ne se touche par la route de développement | idem |
| T3 | rôles, documents et corps piégés : 400 avec un code ; sans session : 401 | idem |
| T3 | rôle inconnu dans la table : le plus restrictif | idem |
| T3 | routes de développement fermées hors développement | idem |
| T2 | y/hub applique le rôle : lecteur et correcteur refusés, éditeur et propriétaire acceptés, vérifié chez un témoin **et** dans l'état relu côté serveur | `tests/services/collaboration.test.js` |
| T2 | rôle retiré : la connexion suivante est refusée | idem |
| T5 | correcteur : éditeur non modifiable, mention « Lecture seule », sa frappe n'arrive pas ; éditeur forcé par les outils de développement : y/hub refuse, rien au rechargement | `contrats/pile/pile.test.js` |
| T5 | sans rôle : le document ne s'ouvre pas, message traduit | idem |
| T5 | y/hub refuse une session valide sans rôle (403) et l'accepte avec | idem, contrat 4 |

Tous les scénarios retenus ont leur test.

## Captures relues par Claude

L'écran d'un correcteur, format Mac, clair et sombre : mention « Lecture seule » encadrée à la couleur d'accent, lisible dans les deux thèmes, sans débordement. Les contrôles d'affichage programmés (pseudo-langue, formats Mac et iPad) restent verts.

## Constats, qualifiés

1. **Un correcteur ne publie pas sa présence** (y/hub, `awareness` en lecture seule, réglage de l'étape 1) : les autres ne le voient pas dans « personnes sur ce document ». Comportement voulu à ce stade, ou non ? **Question de produit, pour l'étape 5** (quand le correcteur écrira des suggestions, il devra être visible).
2. **Retrait d'un rôle pendant une connexion** : y/hub décide des droits à la connexion ; une personne dont on retire le rôle garde sa connexion ouverte jusqu'à sa fermeture. **Sujet de l'étape 6** (gestion réelle des accès : couper les connexions de la personne retirée), noté dans son plan.
3. **Table des accès en mémoire** : un redémarrage du serveur l'efface, et la première personne qui rouvre un document en développement en redevient propriétaire. Voulu jusqu'à l'étape 6 (stockage).
4. **Le T6 « parcours » échouera dans GitHub tant que la nouvelle version n'est pas déployée** (il donne des rôles par une route que l'ancienne version n'a pas). Plus largement, le T6 qui suit un envoi sur `main` tourne avant le déploiement : à revoir avec le déploiement de la v2 (sujet d'exploitation, pas de cette étape).
