#!/bin/bash
# Sauvegarde quotidienne des données CollabText vers le NAS.
# Sens unique : le serveur de prod pousse vers le NAS, jamais l'inverse.
# À adapter : <ip-du-nas> et le chemin distant si besoin.
set -euo pipefail

rsync -az --delete -e "ssh -i /home/collab/.ssh/id_ed25519_nas_backup" \
  /opt/collabtext/data/ syg@<ip-du-nas>:/nas/backups/collabtext/
