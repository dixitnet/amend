#!/bin/bash
# Déploiement automatique (Sylvain, 09/11/2026 : se passer du Mac) : lancé
# toutes les 3 minutes par amend-maj.timer, en tant qu'amend. Si `main` a
# changé depuis le dernier déploiement, ou si un fichier d'environnement a
# changé, déploie la v1 (deploy/deploy.sh) puis la v2. Un même commit n'est
# tenté qu'une fois : en cas d'échec, le journal le dit
# (journalctl -u amend-maj), et la tentative suivante attend un nouveau commit.
set -euo pipefail
# Tout le script est lu avant d'être exécuté (le `git pull` de deploy.sh
# peut le modifier pendant qu'il tourne).
principal() {
APP=/opt/amend/app
ETAT=/opt/amend/deploiement-auto.etat
exec 9>/opt/amend/deploiement-auto.verrou
flock -n 9 || exit 0

cd "$APP"
git fetch -q origin main
CIBLE=$(git rev-parse origin/main)
empreinte() { sha256sum "$1" 2>/dev/null | cut -c1-16 || echo absent; }
ENV1=$(empreinte "$APP/.env")
ENV2=$(empreinte /opt/amend/v2.env)
# État : commit tenté, empreintes des deux fichiers d'environnement.
read -r FAIT FAIT_ENV1 FAIT_ENV2 < "$ETAT" 2>/dev/null || { FAIT=""; FAIT_ENV1=""; FAIT_ENV2=""; }
[[ "$CIBLE" == "$FAIT" && "$ENV1" == "$FAIT_ENV1" && "$ENV2" == "$FAIT_ENV2" ]] && exit 0

echo "→ déploiement automatique de $(git log --oneline -1 "$CIBLE")"
echo "$CIBLE $ENV1 $ENV2" > "$ETAT"
OPTION=""
[[ -n "$FAIT_ENV1" && "$ENV1" != "$FAIT_ENV1" ]] && OPTION="--restart"
"$APP/deploy/deploy.sh" $OPTION
bash "$APP/v2/exploitation/prod/deployer.sh"
echo "✓ en ligne : $(git log --oneline -1)"
}
principal "$@"
exit
