# amend.ink

Édition collaborative de texte en temps réel, avec **suivi des modifications**
(comme Word ou Google Docs), commentaires, notes de bas de page, exports (PDF,
Word, Markdown, page web) et **Margo**, une assistance IA dont les propositions
arrivent en suivi de modifications — à accepter ou refuser comme celles d'une
personne. Auto-hébergé, pensé pour tenir sur un petit serveur (1 vCPU, 1 Go).

Le nom de l'application est « amend.ink », partout où une personne peut le lire.

## Ce que fait l'application

- **Écriture à plusieurs** en temps réel (Yjs, ProseMirror), présence et
  curseurs distants.
- **Suivi des modifications** : insertions et suppressions attribuées, panneau
  d'acceptation et de refus, un ou tous à la fois.
- **Commentaires** ancrés dans le texte, avec réponses ; **notes de bas de
  page** ; tableaux, listes, cases à cocher, images.
- **Rôles par document** : propriétaire, éditeur, correcteur (propose mais ne
  décide pas), lecteur. Invitations par adresse, connexion par lien magique
  (courriel Mailgun).
- **Margo (IA)**, deux surfaces aux réglages séparés : la barre latérale
  « Demander à Margo » (suggestions de reformulation, Haiku 5.5 par défaut) et
  la fenêtre flottante « Margo » (dialogue avec outils de lecture et de
  proposition, Sonnet 5.5 par défaut). Une troisième voie : inviter Claude sur
  un document par un connecteur MCP (`tools/inviter-claude.js`).
- **Exports** : PDF (source Typst composée côté navigateur, compilée sur le
  serveur), Word, Markdown, et pages web publiées.
- **Versions** automatiques avant chaque compactage, page de consultation.
- **Back-office** pour les administrateurs : usage, courriels, sauvegardes,
  consommation de Margo en tokens.

## Architecture

```
server/    Node.js, un seul processus. Dépendances : yjs et y-protocols.
           server.js      HTTP, API REST, routage WebSocket (point d'entrée)
           ws.js          WebSocket (RFC 6455) maison
           rooms.js       salles : relais des mises à jour et de la présence
           replique.js    une copie Yjs en mémoire par document ouvert
           storage.js     persistance en fichiers (registre JSON + journaux binaires)
           auth.js, sessions.js, roles.js, users.js    comptes, sessions, droits
           ai.js, dialogue.js, mcp.js, agents.js       Margo, connecteur MCP
           typst.js       export PDF (sous-processus Typst, plafonds mémoire et durée)
           publication.js, uploads.js, versions.js, admin.js, metrics.js, archive.js
client/    Vite + ProseMirror + y-prosemirror (editor.js assemble l'éditeur)
shared/    Code importé par le serveur ET le client : protocole, style, liens, sécurité
tools/     Outils de test et d'exploitation (charge, corpus, sonde, lanceur de tests)
deploy/    Fichiers de mise en production (systemd, Caddy, sauvegardes, deploy.sh)
```

Le serveur tient une **réplique** de chaque document ouvert (libérée quelques
minutes après le dernier départ) : il vérifie les droits, rejoue les mises à
jour et sait dire ce qui manque à un client qui se reconnecte. Pas de base de
données : les données vivent dans `DATA_DIR` (`docs.json`, un `.log` par
document, comptes, accès, images, pages publiées).

## Installation et lancement

Prérequis : **Node.js ≥ 22.22**.

```bash
npm ci                    # dépendances du serveur
npm run build:client      # compile le client (une fois, puis à chaque mise à jour)
cp .env.example .env      # puis renseigner au moins ANTHROPIC_API_KEY pour l'IA
npm start                 # http://localhost:8787
```

Toute la configuration est dans `.env` (modèle de chaque surface de Margo,
plafonds, Mailgun, `SESSION_SECRET`, administrateurs…) : `.env.example` la
documente ligne par ligne. Sans clé Anthropic, l'édition fonctionne et les
fonctions IA répondent par une erreur claire. Le PDF demande le binaire
`typst` sur la machine ; sans lui, l'export répond 501.

## Tests et qualité

```bash
npm test               # serveur puis client (un processus par fichier, délai par fichier)
npm run test:server
npm run test:client
npm run lint           # ESLint : variables non définies ou inutilisées, code mort
npm run format:check   # Prettier (appliqué au code, vérifié par la CI)
```

La CI (`.github/workflows/tests.yml`) rejoue lint, format, tests et compilation à chaque
envoi, vérifie que le serveur démarre avec les seules dépendances de production et que les
scripts shell de `deploy/` sont sains ; chaque lundi elle audite les dépendances.
Un test (`server/test/env-documentee.test.js`) échoue si une variable d'environnement du code
n'est pas décrite dans `.env.example`, ou l'inverse.

Une revue du code par un autre modèle (Mistral Large 4) se lance à la main :
`MISTRAL_API_KEY=… node tools/revue-mistral.mjs --tout` la première fois, puis sans option
(ce qui a changé depuis la dernière revue) ; elle écrit `revue-AAAA-MM-JJ.md`, ignoré par git.

`tools/lancer-tests.mjs` remplace `node --test dossier/*` : il compte les tests
par événements, tue un fichier qui ne se termine pas et échoue si un fichier
manque. Options : `--motif texte`, `--lot 2/4`, `--lent 20`.
La charge et la tenue en production se testent avec `tools/loadtest.js`,
`tools/salle-chaude.mjs`, `tools/export-pdf.mjs` et la sonde `tools/observer.js`
(protocole : `claude/protocole-test-global.md` dans le projet Claude « Amend »).

## Mise en production

La production tourne sous **systemd** derrière Caddy sur un VPS Debian
(`/opt/amend/app`, données dans `/opt/amend/data`). Mise à jour :

```bash
cd /opt/amend/app && ./deploy/deploy.sh      # --restart pour forcer un redémarrage
```

Détails, sauvegardes (NAS et Proton Drive), polices Typst et invitation de
Claude : `deploy/README.md` et `deploy/SAUVEGARDE.md`.

Pas de Docker (décision du 15/10/2026) : la production est sous systemd, et une
image aurait été un troisième environnement (Node, Typst, polices) à tenir
identique aux deux autres. Pour essayer l'application sans compte Mailgun ni
clé d'IA : `node tools/instance-test.js` lance une instance jetable avec de
faux services.

## Documentation de conception

L'historique des décisions, des études et des rapports d'essai vit dans le
projet Claude « Amend » (documents `claude/…`) : feuille de route, audit
technique, protocole de test, journaux de campagne, conception de chaque
chantier. Ce dépôt ne garde que ce qui sert à lancer, tester et déployer.
L'ancien README détaillé (jusqu'au 13/09/2026) reste dans l'historique git.
