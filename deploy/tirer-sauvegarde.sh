#!/bin/bash
# Côté MACHINE DE SAUVEGARDE (le NAS) : tirer les données d'amend.ink.
#
# Le sens compte. C'est cette machine qui vient chercher, jamais le
# serveur qui pousse : si la production est prise, elle ne détient aucun
# identifiant qui permette d'effacer les sauvegardes avec (voir
# claude/conception-sauvegarde.md, §3). La clé SSH utilisée ici n'ouvre,
# côté production, que deux commandes figées (deploy/sauvegarde-serveur.sh).
#
#   tirer-sauvegarde.sh            tire données + secrets, fait tourner
#   tirer-sauvegarde.sh age        vérifie que la dernière sauvegarde est récente
#
# Réglages : ~/.config/amend-sauvegarde.conf (ou variables d'environnement).
#   HOTE=amend@92.243.27.71
#   CLE=$HOME/.ssh/id_ed25519_amend_sauvegarde
#   DEST=/nas/backups/amend
set -euo pipefail

CONF="${AMEND_SAUVEGARDE_CONF:-$HOME/.config/amend-sauvegarde.conf}"
# shellcheck disable=SC1090
[ -r "$CONF" ] && . "$CONF"

HOTE="${HOTE:?HOTE manque (ex. amend@92.243.27.71)}"
CLE="${CLE:-$HOME/.ssh/id_ed25519_amend_sauvegarde}"
DEST="${DEST:?DEST manque (ex. /nas/backups/amend)}"
GARDER_QUOTIDIENNES="${GARDER_QUOTIDIENNES:-7}"
GARDER_HEBDOMADAIRES="${GARDER_HEBDOMADAIRES:-4}"
GARDER_SECRETS="${GARDER_SECRETS:-4}"
# En dessous de cette part de la sauvegarde précédente, on soupçonne une
# archive tronquée : on la garde de côté, on ne fait tourner rien.
SEUIL_SUSPECT_POURCENT="${SEUIL_SUSPECT_POURCENT:-40}"
# Sert aux tests : remplacer `ssh` par une commande qui fabrique le flux.
SSH_CMD="${SSH_CMD:-ssh -i $CLE -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=20 -o ServerAliveInterval=15}"

mkdir -p "$DEST/quotidiennes" "$DEST/hebdomadaires" "$DEST/secrets"
chmod 700 "$DEST/secrets"

# Les archives d'un dossier, de la plus récente à la plus ancienne. Pas de
# `ls` sur un motif : sans correspondance il sort en erreur, ce qui, avec
# `set -e -o pipefail`, tuerait le script au premier passage.
plus_recentes() {
  find "$1" -maxdepth 1 -type f -name '*.tar.gz' -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-
}

journaliser() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$DEST/sauvegarde.log"; }

if [ "${1:-}" = "age" ]; then
  # Pour une supervision : code de sortie 1 si la dernière sauvegarde réussie
  # a plus de 36 heures. Une sauvegarde qui s'arrête en silence est pire que
  # pas de sauvegarde, parce qu'on croit en avoir une.
  derniere=$(plus_recentes "$DEST/quotidiennes" | sed -n 1p)
  if [ -z "$derniere" ]; then echo "aucune sauvegarde"; exit 1; fi
  age_s=$(( $(date +%s) - $(stat -c %Y "$derniere") ))
  echo "dernière : $(basename "$derniere") (il y a $(( age_s / 3600 )) h)"
  [ "$age_s" -le $(( 36 * 3600 )) ]
  exit $?
fi

TMP="$DEST/.tirage.$$"
nettoyer() { rm -f "$TMP" "$TMP".liste; }
trap nettoyer EXIT
echec() {
  echo "ÉCHEC : $*" >&2
  journaliser "ÉCHEC : $*"
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" > "$DEST/dernier-echec"
  exit 1
}

horodatage=$(date +%Y%m%d-%H%M%S)

# Tire un flux, vérifie qu'il est une archive entière qui contient bien ce
# qu'elle doit contenir, et le range sous son nom définitif.
#   $1 nature (donnees|secrets)  $2 dossier  $3 nom  $4 motif (regex) d'une entrée obligatoire
tirer() {
  local nature=$1 dossier=$2 nom=$3 attendu=$4
  # shellcheck disable=SC2086
  $SSH_CMD "$HOTE" "$nature" > "$TMP" || echec "$nature : la connexion ou la commande a échoué"
  [ -s "$TMP" ] || echec "$nature : archive vide"
  gzip -t "$TMP" 2>/dev/null || echec "$nature : archive corrompue (gzip -t)"
  tar tzf "$TMP" > "$TMP.liste" 2>/dev/null || echec "$nature : archive illisible (tar tzf)"
  grep -Eq "$attendu" "$TMP.liste" || echec "$nature : « $attendu » absent de l'archive"

  local precedente
  precedente=$(plus_recentes "$dossier" | sed -n 1p)
  if [ -n "$precedente" ]; then
    local avant apres
    avant=$(stat -c %s "$precedente")
    apres=$(stat -c %s "$TMP")
    if [ "$avant" -gt 10240 ] && [ $(( apres * 100 )) -lt $(( avant * SEUIL_SUSPECT_POURCENT )) ]; then
      mv "$TMP" "$dossier/$nom.suspecte"
      echec "$nature : $apres octets contre $avant la fois d'avant — gardée en $nom.suspecte, rien n'a tourné"
    fi
  fi
  mv "$TMP" "$dossier/$nom"
  chmod 600 "$dossier/$nom"
  journaliser "$nature : $nom ($(stat -c %s "$dossier/$nom") octets)"
}

# Garde les N plus récentes d'un dossier, supprime le reste.
faire_tourner() {
  local dossier=$1 garder=$2
  plus_recentes "$dossier" | tail -n +$(( garder + 1 )) | while read -r vieux; do
    rm -f -- "$vieux"
  done
}

tirer donnees "$DEST/quotidiennes" "amend-$horodatage.tar.gz" '^data/docs\.json$'

# Le dimanche, la sauvegarde du jour devient aussi l'hebdomadaire — un lien
# dur, pas une copie : elle ne coûte rien de plus tant que la quotidienne
# existe, et survit à sa rotation.
if [ "${JOUR_SEMAINE:-$(date +%u)}" = "7" ]; then
  ln -f "$DEST/quotidiennes/amend-$horodatage.tar.gz" "$DEST/hebdomadaires/amend-$horodatage.tar.gz"
fi
faire_tourner "$DEST/quotidiennes" "$GARDER_QUOTIDIENNES"
faire_tourner "$DEST/hebdomadaires" "$GARDER_HEBDOMADAIRES"

# Les secrets : même mécanique, dossier fermé, quatre exemplaires. Un échec
# ici ne doit pas défaire la sauvegarde des données, déjà rangée.
tirer secrets "$DEST/secrets" "amend-secrets-$horodatage.tar.gz" '(^|/)\.env$'
faire_tourner "$DEST/secrets" "$GARDER_SECRETS"

# Dire au serveur que la copie a eu lieu, pour le back-office. Ce n'est pas
# la sauvegarde elle-même : si cet appel échoue, la copie est bonne et
# rangée, on le note simplement.
# shellcheck disable=SC2086
$SSH_CMD "$HOTE" signaler || journaliser "avertissement : le serveur n'a pas pu noter la copie"

date '+%Y-%m-%d %H:%M:%S' > "$DEST/dernier-succes"
rm -f "$DEST/dernier-echec"
journaliser "terminé"
echo "Sauvegarde du $horodatage rangée dans $DEST"
