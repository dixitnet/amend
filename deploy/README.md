# Fichiers de déploiement — serveur de production

Gabarits pour le tiny de production (Debian 13, 4 Go de RAM, réseau local).
Le guide complet, étape par étape, est dans le projet Claude ("Collab") sous
`claude/serveur-production-collabtext.md` — ces fichiers en sont l'exécution
directe, pour éviter de retaper les heredocs à la main sur le tiny.

- `collabtext.service` → `/etc/systemd/system/collabtext.service`
- `Caddyfile.local` → `/etc/caddy/Caddyfile` (phase réseau local, sans domaine)
- **Sauvegarde** : voir `SAUVEGARDE.md` (`sauvegarde-serveur.sh` sur la production, `tirer-sauvegarde.sh` et `amend-sauvegarde.{service,timer}` sur le NAS). Les anciens `backup.sh` et `collabtext-backup.*` (la production *poussait* vers le NAS) sont remplacés : une production prise pouvait effacer ses propres sauvegardes.
- `deploy.sh` → `/opt/collabtext/deploy.sh` (`chmod +x`) — mises à jour manuelles

Port et chemin data déjà confirmés dans le code (`server/server.js`) :
`PORT=8787` par défaut, `DATA_DIR=./data` par défaut — cohérent avec le
`.env` du Mac de dev et avec `Caddyfile.local` ci-dessus.

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
