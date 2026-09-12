#!/bin/bash
# Déploiement manuel d'une mise à jour sur le serveur de production.
# À lancer sur le tiny (jamais automatiquement — sur demande explicite
# uniquement, voir la section 11 du guide de production).
set -euo pipefail

cd /opt/collabtext/app

echo "→ git pull"
git pull

echo "→ build du frontend"
cd client
npm ci
npm run build
cd ..

read -p "Le backend (server/) a-t-il changé dans cette mise à jour ? [y/N] " reponse
if [[ "$reponse" =~ ^[Yy]$ ]]; then
  echo "→ redémarrage du service"
  sudo systemctl restart collabtext
else
  echo "→ pas de redémarrage : le changement client/ seul prend effet directement"
fi

echo "→ statut"
sudo systemctl status collabtext --no-pager -l | head -10
