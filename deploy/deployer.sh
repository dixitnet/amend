#!/bin/bash
# Mise en production, à lancer depuis le Mac (n'importe quel dossier du dépôt) :
#
#   ./deploy/deployer.sh              déploie origin/main sur le VPS
#   ./deploy/deployer.sh --restart    idem, en redémarrant le service dans tous les cas (changement du .env)
#
# Le développement, les contrôles, les commits et la fusion dans main sont faits
# par Claude sur la branche dev-claude, avec l'accord de Sylvain. Ce script ne
# fait que le déploiement : il ne commite, ne fusionne et ne pousse rien.
# Le VPS se règle par AMEND_SSH (défaut : amend@92.243.27.71).
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_CIBLE="${AMEND_SSH:-amend@92.243.27.71}"
OPTION=""
[[ "${1:-}" == "--restart" ]] && OPTION="--restart"

git fetch -q origin main
echo "→ à déployer : $(git log --oneline -1 origin/main)"
read -r -p "Lancer deploy.sh ${OPTION} sur $SSH_CIBLE ? [o/N] " r
[[ "$r" == "o" || "$r" == "O" ]] || { echo "Non déployé."; exit 0; }

ssh -t "$SSH_CIBLE" "cd /opt/amend/app && ./deploy/deploy.sh $OPTION && journalctl -u amend --since '2 min ago' --no-pager | tail -15"
echo "✓ Déployé. Rechargez les onglets ouverts (rechargement forcé) puis vérifiez à l'œil."
