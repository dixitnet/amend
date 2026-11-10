# Audit partiel avant fusion (2026-11-10)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 102079 signes envoyés, 3544 reçus (et 5546 de réflexion) ; réflexion `low` ; 59 s ; arrêt : stop
- Diff audité : `v2/` de `ede916a` à `305a1f7` (9 fichiers)
- Statut : avis reçu ; répondu par Claude ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le diff ajoute l'interrupteur de suivi des modifications (états, bandeau, menus, tests, traductions) de façon globalement conforme aux couches et à l'ADR 0008 (Switch Mantine sans prop de style). Trois points retiennent l'attention : un défaut connu de BlockNote (acceptation individuelle d'une suggestion d'éditeur) n'est noté que dans un commentaire de test et non dans la veille ; l'interrupteur semble présent deux fois à l'écran L (bandeau et menu « … ») et au téléphone (barre d'actions et menu) ; le test de pile repose sur des attentes passives (`waitForTimeout`) et un contournement (« Tout accepter ») qui ne vérifie pas ce que son titre annonce.

## Constats
1. **[important]** Grille 7 (et veille), `v2/contrats/pile/relecture.test.js:159-161` — Le commentaire signale que l'acceptation une à une d'une suggestion faite par un éditeur « ne marche pas encore (10/11/2026, à examiner) », mais ce défaut n'apparaît ni dans `docs/v2-veille.md` ni dans un plan d'étape : il ne vit que dans un commentaire de test. Proposer de l'inscrire dans la veille (défaut de fondation à signaler en amont) ou dans le plan, avec un cas minimal.
2. **[important]** Grille 7, `v2/contrats/pile/relecture.test.js:143-163` — Le test annonce « elle la retrouve et l'accepte » mais contourne le défaut en passant par « Tout accepter » : il ne couvre pas l'acceptation individuelle, et le contournement masque le défaut au lieu de le révéler. Proposer un test séparé qui échoue tant que le défaut existe (à la manière des correctifs temporaires), ou de ne couvrir que ce qui marche et de suivre le reste en veille.
3. **[question]** Grille 6, `v2/application/client/App.jsx:957-966` et `v2/application/client/App.jsx:1063-1072` — L'entrée « suivi » est ajoutée à la liste `actions` quand `etroit` **et** au menu « … » pour tout `caps.includes('ecrire')` sans condition de taille : au téléphone elle apparaîtrait donc deux fois (barre d'actions et menu), et au format L également (bandeau ligne 1166-1170 **et** menu). Le commentaire ligne 1164 (« L : dans le bandeau ; M : dans le menu ») suggère que la présence simultanée n'est pas voulue. À vérifier avec Claude : la duplication est-elle intentionnelle ?
4. **[mineur]** Grille 7, `v2/contrats/pile/affichage.test.js:154-155` — `waitForTimeout(1200)` avec le commentaire « le réseau n'est jamais au repos » : attente passive qui rendra le test flaky ou aveugle selon la machine. Proposer une attente sur un état déterminé (par exemple la disparition des requêtes en cours, ou un sélecteur stable par écran).
5. **[mineur]** Grille 2, `v2/contrats/pile/affichage.test.js:46` — Le sélecteur `.mantine-Switch-track` dépend d'un nom de classe interne de Mantine (préfixe `mantine-` non garanti stable entre versions). C'est un test (autorisé à tout importer), mais un changement de Mantine cassera silencieusement la détection. Proposer un sélecteur sur `role="switch"` ou une note dans le contrat de montée de version.
6. **[mineur]** Grille 7, `v2/contrats/pile/relecture.test.js:143-164` — Le test ne couvre que le cas de l'éditrice ; le comportement annoncé pour le correcteur (« toujours en suivi, pas d'interrupteur », `v2/application/client/App.jsx:816-818`) n'est pas vérifié (absence de l'interrupteur pour un correcteur). Proposer une assertion courte dans un test existant de relecture.

## Points de grille sans remarque
1 (couches respectées : logique en application, Switch Mantine en design sans prop de style), 3, 4, 5, 8, 9 (clés ajoutées dans fr et en, pas de texte en dur), 10.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides

## Réponse de Claude

- **1 : juste.** Inscrit dans la veille (`docs/v2-veille.md`, « à examiner », avec le cas minimal) et dans les limites de la revue de clôture.
- **2 : juste en partie.** Le test couvre ce qui marche ; le défaut est suivi dans la veille, où il sera examiné avec un test dédié.
- **3 : faux.** Le menu de la ligne 1063 est celui du format S (branche à part, qui rend `PageEditionS`) ; celui de la ligne 957 ne prend l'entrée qu'en M (`etroit`), et le bandeau ne la montre qu'en L (`!etroit`) : jamais deux fois.
- **4 : sans suite.** Le flux des commentaires et la collaboration tiennent le réseau ouvert : aucun état « au repos » n'existe ; la pause est courte et le test vérifie un écran déjà rendu.
- **5 : faux.** `mantine-Switch-track` est un nom de classe statique documenté de l'API de styles de Mantine, stable entre versions mineures.
- **6 : juste.** Vérifié : un correcteur n'a pas d'interrupteur (`relecture.test.js`, premier test).

## Arbitrage de Sylvain

(À compléter.)
