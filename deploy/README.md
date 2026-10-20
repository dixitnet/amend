# Fichiers de déploiement — serveur de production

Gabarits pour la production : VPS Gandi, Debian 13, 1 vCPU, 1 Go de RAM,
`www.amend.ink` (Caddy, systemd). Le guide complet, étape par étape, est dans
le projet Claude ("Amend") sous `claude/serveur-production-collabtext.md` —
ces fichiers en sont l'exécution directe, pour éviter de retaper les heredocs
à la main.

- `amend.service` → `/etc/systemd/system/amend.service` (l'ancien `collabtext.service`, aux chemins `/opt/collabtext`, est retiré : une seule famille de chemins, `/opt/amend`)
- `Caddyfile.exemple` → `/etc/caddy/Caddyfile` : la copie versionnée de la production (domaine, HTTPS). `Caddyfile.local` ne sert qu'à un essai en réseau local, sans domaine.
- **Sauvegarde** : voir `SAUVEGARDE.md` (`sauvegarde-serveur.sh` sur la production, `tirer-sauvegarde.sh` et `amend-sauvegarde.{service,timer}` sur le NAS). Un envoi quotidien vers Proton Drive part en plus du VPS lui-même (`sauvegarde-vers-proton.sh`, `amend-proton.{service,timer}` : `SAUVEGARDE.md` §8). Les anciens `backup.sh` et `collabtext-backup.*` (la production *poussait* vers le NAS) sont remplacés : une production prise pouvait effacer ses propres sauvegardes.
- `deploy.sh` reste dans le dépôt, donc sur la production : `bash /opt/amend/app/deploy/deploy.sh` (ne pas le copier ailleurs) — mises à jour manuelles : `git pull --ff-only`, `npm ci --omit=dev`, build du client, redémarrage décidé par `git diff` (`server/`, `shared/`, `package*.json`) ; `--restart` pour forcer (changement du `.env`)

Port et chemin data déjà confirmés dans le code (`server/server.js`) :
`PORT=8787` par défaut, `DATA_DIR=./data` par défaut — cohérent avec le
`.env` du Mac de dev et avec `Caddyfile.local` ci-dessus.

## Polices de l'export PDF

Le menu de polices (`POLICES`, `shared/style.js`) ne propose que des polices
**installées sur le serveur** : Typst remplace en silence une famille qu'il ne
trouve pas. Sur Debian :

    sudo apt install fonts-dejavu fonts-liberation fonts-roboto

Typst embarque lui-même Libertinus Serif et DejaVu Sans Mono. Pour vérifier :

    typst fonts | grep -iE "dejavu|liberation|roboto|libertinus"

Au démarrage, le journal (`journalctl -u amend`) dit « Polices absentes de
cette machine » si l'une des familles du menu manque. **Ajouter une police au
menu suppose de l'installer ici d'abord**, et de compléter la liste
`INSTALLEES` de `server/test/polices.test.js`. Word, lui, reçoit le nom que
connaît un ordinateur (Arial, Times New Roman) : voir le champ `docx`.

## Inviter Claude sur un document (connecteur MCP)

Voir `claude/etude-inviter-claude.md` (§11). Deux précautions côté serveur
**avant** la première invitation :

1. **Ne pas journaliser l'adresse.** L'adresse `/mcp/<secret>` *est* le mot
   de passe de l'agent ; le journal d'accès de Caddy l'enregistrerait en
   clair. Dans `/etc/caddy/Caddyfile`, dans le bloc `log` du site :

       log {
           format filter {
               request>uri regexp /mcp/.* /mcp/REDACTED
           }
       }

   puis `caddy validate --config /etc/caddy/Caddyfile` et
   `sudo systemctl reload caddy`. (Le motif couvre aussi les sondes
   `/.well-known/oauth-*/mcp/<secret>`.)
2. **`/mcp/` ne doit être derrière aucun `basic_auth`** (retiré le 15/09 ;
   à vérifier : `curl -si https://www.amend.ink/mcp/x | head -1` doit
   répondre `404`, pas `401`).

Ensuite, sur le VPS, dans `/opt/amend/app` :

    node tools/inviter-claude.js "Vie et mort de Zan" --role correcteur --jours 7
    node tools/inviter-claude.js --liste
    node tools/inviter-claude.js --prolonger ag-xxxxxxxx --jours 7
    node tools/inviter-claude.js --revoquer ag-xxxxxxxx

L'adresse n'est affichée qu'une fois ; elle s'ajoute dans Claude
(Paramètres → Connecteurs → Ajouter un connecteur personnalisé), sans
identifiant. Le journal `data/events-agents.jsonl` dit quel outil a servi,
jamais ce qui a été lu ni écrit.

### Depuis l'interface (30/09/2026)

Le même geste existe dans **Partager → Gérer les accès**, section « Claude » :
rôle (correcteur ou lecteur), durée (24 h, 7 jours, 30 jours), l'adresse
montrée une fois avec un bouton Copier, puis pour chaque invitation
Prolonger, Régénérer (nouvelle adresse, l'ancienne meurt aussitôt) et
Révoquer. Le script reste utile en secours et pour les invitations faites
sans navigateur ; les deux écrivent dans le même registre
(`data/agents.json`).

Qui peut inviter se règle dans le `.env` :

    CLAUDE_AGENT=admins        # ou proprietaires, ou editeurs

`admins` (par défaut, et pour toute valeur inconnue) : les seules adresses
de `ADMIN_EMAILS`. Changer la valeur demande un redémarrage du service
(`sudo systemctl restart amend`). Quelle que soit la valeur, tout éditeur
voit les invitations du document et peut les révoquer ; créer, prolonger
ou régénérer suit la portée.

Tant que Claude travaille, une pastille « CL » apparaît dans la barre des
participants (renouvelée toutes les dix secondes, retirée deux minutes après
son dernier appel ou à la révocation), avec un curseur au dernier bloc
lu ou modifié. Le bouton « Tout rejeter — Claude (n) » du panneau des
modifications défait tout son passage sans toucher à celui des personnes.
