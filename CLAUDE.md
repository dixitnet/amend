# amend.ink — notes pour Claude Code

Éditeur de texte collaboratif auto-hébergé, publié par dixit.net SAS (Nantes). Public visé : auteurs et éditeurs (essais, romans, puis édition scientifique). **Objectif général : produire les documents les plus propres possibles à l'export** (accents précomposés NFC, pas de remplacements parasites, typographie française correcte).

Le propriétaire du projet est Sylvain Grisot (sylvain.grisot@dixit.net). On travaille en **français**.

## Règles permanentes (à appliquer sans qu'il les redemande)

1. **Nom** : toujours « amend.ink », jamais « Amend » — partout, y compris dans les textes vus par les utilisateurs, les courriers, les pages publiées et la documentation.
2. **Échanger avant de développer.** On discute, on propose, et on ne lance un développement que sur demande explicite. Clarifier un besoin n'est pas un feu vert.
3. **Propositions numérotées** (listes d'options, de développements) pour qu'il réponde par les numéros.
4. **Ne pas alourdir l'application** avec des fonctions trop spécifiques à un usage marginal. Le signaler soi-même, et insister, quand une idée relève de ce cas.
5. **Limites et consommation d'IA : toujours en signes, espaces compris** — jamais en pages, feuillets ou autre unité (interface, messages d'erreur, back-office, docs).
6. **Tarifs et seuils** : ne pas fixer de seuils ni calculer de montants en euros sur des hypothèses d'usage non vérifiées. Règles simples et lisibles d'abord ; les seuils se déterminent ensuite sur les journaux réels.
7. **Claude développe sur une branche de travail** : celle que la session Claude Code dans le cloud lui impose (`claude/…`), jamais sur `main`. Il commite (messages en français) et pousse sur cette branche, après `npm run format:check`, `npm run lint` et `npm test` au vert. Il ne fusionne dans `main` et ne pousse `main` **qu'avec l'accord explicite de Sylvain**, donné pour ce lot. Jamais de poussée forcée, de `reset` ni de réécriture de l'historique de `main`.
8. **Claude n'agit pas sur le VPS de production** (pas de `ssh`) et ne déploie pas. Il donne les commandes à coller, en précisant si le bloc est pour **le terminal du Mac** ou pour **le VPS (SSH)**. Tout bloc destiné au Mac commence par `cd ~/Documents/collabtext-test/collabtext`. Le Mac ne sert plus au développement, seulement à des tests de préproduction ponctuels et au déploiement.
9. **À la fin de chaque lot de développement**, sans qu'il ait à le demander : dire ce qui a été commité et poussé sur la branche de travail, donner le bloc Mac de **préproduction** (récupérer la branche et la tester), demander l'accord de fusion dans `main` **par un bouton** (question à choix, « Fusionner » / « Pas encore »), jamais au détour d'un paragraphe ; puis, une fois fusionné : **le VPS se déploie seul** dans les 3 minutes (`deploy/auto/`, minuteur `amend-maj`, v1 puis v2, redémarrage si un `.env` a changé) ; Claude vérifie la mise en ligne lui-même (`version` de `https://v2.amend.ink/api/config` = commit de `main`) et le dit. Rien à faire pour Sylvain ; en secours seulement, `./deploy/deployer.sh` depuis le Mac. Toute nouvelle étape à faire sur le VPS s'ajoute à ces scripts plutôt qu'à un bloc séparé (Sylvain, 09/11/2026).
10. Peu d'emojis dans les messages.
11. **Regarder d'abord Docs.** Avant tout développement (interface, comportement de l'éditeur, téléphone compris), regarder comment procède Docs, l'éditeur de l'État français (La Suite numérique, https://github.com/suitenumerique/docs, construit lui aussi sur BlockNote), dans son code ou à l'usage, et dire ce qu'on a trouvé avant de proposer. On s'en écarte seulement sur décision de Sylvain, notée dans `docs/journal-decisions.md`.

## Dépôt et environnements

- Dépôt : remote `git@github.com:dixitnet/amend.git` (privé). Branches : `main` (production) et une branche de travail `claude/…` par session de Claude (supprimée une fois fusionnée). Copie sur le Mac : `~/Documents/collabtext-test/collabtext` (préproduction et déploiement, pas de développement).
- Préproduction sur le Mac : serveur tenu par le LaunchAgent `net.dixit.collabtext` (relance : `launchctl kickstart -k gui/$(id -u)/net.dixit.collabtext`). Le serveur sert `client/dist` depuis le disque : un rebuild du client prend effet sans redémarrage ; un changement dans `server/` ou `.env` demande un redémarrage.
- Prod : VPS Gandi V-R1 (1 vCPU, 1 Go RAM + 2 Go swap), Debian 13, Node 24, Caddy, service systemd `amend` (MemoryMax 700M), code dans `/opt/amend/app`, données dans `/opt/amend/data`. Site public : https://www.amend.ink.
- `.env` (jamais commité) : `PORT`, `DATA_DIR`, `SESSION_SECRET`, `ADMIN_EMAILS`, `APP_BASE_URL`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN` (zone EU), `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY` (optionnel), `SCALEWAY_API_KEY` (optionnel), `CORRECTEUR_ETANCHE`. Ne jamais afficher ni copier ces valeurs.
- Sauvegardes : le NAS tire `data/` du VPS chaque nuit, puis envoi vers Proton Drive.

## Livrer

- Commandes npm (racine) : `npm test` (= `test:server` puis `test:client`, via `tools/lancer-tests.mjs`), `npm run lint` (eslint), `npm run format:check` (prettier sur server, shared, client/src, tools), `npm run build:client`, `npm run format` (prettier --write sur les fichiers donnés).
- Cycle d'un lot :
  1. Claude développe sur sa branche de travail, lance les contrôles, commite (y compris `CLAUDE.md`, `docs/`, `.claude/` quand ils changent) et pousse cette branche. Avant de commiter, vérifier qu'aucun fichier de secrets (`.env`, `*.key`, `*.pem`…) n'est indexé.
  2. Préproduction (facultative, sur le Mac) : bloc donné par Claude, du type
     `git fetch origin && git checkout <branche de travail> && git pull --ff-only && npm ci && (cd client && npm ci && npm run build)`, puis `launchctl kickstart -k gui/$(id -u)/net.dixit.collabtext` si `server/`, `shared/` ou `package*.json` ont changé. Retour : `git checkout main && git pull --ff-only`.
  3. Fusion, sur accord explicite de Sylvain : Claude met sa branche à jour avec `main` si besoin, relance les contrôles, puis `git checkout main && git pull --ff-only origin main && git merge --no-ff <branche de travail> && git push origin main`, et revient sur sa branche.
  4. Déploiement : **automatique** dans les 3 minutes qui suivent la fusion (`deploy/auto/maj.sh`, journal : `journalctl -u amend-maj`) ; Claude vérifie la version en ligne. En secours, par Sylvain depuis le Mac : `./deploy/deployer.sh` (fetch, affiche le commit de `origin/main`, confirmation, puis `deploy/deploy.sh` sur le VPS en SSH et fin du journal). `--restart` force le redémarrage (changement du `.env`). Variable `AMEND_SSH` pour la cible (défaut `amend@92.243.27.71`).
- Déploiement manuel sur le VPS (hors deployer.sh) : `git pull`, `npm ci --omit=dev` à la racine (le serveur dépend de `yjs` et `y-protocols`), `cd client && npm ci && npm run build`, puis `sudo systemctl restart amend` seulement si `server/` ou `.env` a changé.
- Avant tout commit, et avant de conclure qu'un lot est prêt : `npm run format:check`, `npm run lint`, `npm test`.
- `client/src/style.css` ne passe pas `prettier --check` (déjà le cas, hors périmètre du contrôle).
- Test serveur connu : « clé API absente → 501 » échoue sur le Mac car le vrai `.env` est rechargé ; il passe sans `.env`.
- `_a_supprimer/` et `revue-*.md` sont ignorés par git ; `mac-launchagent/`, `data/`, `.env` aussi.

## Tester la production (compte de test de Claude)

- L'environnement cloud de Claude autorise `www.amend.ink` : `curl` (en-têtes, compression, cache, version servie) et Chromium (Playwright) y ont accès.
- **Compte de test** : un compte ordinaire, **jamais dans `ADMIN_EMAILS`**. Son cookie de session est dans le secret d'environnement `AMEND_PROD_COOKIE` (30 jours). Ne jamais afficher, copier ni écrire ce cookie. Le serveur ne lui ouvre que ses propres documents et ceux qu'on lui partage : c'est la frontière, il n'y en a pas d'autre (les dossiers ne sont qu'un rangement personnel).
- Outils : `node tools/prod.mjs verifier | documents | creer "titre"` ; en module, `tools/prod.mjs` fournit `api`, `creerDocumentTest`, `contexteProd` (Chromium connecté avec le compte), `deposerEtat`. Ouverture réelle mesurée : `node tools/banc-ouverture.mjs --base=https://www.amend.ink [--profils=vide,livre] [--docs=…]` (corpus créé une fois au nom du compte, puis réutilisé). Les deux refusent un cookie d'administrateur et se relancent seuls avec `NODE_USE_ENV_PROXY=1` derrière un proxy.
- Règles pour Claude avec ce compte :
  1. n'agir que sur les documents du compte de test (créés par lui) ou partagés avec lui pour un test ;
  2. tout document créé s'intitule « TEST — … » (`creerDocumentTest` l'impose) ;
  3. aucune invitation vers une adresse réelle (elle enverrait un vrai courrier), aucune publication de page ;
  4. l'IA (Margo, corrections) seulement quand le test l'exige : elle coûte réellement ;
  5. jamais de suppression du compte, ni de « déconnecter partout » (le cookie deviendrait inutilisable) ;
  6. aucune autre action sur la production : pas de `ssh`, pas de compte administrateur.
