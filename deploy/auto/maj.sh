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

# Ne reconstruire que ce qui a changé (10/11/2026 : chaque fusion construisait
# v1 et v2 sur le VPS, plus de 8 minutes de machine saturée, les deux sites
# ralentis). Sans commit précédent connu, tout est reconstruit.
if [[ -n "$FAIT" ]] && git merge-base --is-ancestor "$FAIT" "$CIBLE" 2>/dev/null; then
  CHANGE=$(git diff --name-only "$FAIT" "$CIBLE")
else
  CHANGE="(tout)"
fi
a_change() { [[ "$CHANGE" == "(tout)" ]] || grep -qE "$1" <<< "$CHANGE"; }
# v1 : son code, ses dépendances, son script de livraison.
V1=0 V2=0
a_change '^(client|server|shared)/|^deploy/deploy\.sh$|^package(-lock)?\.json$' && V1=1
[[ -n "$FAIT_ENV1" && "$ENV1" != "$FAIT_ENV1" ]] && V1=1
# v2 : tout v2/, et le flux de tests qui attend la nouvelle version en ligne.
a_change '^v2/|^\.github/workflows/v2\.yml$' && V2=1
[[ -n "$FAIT_ENV2" && "$ENV2" != "$FAIT_ENV2" ]] && V2=1

# Les clients sont construits par GitHub Actions (.github/workflows/livraison.yml,
# 10/11/2026), sur la branche `livraison` : on attend celle de ce commit, deux
# ou trois minutes après la fusion. Sans elle au bout de 30 minutes (CI en
# panne), on construit sur place, comme avant, pour ne jamais rester bloqué.
LIVRAISON=""
if (( V1 || V2 )); then
  git fetch -q origin livraison 2>/dev/null || true
  if [[ "$(git show origin/livraison:COMMIT 2>/dev/null)" == "$CIBLE" ]]; then
    LIVRAISON=origin/livraison
  else
    ATTENTE=/tmp/amend-livraison-attente
    read -r A_CIBLE A_DEPUIS < "$ATTENTE" 2>/dev/null || { A_CIBLE=""; A_DEPUIS=0; }
    if [[ "$A_CIBLE" != "$CIBLE" ]]; then
      echo "$CIBLE $(date +%s)" > "$ATTENTE"
      echo "→ $(git log --oneline -1 "$CIBLE") : livraison pas encore construite (GitHub Actions), nouvel essai dans 3 minutes"
      exit 0
    fi
    if (( $(date +%s) - A_DEPUIS < 1800 )); then exit 0; fi
    echo "⚠ pas de livraison pour ${CIBLE:0:7} après 30 minutes (onglet Actions, flux « livraison ») : construction sur place"
  fi
fi
export AMEND_LIVRAISON="$LIVRAISON"

echo "→ déploiement automatique de $(git log --oneline -1 "$CIBLE")${LIVRAISON:+ (clients construits par GitHub Actions)}"
echo "$CIBLE $ENV1 $ENV2" > "$ETAT"
# Le service installé doit être celui du dépôt (limites de mémoire et de
# disque, 10/11/2026) : seul root peut le remettre à jour.
for u in deploy/auto/amend-maj.service deploy/auto/amend-maj.timer \
  v2/exploitation/prod/amend-v2-sauvegarde.service v2/exploitation/prod/amend-v2-sauvegarde.timer \
  v2/exploitation/prod/amend-v2.service; do
  cmp -s "$APP/$u" "/etc/systemd/system/$(basename "$u")" ||
    echo "⚠ $(basename "$u") a changé dans le dépôt : sudo bash deploy/auto/installer.sh (une fois)"
done


if [[ $V1 -eq 1 ]]; then
  OPTION=""
  [[ -n "$FAIT_ENV1" && "$ENV1" != "$FAIT_ENV1" ]] && OPTION="--restart"
  "$APP/deploy/deploy.sh" $OPTION
else
  echo "→ v1 : rien à reconstruire (documentation, v2 ou tests seulement)"
  git pull -q --ff-only
fi
if [[ $V2 -eq 1 ]]; then
  bash "$APP/v2/exploitation/prod/deployer.sh"
else
  echo "→ v2 : rien à reconstruire"
fi
echo "✓ en ligne : $(git log --oneline -1)"
}
principal "$@"
exit
