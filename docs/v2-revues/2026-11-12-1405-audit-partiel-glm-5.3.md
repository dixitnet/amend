# Audit partiel avant fusion (2026-11-12)

- Auditeur : Scaleway, modèle `glm-5.3` ; consommation : 224206 signes envoyés, 3397 reçus (et 13422 de réflexion) ; réflexion `low` ; 66 s ; arrêt : stop
- Diff audité : `v2/` de `origin/` à `d5c9b2b` (15 fichiers)
- Statut : avis reçu ; réponse de Claude à écrire ; arbitrage de Sylvain à venir.

## Avis de l'auditeur

## Synthèse
Le lot ajoute un serveur MCP (connecteur Claude) au back-office, en réutilisant les outils de Margo avec un auteur « claude » : le découpage est propre, les droits sont revérifiés à chaque requête côté serveur, les couches et l'i18n sont respectés, pas de dépendance nouvelle. Les faiblesses tiennent à la robustesse du protocole : une erreur d'outil inattendue traverse le traitement sans réponse JSON-RPC, et une méthode HTTP imprévue sur la route d'administration désactive l'adresse par effet de bord. Deux points à vérifier (champ `niveau` des titres, helper `date`) et quelques tests manquants.

## Constats
1. **[important]** Grille 6 (correction), `v2/application/serveur/connecteur.js:211`, `v2/application/serveur/connecteur.js:244`, `v2/application/serveur/connecteur.js:267` — `appeler` relance les erreurs non prévues, `message` n'a pas de `try/catch` autour de `tools/call`, et le `Promise.all` du lot rejette alors en bloc : aucune réponse JSON-RPC n'est rendue (ni erreur -32603), et toutes les réponses du lot sont perdues. Encadrer l'exécution d'un outil pour rendre une erreur JSON-RPC interne, appel par appel.
2. **[mineur]** Grille 6 (correction), `v2/application/serveur/connecteur.js:144`, `v2/application/serveur/connecteur.js:150` — la suppression de l'ancienne entrée (ligne 144) a lieu avant le refus des méthodes non gérées (ligne 150) : une requête `PUT` sur `/api/admin/connecteur` efface l'entrée de l'adresse active puis reçoit 405, désactivant le connecteur sans le vouloir. Vérifier la méthode avant toute écriture.
3. **[question]** Grille 6 (correction), `v2/application/serveur/connecteur.js:191` — l'indentation du plan lit `b.niveau`, mais le niveau d'un bloc `heading` de BlockNote vit dans `props.level` ; je ne peux pas vérifier que `numeroter` ajoute un champ `niveau`. À confirmer, sinon le retrait des titres est toujours nul.
4. **[question]** Grille 9 (traductions), `v2/application/client/Administration.jsx:242` — `date.format(connecteur.creeLe)` alors qu'aucun import ni définition de `date` n'apparaît dans les lignes visibles (1-8) ; vérifier qu'il existe dans le fichier et qu'il passe par `Intl` (règle 26).
5. **[question]** Grille 5 (sécurité et droits), `v2/application/serveur/connecteur.js:265` — chaque `lire` est borné en signes, mais un lot JSON-RPC peut contenir un nombre quelconque d'appels d'outils exécutés en parallèle, sans limite cumulative : les « limites en signes » de l'étape 8 ne s'appliquent pas au connecteur. À poser comme question de produit (borne par lot ?) plutôt que défaut, le plan (`docs/v2-connecteur-plan.md`) n'étant pas fourni.
6. **[mineur]** Grille 7 (tests), `v2/tests/services/connecteur.test.js:113` — le test couvre le parcours principal, mais pas le lot JSON-RPC (plusieurs messages, notifications mélangées), ni le cas d'une méthode imprévue sur `/api/admin/connecteur` (constat 2), ni le comportement quand un outil échoue inopinément (constat 1). Ajouter ces cas.
7. **[question]** Grille 5 (sécurité), `v2/application/serveur/connecteur.js:259` — le secret voyage dans le chemin de l'URL : il apparaîtra dans les journaux d'accès (Caddy, journaux Node). C'est un choix assumé repris de la v1 (« comme un lien de partage ») ; vérifier seulement que les journaux d'accès de production ne le consignent pas, ou l'assumer dans le plan.

## Points de grille sans remarque
1, 2, 3, 4, 8, 10

## Citations vérifiées par le script

- 1 : citations valides
- 2 : citations valides
- 3 : citations valides
- 4 : citations valides
- 5 : citations valides
- 6 : citations valides
- 7 : citations valides

## Réponse de Claude

1. *Juste*, corrigé : la panne d'un outil rend une erreur JSON-RPC `-32603` à cet appel, avec une trace au journal.
2. *Juste*, corrigé : la méthode est vérifiée avant toute écriture ; un `PUT` reçoit 405 sans toucher à l'adresse active (test).
3. *Faux* : `blocsATexteDe` rend `niveau` pour un titre (Margo s'en sert déjà, `pourMargo`) ; le test vérifie le plan (« [1] Chapitre premier »).
4. *Faux* : `date` est un `Intl.DateTimeFormat` défini plus haut dans `Administration.jsx`.
5. *Juste*, réglé autrement : les lots ont été retirés du protocole MCP (version 2025-06-18) et `lireCorps` refuse un tableau ; un message par requête, chaque lecture bornée en signes comme pour Margo (test : un tableau reçoit 400).
6. *Juste*, corrigé : tests ajoutés (tableau refusé, méthode imprévue sans effet).
7. *Juste*, corrigé : le journal du back-office masquait le secret des liens de connexion, pas celui du connecteur ; `adresseSansSecret` masque aussi `/api/mcp/<secret>` (test). Caddy ne tient pas de journal d'accès (pas de directive `log` dans `Caddyfile.v2`).

## Arbitrage de Sylvain

(À compléter.)