- Un refus « cookie refusé » ou 401/403 veut dire qu'il faut renouveler le cookie (Sylvain : fenêtre privée connectée avec le compte de test, outils de développement → Application → Cookies → `collabtext_session`, puis réglages de l'environnement ; fermer la fenêtre sans se déconnecter).

## Tester la v2 en ligne (comptes d'essai de Claude)

- `https://v2.amend.ink` est derrière le mot de passe de Caddy ; le proxy de l'environnement l'ajoute seul.
- Depuis le 09/11/2026, il n'y a plus d'entrée par un simple nom (`V2_DEV` retiré). Claude entre par `POST /api/essai/session { nom }` : la clé d'essai (`X-Amend-Essai-Token`) est ajoutée par le proxy, et Claude ne la voit jamais. Cette route n'ouvre que des comptes en `@essai.amend.invalid` (« TEST Claude A », « TEST Claude B »…), qui ne reçoivent jamais de courrier.
- Pour mettre un compte d'essai dans une équipe ou partager avec lui, on utilise son adresse en `@essai.amend.invalid`. Jamais d'invitation vers une vraie adresse.
- Claude nettoie ce qu'il crée.
- WebSocket : bloqués par le proxy, donc pas d'essai d'écriture en direct en ligne.

## Architecture (repères)

