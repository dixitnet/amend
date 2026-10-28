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
7. **Claude ne commit jamais et ne pousse jamais.** Sylvain livre lui-même avec `./deploy/livrer.sh "message"`. Claude propose le message de commit.
8. **Claude n'agit pas sur le VPS de production** (pas de `ssh`). Il donne les commandes à coller, en précisant si le bloc est pour **le terminal du Mac** ou pour **le VPS (SSH)**. Tout bloc destiné au Mac commence par `cd ~/Documents/collabtext-test/collabtext`.
9. **À la fin de chaque lot de développement**, donner le bloc de livraison complet (livrer.sh avec un message, puis, si besoin, la partie VPS séparée) sans qu'il ait à le demander.
10. Peu d'emojis dans les messages.

## Dépôt et environnements

- Dépôt : `~/Documents/collabtext-test/collabtext` (Mac, dev) ; remote `git@github.com:dixitnet/amend.git` (privé).
- Dev : serveur tenu par le LaunchAgent `net.dixit.collabtext` (relance : `launchctl kickstart -k gui/$(id -u)/net.dixit.collabtext`). Le serveur sert `client/dist` depuis le disque : un rebuild du client prend effet sans redémarrage ; un changement dans `server/` ou `.env` demande un redémarrage.
- Prod : VPS Gandi V-R1 (1 vCPU, 1 Go RAM + 2 Go swap), Debian 13, Node 24, Caddy, service systemd `amend` (MemoryMax 700M), code dans `/opt/amend/app`, données dans `/opt/amend/data`. Site public : https://www.amend.ink.
- `.env` (jamais commité) : `PORT`, `DATA_DIR`, `SESSION_SECRET`, `ADMIN_EMAILS`, `APP_BASE_URL`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN` (zone EU), `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY` (optionnel), `CORRECTEUR_ETANCHE`. Ne jamais afficher ni copier ces valeurs.
- Sauvegardes : le NAS tire `data/` du VPS chaque nuit, puis envoi vers Proton Drive.

## Livrer

- Commandes npm (racine) : `npm test` (= `test:server` puis `test:client`, via `tools/lancer-tests.mjs`), `npm run lint` (eslint), `npm run format:check` (prettier sur server, shared, client/src, tools), `npm run build:client`, `npm run format` (prettier --write sur les fichiers donnés).
- Livraison = `./deploy/livrer.sh "message"` : exige la branche `main`, enchaîne prettier, eslint, tests, puis demande confirmation (o/N) avant commit + push (seuls certains chemins sont indexés : client/src, client/test, client/public, server, shared, tools, deploy, package*.json, eslint.config.js, README.md — donc **pas** `CLAUDE.md`, `docs/` ni `.claude/`, à commiter à la main), puis confirmation avant d'exécuter `deploy/deploy.sh` sur le VPS en SSH. `./deploy/livrer.sh --controles` lance les contrôles seuls, sans rien modifier ; `--sans-deploiement` s'arrête après le push. Variable `AMEND_SSH` pour la cible (défaut `amend@92.243.27.71`).
- Déploiement manuel sur le VPS (hors livrer.sh) : `git pull`, `npm ci --omit=dev` à la racine (le serveur dépend de `yjs` et `y-protocols`), `cd client && npm ci && npm run build`, puis `sudo systemctl restart amend` seulement si `server/` ou `.env` a changé.
- Avant de conclure qu'un lot est prêt : `npm run format:check`, `npm run lint`, `npm test`.
- `client/src/style.css` ne passe pas `prettier --check` (déjà le cas, hors périmètre du contrôle).
- Test serveur connu : « clé API absente → 501 » échoue sur le Mac car le vrai `.env` est rechargé ; il passe sans `.env`.
- `_a_supprimer/` et `revue-*.md` sont ignorés par git ; `mac-launchagent/`, `data/`, `.env` aussi.

## Architecture (repères)

- `client/` : Vite + ProseMirror + Yjs (y-prosemirror). `client/src/` : schéma (`schema.js`), suivi des modifications (`trackChanges.js`, marques `ins.tracked-insertion` / `del.tracked-deletion`), barre d'outils (`barreOutils.js`), exports (`exportVariante.js`, `exportCommun.js`, `typstExport.js`, `docxExport.js`, `publicationExport.js`), typographie (`typographie.js`).
- `server/` : Node, HTTP + WebSocket maison. `storage.js` (documents, accès, `roleFor`), `roles.js` (rôles éditeur / correcteur / lecteur → **capacités** ; toute évolution des droits se fait là), `replique.js` (réplique Yjs par document ouvert, compactage côté serveur), `auth.js` + `mailgun.js` (lien magique, invitations nominatives), `typst.js` + `routes/export.js` (PDF), `publication.js` (page publiée), `admin.js` + `metrics.js` (back-office `#/admin`, journaux `data/events-*.jsonl`), `garde-fous.js` (limites IA).
- `shared/` : code commun client/serveur — `diff.js` (corrections de l'IA), `propre.js` (`nfc`).
- `tools/` : scripts (banc de charge, `nettoyer-images.mjs`…). `deploy/` : livraison.
- IA : « Margo (IA) » dans l'application ; le connecteur « Inviter Claude » s'affiche « Claude (pour <prénom>) ». Fournisseurs Anthropic (et Mistral en option). Voir `docs/journal-decisions.md` pour les modèles.

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
