# Audit partiel avant fusion (2026-11-08)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 100715 signes envoyés, 3128 reçus (et 11766 de réflexion) ; réflexion `low` ; 18 s ; arrêt : stop
- Diff audité : `v2/` de `8644c6a` à `9e88da4` (32 fichiers)
- Statut : avis reçu ; réponse de Claude écrite ; arbitré par Sylvain le 08/11/2026 (fusion).

## Avis de l'auditeur

## Synthèse
Diff de consolidation post-audit : fermeture de pannes (droits en échec, secret absent, erreurs 500), durcissement lint et systemd, tests de frontières du graphe. L'ensemble respecte les couches et les ADR ; je ne vois ni fondation importée hors adaptateur, ni texte en dur, ni valeur de design inventée. Les constats portent sur un sentinelle fragile côté client, deux points du gestionnaire d'erreurs du serveur que le diff laisse incertains, et une redondance de test.

## Constats
1. **[mineur]** Grille 6 (correction) — `v2/application/client/App.jsx:77`. En cas d'adresse illisible, on passe `'%'` à `identifiantDocument` en comptant sur le fait que le domaine refuse ce caractère : le couplage est implicite et silencieux (si le domaine acceptait un jour `%`, l'erreur disparaîtrait sans trace). Proposer un état d'erreur explicite (`{ phase: 'erreur', code: 'adresse-invalide' }`) ou une fonction du domaine « adresse lisible ? », plutôt qu'un sentinelle commenté.
2. **[question]** Grille 6 — `v2/i18n/index.js:69`. `messageErreur` appelle `chercher(…)`, qui n'apparaît nulle part dans le diff ; s'il n'existe pas déjà dans les lignes non montrées du fichier, c'est une `ReferenceError` à la première erreur. À vérifier (les tests verts le laissent penser, mais le diff ne le montre pas).
3. **[question]** Grille 6 — `v2/application/serveur/index.js:185`. Le gestionnaire d'erreurs journalise `url.pathname` ; si l'erreur vient du décodage de l'URL elle-même (`new URL` lancé dans le `try`), `url` est indéfini et le gestionnaire plante à son tour. À vérifier sur le code complet ; si c'est le cas, journaliser `req.url` plutôt que `url.pathname`.
4. **[mineur]** Grille 6 — `v2/application/serveur/index.js:182-186`. Toute erreur portant un `code` autre que `requete-trop-grosse` / `requete-invalide` devient désormais un 500 `erreur-interne`. Si une route lance une erreur de domaine avec son code (contrôle de saisie, session…), elle changerait de statut et perdrait son code côté client. Vérifier qu'aucune route ne lance d'erreur codée attendue en 4xx ; sinon, lister explicitement les codes clients.
5. **[mineur]** Grille 6 — `v2/application/collab/index.js:40-44`. `process.exit(0)` dans le `finally` masque un échec de `collab.fermer()` : arrêt « propre » même si la persistance y/hub n'a pas fini. Proposer de sortir avec un code non nul (et journaliser) quand `fermer` échoue.
6. **[mineur]** Grille 7 — `v2/tests/unitaires/i18n.test.js:66-70` et `:72-75`. Deux tests couvrent désormais `messageErreur` avec les mêmes assertions (message dédié / message générique avec le code) : le second ajoute le cas `reseau`, mais le premier est redondant. Fusionner en un seul test.
7. **[question]** Grille 10 (licences) — `v2/package.json:36`. Nouvelle dépendance de développement `knip` ; sa licence n'est pas visible dans le diff. Le contrat `contrats/statiques/licences.test.js` la couvre a priori, mais confirmer qu'elle y figure et qu'elle est compatible (ADR 0006).

## Points de grille sans remarque
1, 2, 3, 4 (hors test redondant, point 6), 5 (fermeture des droits côté serveur, correcte), 8, 9.

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

- **1 : juste, corrigé.** L'adresse illisible porte désormais son code explicitement, sans passer un `%` au domaine.
- **2 : faux.** `chercher` est défini plus haut dans `i18n/index.js` (l. 23).
- **3 : juste, et plus grave qu'annoncé, corrigé.** L'analyse de l'adresse était hors du bloc protégé : une requête au chemin `//` laissait la requête sans réponse et, sous Node 24, un rejet non traité peut arrêter le processus. Test ajouté (« une adresse de requête illisible ») : 400, et le serveur répond toujours ; le journal utilise l'adresse brute.
- **4 : faux.** Aucune route ne lance d'erreur à code en dehors de la lecture du corps (`requete-trop-grosse`, `requete-invalide`) ; les codes du domaine sont rendus, pas lancés.
- **5 : juste, corrigé.** Un arrêt incomplet sort avec un code non nul et une trace.
- **6 : juste, corrigé.** Test en double retiré.
- **7 : faux.** knip est sous licence ISC, admise ; le contrat des licences est vert.

Bilan : 7 constats, 4 justes (dont un défaut réel du serveur), 3 faux.

## Arbitrage de Sylvain

08/11/2026 : fusion dans `main`.