- `client/` : Vite + ProseMirror + Yjs (y-prosemirror). `client/src/` : schéma (`schema.js`), suivi des modifications (`trackChanges.js`, marques `ins.tracked-insertion` / `del.tracked-deletion`), barre d'outils (`barreOutils.js`), exports (`exportVariante.js`, `exportCommun.js`, `typstExport.js`, `docxExport.js`, `publicationExport.js`), typographie (`typographie.js`).
- `server/` : Node, HTTP + WebSocket maison. `storage.js` (documents, accès, `roleFor`), `roles.js` (rôles éditeur / correcteur / lecteur → **capacités** ; toute évolution des droits se fait là), `replique.js` (réplique Yjs par document ouvert, compactage côté serveur), `auth.js` + `mailgun.js` (lien magique, invitations nominatives), `typst.js` + `routes/export.js` (PDF), `publication.js` (page publiée), `admin.js` + `metrics.js` (back-office `#/admin`, journaux `data/events-*.jsonl`), `garde-fous.js` (limites IA).
- `shared/` : code commun client/serveur — `diff.js` (corrections de l'IA), `propre.js` (`nfc`).
- `tools/` : scripts (banc de charge, `nettoyer-images.mjs`…). `deploy/` : livraison.
- IA : « Margo (IA) » dans l'application ; le connecteur « Inviter Claude » s'affiche « Claude (pour <prénom>) ». Fournisseurs Anthropic (et Mistral, Scaleway en option). Voir `docs/journal-decisions.md` pour les modèles.

## v2 (reconstruction en cours)

- Décision du 07/11/2026 : reconstruire amend.ink sur BlockNote (éditeur) + y/hub (collaboration) + notre serveur Node (comptes, droits, IA, exports, publication). Études : `docs/etude-docs-blocknote-yhub-2026-11-07.md` et les deux précédentes du même jour.
- **Règles de développement : `docs/v2-regles-developpement.md`. À lire avant tout travail sur la v2.** En résumé :
  1. Couches : plateforme, fondations (Yjs 14, `@y/prosemirror`, ProseMirror, BlockNote, y/hub, Typst : on n'y développe jamais), adaptateurs (une façade par fondation), extensions (points d'extension publics), domaine (JS pur, sans dépendance), application technique, design, exploitation.
  - **Séparation stricte design / technique** : composants de présentation (`v2/design/`, apparence seule, aucun appel ni règle) et composants techniques (état, appels, règles, aucun style) ; **Mantine est la source du design** (seule décision de Sylvain à ce jour) : aucune valeur ni aucun réglage de design inventé par Claude, Mantine et BlockNote tels quels ; tout réglage est une décision de Sylvain, inscrite dans `v2/design/reglages.js` et l'ADR 0008 (contrat statique) ; aucun élément de design hors de `v2/design/` (lint) ; un lot de design ne touche que `v2/design/`, un lot technique n'y touche jamais.
  - **Formats d'écran** : L (Mac) et M (iPad) seulement ; le format S (iPhone) viendra plus tard, par un développement spécifique aux compromis forts. Ne pas concevoir ni tester pour lui d'ici là. Sa maquette validée (09/11/2026) : `docs/v2-format-S.md`.
  - **Traductions anticipées** : aucun texte destiné à une personne en dur (interface, erreurs, courriers, exports, consignes de Margo) ; clés dans `v2/i18n/`, français source, anglais préparé ; le domaine et le serveur rendent des codes, pas des phrases ; pluriels et paramètres nommés, `Intl` pour dates et nombres ; ne pas confondre langue de l'interface et langue du document (qui règle typographie, exports, Margo).
  2. Une fondation n'est importée que par son adaptateur, et seulement par son API publique. Le domaine ne dépend de rien. Frontières vérifiées par le lint.
  3. Un lot = une couche (plus l'adaptateur concerné). Ordre de préférence : renoncer, configurer, étendre, coder chez nous, et seulement en dernier recours corriger une fondation.
  4. Renoncer plutôt que contourner : registre `docs/v2-renoncements.md`. Veille de l'amont : `docs/v2-veille.md`. Décisions : `v2/adr/`.
  5. Pas de migration des documents de la v1.
  6. **Avant de proposer un développement ou un correctif**, vérifier et écrire : **comment Docs le fait-il ?** (« inspire-toi systématiquement de Docs », Sylvain, 08/11/2026 : lire son code, `suitenumerique/docs`, qui est sur BlockNote et y/hub ; reprendre son montage par défaut, justifier et signaler tout écart) ; le besoin est-il établi (reproduit, mesuré, décision de produit prise) ? est-ce un défaut de notre code, le comportement voulu d'une fondation, un défaut amont ou une question de produit ? est-ce le bon moment (étape du plan) ? quel est le niveau le plus bas qui règle la cause ? une règle bloque-t-elle la bonne solution (alors proposer de la réviser, ne pas la contourner) ? quelles conséquences à terme ? Sobriété : le plus petit changement au bon niveau, pas de développement spécifique sur un besoin non stabilisé. Sinon : une question ou une note dans le plan d'une étape, pas un lot.
- Code dans `v2/` (ce dépôt), sous AGPL-3.0. La v1 et la v2 ne s'importent pas l'une l'autre.
- Relecture par une autre IA (Mistral, clé dédiée) **aux étapes** de la reconstruction (ouverture et clôture), pas à chaque lot ; réponses point par point dans `docs/v2-revues/`, Sylvain arbitre. **Mistral remplacé par une IA de Scaleway le 08/11/2026** (Sylvain) : audit partiel du diff avant chaque fusion dans `main` (lancé par Claude dans sa session, avant la demande d'accord ; constats vérifiés et répondus dans `docs/v2-revues/`) ; audit complet selon les règles de l'art, moins fréquent (`docs/v2-audits/`) ; règles de la v2, § 6.
- Connexion par lien magique (pas d'OIDC). Développement et essais dans l'environnement en nuage de Claude (Valkey, PostgreSQL) ; pas de préproduction sur le Mac.
- Commandes de la v2 (dans `v2/`, Node 24 : `export PATH=/opt/node24/bin:$PATH`) : `npm run lint`, `npm run format:check`, `npm test` avant tout commit qui touche `v2/` ; `npm run test:pile` (pile complète, Chromium) et `npm run mesurer` aux étapes ; `npm run dev` pour lancer. Voir `v2/LISEZMOI.md`. Audit partiel avant fusion : `node tools/audit-ia.mjs --modele=glm-5.3 [--depuis=<commit>]` (depuis la racine ; clé injectée par le proxy pour `api.scaleway.ai`) ; avis et réponse dans `docs/v2-revues/`.
- La v1 reste en production sous ses propres règles jusqu'à la bascule.

## Pièges techniques déjà rencontrés

- **Exports propres** : tout texte exporté passe par `nfc()` (`shared/propre.js`). Point d'entrée unique des exports md/docx/pdf : `documentPourExport(doc, mode)`. La publication passe par `docPourPublication`. Le serveur a des filets de sécurité (Typst, publication).
- **Diff des corrections IA** (`shared/diff.js`) : diff de mots (LCS) plus raffinement caractère limité à 3 caractères modifiés. `memeJeton` traite comme identiques deux jetons égaux en NFC, et une espace insécable remplacée par une espace simple (jamais l'inverse : les corrections typographiques restent proposées).
- **CSS** : `container-type: inline-size` crée un confinement de mise en page, donc un enfant `position: fixed` y est contenu et rogné. Les menus qui doivent déborder utilisent `popover="manual"` (couche supérieure) — voir le menu « Insérer ▾ ».
- **PDF Typst** : le client construit la source ; le serveur écrit `main.typ` et `images/` dans un dossier temporaire (`--root`). Les images d'un autre document sont référencées `images/<autreId>/<nom>` et ne sont déposées que si la personne peut lire ce document (`imagesDuRendu`).
- **Images** : URL `/api/docs/<docId>/images/<nom>`, accès contrôlé par `storage.roleFor`. Le nettoyage des images orphelines est par document.
- **Tests de collage ProseMirror** : poser la sélection DOM, déclencher `selectionchange`, attendre (~400 ms) avant le collage — ProseMirror synchronise la sélection de façon asynchrone.
- **Marks** `insertion` / `deletion` / `authorColor` : pas de `parseDOM` (sinon RangeError au collage d'un contenu contenant ces marques).
- **Métriques IA** : toujours en signes ; ne pas introduire d'autre unité.

## Documentation

- `docs/journal-decisions.md` : décisions et état d'avancement.
- Les études, conceptions, rapports de tests et guides vivent dans le Projet claude.ai « Amend » (Cowork). Les copier dans `docs/` au besoin ; ne pas les recréer de mémoire.
- Aide utilisateur : document « Aide amend.ink » hébergé dans amend.ink lui-même (édité via Chrome). La page d'aide publique n'est republiée que sur feu vert explicite.
