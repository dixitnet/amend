# Fichiers de déploiement — serveur de production

Gabarits pour le tiny de production (Debian 13, 4 Go de RAM, réseau local).
Le guide complet, étape par étape, est dans le projet Claude ("Collab") sous
`claude/serveur-production-collabtext.md` — ces fichiers en sont l'exécution
directe, pour éviter de retaper les heredocs à la main sur le tiny.

- `collabtext.service` → `/etc/systemd/system/collabtext.service`
- `Caddyfile.local` → `/etc/caddy/Caddyfile` (phase réseau local, sans domaine)
- `backup.sh` → `/opt/collabtext/backup.sh` (`chmod +x`, adapter `<ip-du-nas>`)
- `collabtext-backup.service` / `collabtext-backup.timer` → `/etc/systemd/system/`
- `deploy.sh` → `/opt/collabtext/deploy.sh` (`chmod +x`) — mises à jour manuelles

Port et chemin data déjà confirmés dans le code (`server/server.js`) :
`PORT=8787` par défaut, `DATA_DIR=./data` par défaut — cohérent avec le
`.env` du Mac de dev et avec `Caddyfile.local` ci-dessus.
