#!/bin/bash
# Déploiement manuel d'une mise à jour sur le serveur de production
# (VPS, /opt/amend/app, service systemd « amend »). À lancer sur demande
# explicite uniquement, jamais automatiquement — voir la section 11 du guide
# de production (claude/serveur-production-collabtext.md).
#
#   ./deploy.sh              déploie, redémarre si server/ ou shared/ ont changé
#   ./deploy.sh --restart    redémarre dans tous les cas (changement du .env)
#
# Le redémarrage est décidé par ce que git dit avoir changé, et non par une
# question posée à la personne : le serveur importe `shared/`, et un
# changement de `shared/` seul suivi d'un « non » laissait le serveur sur
# l'ancien code pendant que le client avait le nouveau (audit du 10/10/2026,
# C5).
set -euo pipefail

APP=/opt/amend/app
SERVICE=amend
FORCER=0
[[ "${1:-}" == "--restart" ]] && FORCER=1

cd "$APP"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ Le dépôt a des modifications locales : inspecter (git diff) avant de déployer."
  git status --short
  exit 1
fi

AVANT=$(git rev-parse HEAD)
echo "→ commit actuel : $(git log --oneline -1)  (point de retour en arrière : $AVANT)"

echo "→ git pull"
git pull --ff-only
APRES=$(git rev-parse HEAD)

if [[ "$AVANT" == "$APRES" && "$FORCER" -eq 0 ]]; then
  echo "→ rien de nouveau"
  exit 0
fi

echo "→ dépendances du serveur (npm ci --omit=dev)"
npm ci --omit=dev

echo "→ build du frontend"
(cd client && npm ci && npm run build)

CHANGE=$(git diff --name-only "$AVANT" "$APRES" -- server shared package.json package-lock.json | head -20)
if [[ "$FORCER" -eq 1 || -n "$CHANGE" ]]; then
  echo "→ redémarrage du service ($([[ "$FORCER" -eq 1 ]] && echo 'demandé' || echo 'server/ ou shared/ ont changé'))"
  sudo systemctl restart "$SERVICE"
else
  echo "→ pas de redémarrage : seul client/ a changé, il prend effet directement"
fi

echo "→ statut"
sudo systemctl status "$SERVICE" --no-pager -l | head -10
