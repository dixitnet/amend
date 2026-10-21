#!/bin/bash
# Livraison complète, à lancer depuis le Mac, dans le dépôt :
#
#   ./deploy/livrer.sh "Message du commit"                 contrôles → commit → poussée → déploiement
#   ./deploy/livrer.sh --controles                         contrôles seuls (rien n'est modifié)
#   ./deploy/livrer.sh --sans-deploiement "Message"        s'arrête après la poussée
#
# Chaque étape qui écrit quelque chose (commit/poussée, déploiement) demande
# une confirmation. Le VPS se règle par AMEND_SSH (défaut : amend@92.243.27.71).
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_CIBLE="${AMEND_SSH:-amend@92.243.27.71}"
DEPLOYER=1
SEULEMENT_CONTROLES=0
MSG=""
for a in "$@"; do
  case "$a" in
    --controles) SEULEMENT_CONTROLES=1 ;;
    --sans-deploiement) DEPLOYER=0 ;;
    *) MSG="$a" ;;
  esac
done
if [[ "$SEULEMENT_CONTROLES" -eq 0 && -z "$MSG" ]]; then
  echo "Usage : ./deploy/livrer.sh \"Message du commit\"   (ou --controles)"
  exit 1
fi

demander() { read -r -p "$1 [o/N] " r; [[ "$r" == "o" || "$r" == "O" ]]; }

[[ "$(git branch --show-current)" == "main" ]] || { echo "✗ Pas sur la branche main."; exit 1; }

echo "→ 1/5 mise en forme (prettier)"
npm run --silent format:check
echo "→ 2/5 analyse (eslint)"
npm run --silent lint
echo "→ 3/5 tests serveur puis client"
npm test
[[ "$SEULEMENT_CONTROLES" -eq 1 ]] && { echo "✓ Contrôles verts. Rien n'a été modifié."; exit 0; }

echo "→ 4/5 commit et poussée"
git add -A -- client/src client/test client/public client/index.html client/package.json client/package-lock.json \
  server shared tools deploy package.json package-lock.json eslint.config.js README.md
if git diff --cached --name-only | grep -Eiq '(^|/)\.env|secret|\.key$|\.pem$'; then
  echo "✗ Un fichier de secrets semble être dans le commit :"
  git diff --cached --name-only | grep -Ei '(^|/)\.env|secret|\.key$|\.pem$'
  git reset -q
  exit 1
fi
git diff --cached --stat | tail -40
RESTE=$(git status --short | grep -v '^[MADRC]' || true)
[[ -n "$RESTE" ]] && { echo "⚠ Non inclus dans le commit :"; echo "$RESTE"; }
git diff --cached --quiet && { echo "Rien à commiter."; exit 0; }
demander "Commiter « $MSG » et pousser sur origin/main ?" || { echo "Abandon (les fichiers restent indexés)."; exit 1; }
git commit -m "$MSG"
git push origin main
echo "✓ Poussé : $(git log --oneline -1)"

if [[ "$DEPLOYER" -eq 0 ]]; then echo "Déploiement non demandé."; exit 0; fi
echo "→ 5/5 déploiement sur $SSH_CIBLE"
demander "Lancer deploy.sh sur le VPS ?" || { echo "Poussé, non déployé."; exit 0; }
ssh -t "$SSH_CIBLE" 'cd /opt/amend/app && git log --oneline -1 && ./deploy/deploy.sh && journalctl -u amend --since "2 min ago" --no-pager | tail -15'
echo "✓ Déployé. Rechargez les onglets ouverts (rechargement forcé) puis vérifiez à l'œil."
