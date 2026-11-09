#!/bin/bash
# Installation unique du déploiement automatique, en root, sur le VPS :
#   cd /opt/amend/app && git pull --ff-only && sudo bash deploy/auto/installer.sh
# Idempotent. Pour revenir en arrière :
#   sudo systemctl disable --now amend-maj.timer && sudo rm /etc/sudoers.d/amend-deploiement
set -euo pipefail
ICI=$(cd "$(dirname "$0")" && pwd)
[[ $EUID -eq 0 ]] || { echo "✗ à lancer avec sudo"; exit 1; }

echo "→ sudo sans mot de passe pour amend, limité aux redémarrages des services"
REGLE=$(mktemp)
cat > "$REGLE" <<FIN
# Déploiement automatique d'amend.ink (deploy/auto) : seulement ces commandes.
amend ALL=(root) NOPASSWD: /usr/bin/systemctl restart amend, /usr/bin/systemctl status amend --no-pager -l, /usr/bin/systemctl restart amend-v2 amend-v2-collab
FIN
visudo -cf "$REGLE" >/dev/null
install -m 440 -o root -g root "$REGLE" /etc/sudoers.d/amend-deploiement
rm -f "$REGLE"

echo "→ fichiers d'état"
for f in /opt/amend/deploiement-auto.etat /opt/amend/deploiement-auto.verrou; do
  touch "$f" && chown amend:amend "$f"
done

echo "→ service et minuteur"
install -m 644 "$ICI/amend-maj.service" /etc/systemd/system/amend-maj.service
install -m 644 "$ICI/amend-maj.timer" /etc/systemd/system/amend-maj.timer
systemctl daemon-reload
systemctl enable --now amend-maj.timer

echo "→ premier passage (déploie main s'il ne l'est pas encore)"
systemctl start amend-maj.service || { echo "✗ le premier passage a échoué : journalctl -u amend-maj -n 50"; exit 1; }
journalctl -u amend-maj --since '20 min ago' --no-pager | tail -5
echo "✓ déploiement automatique en place : main est déployé dans les 3 minutes qui suivent chaque fusion"
