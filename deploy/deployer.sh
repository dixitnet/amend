#!/bin/bash
# Mise en production, à lancer depuis le Mac (n'importe quel dossier du dépôt) :
#
#   ./deploy/deployer.sh              déploie origin/main sur le VPS : la v1, puis la v2
#   ./deploy/deployer.sh --restart    idem, en redémarrant la v1 dans tous les cas (changement du .env)
#   ./deploy/deployer.sh --courrier   idem, puis met en place les courriers de la v2 (courrier.sh)
#
# Une seule connexion SSH ; sudo ne demande son mot de passe qu'une fois
# (Sylvain, 09/11/2026 : un script unique, le moins de mots de passe possible).
#
# Le développement, les contrôles, les commits et la fusion dans main sont faits
# par Claude depuis sa branche de travail, avec l'accord de Sylvain. Ce script ne
# fait que le déploiement : il ne commite, ne fusionne et ne pousse rien.
# Le VPS se règle par AMEND_SSH (défaut : amend@92.243.27.71).
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_CIBLE="${AMEND_SSH:-amend@92.243.27.71}"
OPTION=""
COURRIER=""
for a in "$@"; do
  case "$a" in
    --restart) OPTION="--restart" ;;
    --courrier) COURRIER=1 ;;
    *) echo "Option inconnue : $a (--restart, --courrier)"; exit 1 ;;
  esac
done
ETAPES="cd /opt/amend/app && ./deploy/deploy.sh $OPTION && journalctl -u amend --since '2 min ago' --no-pager | tail -15"
ETAPES="$ETAPES && echo '→ v2' && bash v2/exploitation/prod/deployer.sh"
if [[ -n "$COURRIER" ]]; then
  ETAPES="$ETAPES && echo '→ courriers de la v2' && sudo bash v2/exploitation/prod/courrier.sh"
fi

git fetch -q origin main
echo "→ à déployer : $(git log --oneline -1 origin/main)"
read -r -p "Déployer v1 et v2${OPTION:+ (v1 redémarrée)}${COURRIER:+, puis courriers de la v2} sur $SSH_CIBLE ? [o/N] " r
[[ "$r" == "o" || "$r" == "O" ]] || { echo "Non déployé."; exit 0; }

ssh -t "$SSH_CIBLE" "$ETAPES"
echo "✓ Déployé. Rechargez les onglets ouverts (rechargement forcé) puis vérifiez à l'œil."
