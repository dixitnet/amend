#!/bin/bash
# Installation unique du déploiement automatique, en root, sur le VPS :
#   cd /opt/amend/app && git pull --ff-only && sudo bash deploy/auto/installer.sh
# Idempotent. Pour revenir en arrière :
#   sudo systemctl disable --now amend-maj.timer amend-v2-sauvegarde.timer && sudo rm /etc/sudoers.d/amend-deploiement
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
# Sauvegarde nocturne de la base de la v2 (10/11/2026), déposée dans data/
# avant la copie du NAS.
V2PROD="$ICI/../../v2/exploitation/prod"
install -m 644 "$V2PROD/amend-v2-sauvegarde.service" /etc/systemd/system/amend-v2-sauvegarde.service
install -m 644 "$V2PROD/amend-v2-sauvegarde.timer" /etc/systemd/system/amend-v2-sauvegarde.timer
# Le service du serveur de la v2 (dépendance à PostgreSQL, 10/11/2026) : pris en
# compte à son prochain redémarrage, que fait chaque déploiement de la v2.
install -m 644 "$V2PROD/amend-v2.service" /etc/systemd/system/amend-v2.service
systemctl daemon-reload
systemctl enable --now amend-maj.timer amend-v2-sauvegarde.timer

echo "→ première sauvegarde de la base de la v2, puis essai de restauration"
systemctl start amend-v2-sauvegarde.service || { echo "✗ la sauvegarde a échoué : journalctl -u amend-v2-sauvegarde -n 30"; exit 1; }
bash "$V2PROD/restaurer.sh" --essai | grep -v NOTICE

echo "→ premier passage (déploie main s'il ne l'est pas encore)"
systemctl start amend-maj.service || { echo "✗ le premier passage a échoué : journalctl -u amend-maj -n 50"; exit 1; }
journalctl -u amend-maj --since '20 min ago' --no-pager | tail -5
echo "✓ déploiement automatique en place : main est déployé dans les 5 minutes environ qui suivent chaque fusion ; base de la v2 sauvegardée chaque nuit"
