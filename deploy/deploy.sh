#!/bin/bash
# Déploiement d'une mise à jour sur le serveur de production (VPS,
# /opt/amend/app, service systemd « amend »). Depuis le 09/11/2026 (Sylvain),
# il est lancé automatiquement après chaque fusion dans main par
# deploy/auto/maj.sh (minuteur amend-maj) ; il reste utilisable à la main.
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

# Remplacer un dossier servi par deux renommages consécutifs : le site ne sert
# jamais un client à moitié écrit, et le dossier ne manque que le temps de ces
# deux renommages, au lieu de toute la construction (audit du 10/11/2026).
basculer() {
  rm -rf "$1.ancien"
  if [[ -d "$1" ]]; then mv "$1" "$1.ancien"; fi
  mv "$1.neuf" "$1"
  rm -rf "$1.ancien"
}

if [[ "$FORCER" -eq 1 || ! -d node_modules ]] || ! git diff --quiet "$AVANT" "$APRES" -- package.json package-lock.json; then
  echo "→ dépendances du serveur (npm ci --omit=dev)"
  npm ci --omit=dev
else
  echo "→ dépendances du serveur inchangées"
fi

# Le client est construit par GitHub Actions (branche `livraison`, 10/11/2026) ;
# deploy/auto/maj.sh donne la livraison de ce commit dans AMEND_LIVRAISON. À
# défaut (lancement à la main, CI en panne), on le construit ici, comme avant.
if [[ -n "${AMEND_LIVRAISON:-}" ]]; then
  echo "→ client construit par GitHub Actions"
  EXTRAIT=$(mktemp -d)
  git archive "$AMEND_LIVRAISON" v1/dist | tar -x -C "$EXTRAIT"
  rm -rf client/dist.neuf
  mv "$EXTRAIT/v1/dist" client/dist.neuf
  rm -rf "$EXTRAIT"
else
  echo "→ build du frontend (sur place)"
  (cd client && npm ci && npm run build -- --outDir dist.neuf)
fi
basculer client/dist

CHANGE=$(git diff --name-only "$AVANT" "$APRES" -- server shared package.json package-lock.json | head -20)
if [[ "$FORCER" -eq 1 || -n "$CHANGE" ]]; then
  echo "→ redémarrage du service ($([[ "$FORCER" -eq 1 ]] && echo 'demandé' || echo 'server/ ou shared/ ont changé'))"
  sudo systemctl restart "$SERVICE"
else
  echo "→ pas de redémarrage : seul client/ a changé, il prend effet directement"
fi

echo "→ statut"
sudo systemctl status "$SERVICE" --no-pager -l | head -10
