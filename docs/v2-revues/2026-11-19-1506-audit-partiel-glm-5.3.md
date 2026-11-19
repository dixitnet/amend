# Audit partiel avant fusion (2026-11-19)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 294610 signes envoyés, 3319 reçus (et 10593 de réflexion) ; réflexion `low` ; 88 s ; arrêt : stop
- Diff audité : `v2/` de `c6f6c31` à `cfef103` (8 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Ce diff est presque entièrement du test et de l'outillage de campagne : déduplication des gestes d'historique, test de pile pour les suggestions de Margo dans un tableau, deux suites de tests nouveaux (veille d'exploitation, fermeture Yjs). Aucun code applicatif ni de design n'est touché, donc les grilles de couches, d'API publique et de traductions sont largement hors de cause. Le principal écart est le test de fermeture Yjs, qui simule les événements de la fondation au lieu de l'exercer, et ne protège donc pas la montée de version qu'il annonce. Quelques points à vérifier (imports non visibles dans le diff) restent en question.

## Constats
1. **[important]** Grille 7 (tests), `v2/tests/unitaires/yjs-fermeture.test.js:27` (aussi :36-37, 40) — Le test annonce « Protège la montée de `@y/websocket` » mais n'exécute jamais la fondation : il émet lui-même `fournisseur.emit('closed', [{ code }])`. Si `@y/websocket` change le nom d'événement ou la forme de la charge utile à la fermeture, ce test reste vert et l'adaptateur casse en production. Proposer un test de contrat (dans `v2/contrats/`) qui ferme réellement une connexion y/hub avec ces codes, ou au moins un contrat qui vérifie la forme de l'événement `closed` sur la version épinglée.
2. **[mineur]** Grille 4 (simplicité) / 6, `v2/tests/unitaires/yjs-fermeture.test.js:27` — Le test atteint les entrailles de l'adaptateur (`session.contexte.fournisseur`, `session.contexte.suggestions.fournisseur`) : si `contexte` est un détail interne, le test casse à chaque réorganisation de l'adaptateur. Proposer un point d'entrée de test (par exemple une option d'injection du fournisseur) ou documenter `contexte` comme interface de test.
3. **[question]** Grille 6, `v2/exploitation/campagne/scenario-cinq.mjs:16` — Le fichier importe `coller` de `gestes.mjs`, mais le diff n'ajoute pas cette fonction à `gestes.mjs` (seules les fonctions d'historique y sont ajoutées, lignes 506-520). Vérifier que `coller` existe déjà dans `gestes.mjs` avec une signature compatible (dictionnaire de types MIME) ; sinon le scénario cinq casse à l'exécution.
4. **[question]** Grille 6, `v2/contrats/pile/margo.test.js:259` — `boutonCorriger(p)` est utilisé mais n'apparaît ni dans les imports modifiés (ligne 10) ni dans le diff. Vérifier qu'il est bien défini plus haut dans le fichier (l'essai réel précédent l'utilise probablement) ; sinon c'est une référence non définie.
5. **[mineur]** Grille 6 (fuite de ressource), `v2/contrats/pile/margo.test.js:218` — Le client de collaboration `interne` ouvert pour poser la suggestion n'est jamais fermé : la connexion WebSocket (texte et suggestions) reste ouverte à la fin du test. Proposer `interne.fermer()` (ou l'équivalent de l'adaptateur) avant `p.context().close()`.
6. **[mineur]** Grille 6, `v2/tests/unitaires/veille.test.js:78` (aussi :93, 108, 123, 133, 152) — Les répertoires temporaires ne sont nettoyés qu'en fin de test réussi : une assertion qui échoue laisse `veille-*` / `alerte-*` dans le répertoire temporaire. Envelopper le corps des tests dans `try/finally` (ou utiliser `t.after`).

## Points de grille sans remarque
1, 2, 3, 5, 8, 9, 10 — Le point 4 est couvert par les constats 2 et 3 (déduplication des gestes d'historique, qui va dans le bon sens) ; le point 7 par les constats 1 et 3.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

1. Juste, corrigé : un contrat statique (`fondations-suivi.test.js`) vérifie que la version épinglée de `@y/websocket` émet toujours `closed` avec le code ; le test unitaire garde le mappage.
2. Accepté : `contexte` est l'interface que l'adaptateur de l'éditeur consomme déjà (documentée ainsi dans l'adaptateur) ; pas de point d'injection ajouté pour un test.
3. Vérifié : `coller(page, donnees)` existe dans `gestes.mjs` (dictionnaire de types), et le scénario à cinq l'appelle avec cette forme.
4. Vérifié : `boutonCorriger` est défini en tête du fichier (ligne 31).
5. Faux : le client de collaboration du serveur ne garde aucune connexion (des appels HTTP, un par demande) ; rien à fermer.
6. Juste, corrigé : les dossiers temporaires sont retirés par `t.after`, même en cas d'échec.

## Arbitrage de Sylvain

Fusion demandée par Sylvain le 19/11/2026.
