#!/bin/bash
# Côté PRODUCTION (le VPS) : fabriquer la sauvegarde d'amend.ink et l'envoyer
# sur Proton Drive, avec le CLI officiel (`proton-drive`).
#
# Lancé chaque nuit par amend-proton.timer, sous l'utilisateur `amend`.
#
#   sauvegarde-vers-proton.sh        fabrique, envoie, vérifie, fait tourner
#   sauvegarde-vers-proton.sh age    code 1 si le dernier envoi réussi a plus de 36 h
#
# Ce que ça change par rapport à la copie tirée par le NAS
# (tirer-sauvegarde.sh, qui continue) : ici c'est la production qui POUSSE, donc
# elle détient une session Proton. Quiconque prend le VPS peut effacer les
# sauvegardes qui s'y trouvent (voir claude/conception-sauvegarde.md, §3 et
# deploy/SAUVEGARDE.md §8 : compte Proton dédié, et garder la copie du NAS).
#
# Ce que le script utilise du CLI — seulement ce que Proton documente
# (proton.me/support/drive-cli) : `filesystem list <dossier>` et
# `filesystem upload <fichiers…> <dossier>`, sans aucune option (la version
# 0.9.0 ne connaît pas `--conflict-strategy`, essayé le 10/10/2026) : chaque
# archive porte la date dans son nom, il n'y a jamais de conflit à régler.
# Les deux dossiers de destination (quotidiennes, secrets) doivent exister
# dans Proton Drive : aucune commande de création n'est documentée, on les
# crée à la main.
#
# Réglages (~/.config/amend-proton.conf, lu comme du shell) :
#   PROTON_CLI=/home/amend/bin/proton-drive   (défaut : `proton-drive` du PATH)
#   PROTON_DEST=/my-files/Sauvegardes/amend   (défaut)
#   PROTON_PREFIXE="dbus-run-session --"      (défaut : rien)
#   export PROTON_DRIVE_CREDENTIALS_STORE=pass (où le CLI range sa session)
#   PROTON_OPTIONS_ENVOI=""                  (options ajoutées à `filesystem upload`,
#                                              si une version du CLI en demande)
#   PROTON_RM="proton-drive filesystem …"     (défaut : vide = rien n'est jamais
#                                              supprimé sur Proton)
#   DEST=/opt/amend/sauvegardes               (où les archives sont rangées ici)
#   GARDER_LOCAL=2                            (archives gardées ici, par nature)
#   GARDER_PROTON_QUOTIDIENNES=7  GARDER_PROTON_HEBDOMADAIRES=4  GARDER_PROTON_SECRETS=4
set -euo pipefail

CONF="${AMEND_PROTON_CONF:-$HOME/.config/amend-proton.conf}"
# shellcheck disable=SC1090
[ -r "$CONF" ] && . "$CONF"

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVEUR="${SAUVEGARDE_SERVEUR:-$ICI/sauvegarde-serveur.sh}"
DATA_DIR="${AMEND_DATA_DIR:-/opt/amend/data}"
DEST="${DEST:-/opt/amend/sauvegardes}"
PROTON_CLI="${PROTON_CLI:-proton-drive}"
PROTON_DEST="${PROTON_DEST:-/my-files/Sauvegardes/amend}"
PROTON_PREFIXE="${PROTON_PREFIXE:-}"
PROTON_RM="${PROTON_RM:-}"
PROTON_OPTIONS_ENVOI="${PROTON_OPTIONS_ENVOI:-}"
PROTON_DELAI="${PROTON_DELAI:-3000}" # secondes, par appel du CLI
GARDER_LOCAL="${GARDER_LOCAL:-2}"
GARDER_PROTON_QUOTIDIENNES="${GARDER_PROTON_QUOTIDIENNES:-7}"
GARDER_PROTON_HEBDOMADAIRES="${GARDER_PROTON_HEBDOMADAIRES:-4}"
GARDER_PROTON_SECRETS="${GARDER_PROTON_SECRETS:-4}"
SEUIL_SUSPECT_POURCENT="${SEUIL_SUSPECT_POURCENT:-40}"

REGISTRE="$DEST/proton-envoye.txt" # une ligne « nature/nom » par fichier arrivé
journaliser() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$DEST/sauvegarde-proton.log"; }

if [ "${1:-}" = "age" ]; then
  if [ ! -r "$DEST/dernier-succes-proton" ]; then echo "aucun envoi vers Proton"; exit 1; fi
  age_s=$(( $(date +%s) - $(stat -c %Y "$DEST/dernier-succes-proton") ))
  echo "dernier envoi vers Proton : il y a $(( age_s / 3600 )) h"
  [ "$age_s" -le $(( 36 * 3600 )) ]
  exit $?
fi

mkdir -p "$DEST"
chmod 700 "$DEST"
# Une seule exécution à la fois.
exec 9> "$DEST/.verrou"
flock -n 9 || { journaliser "une exécution est déjà en cours, rien fait"; exit 0; }
touch "$REGISTRE"
TMP="$DEST/.fabrication.$$"
trap 'rm -f "$TMP" "$TMP.liste" "$DEST/.sortie" "$DEST/.liste" "$DEST/.registre.neuf"' EXIT

echoue=0
echec() {
  echo "ÉCHEC : $*" >&2
  journaliser "ÉCHEC : $*"
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" > "$DEST/dernier-echec-proton"
  echoue=1
}

# Les archives d'un dossier, de la plus récente à la plus ancienne (le nom
# porte la date : l'ordre alphabétique est l'ordre du temps).
noms_de() {
  find "$DEST/$1" -maxdepth 1 -type f -name '*.tar.gz' -printf '%f\n' 2>/dev/null | sort -r
}

# Le CLI, avec son éventuel préfixe (dbus-run-session --) et un délai maximal.
proton() {
  # shellcheck disable=SC2086
  timeout "$PROTON_DELAI" $PROTON_PREFIXE "$PROTON_CLI" "$@"
}

horodatage="${HORODATAGE:-$(date +%Y%m%d-%H%M%S)}"

# ---------------------------------------------------------------- 1. fabriquer
# Le même flux que celui que le NAS tire (sauvegarde-serveur.sh), vérifié de
# la même façon : entière, lisible, contenant ce qu'elle doit contenir, et pas
# bien plus petite que la précédente.
#   $1 nature (donnees|secrets)  $2 dossier  $3 nom  $4 motif d'une entrée obligatoire
fabriquer() {
  local nature=$1 dossier=$2 nom=$3 attendu=$4
  mkdir -p "$DEST/$dossier"
  if ! env -u SSH_ORIGINAL_COMMAND bash "$SERVEUR" "$nature" > "$TMP" 2> "$DEST/.sortie"; then
    echec "$nature : la fabrication a échoué ($(tail -n 1 "$DEST/.sortie" | cut -c1-200))"; return 1
  fi
  [ -s "$TMP" ] || { echec "$nature : archive vide"; return 1; }
  gzip -t "$TMP" 2>/dev/null || { echec "$nature : archive corrompue (gzip -t)"; return 1; }
  tar tzf "$TMP" > "$TMP.liste" 2>/dev/null || { echec "$nature : archive illisible (tar tzf)"; return 1; }
  grep -Eq "$attendu" "$TMP.liste" || { echec "$nature : « $attendu » absent de l'archive"; return 1; }
  local precedente avant apres
  precedente=$(noms_de "$dossier" | sed -n 1p)
  if [ -n "$precedente" ]; then
    avant=$(stat -c %s "$DEST/$dossier/$precedente")
    apres=$(stat -c %s "$TMP")
    if [ "$avant" -gt 10240 ] && [ $(( apres * 100 )) -lt $(( avant * SEUIL_SUSPECT_POURCENT )) ]; then
      mv "$TMP" "$DEST/$dossier/$nom.suspecte"
      echec "$nature : $apres octets contre $avant la fois d'avant — gardée en $nom.suspecte, rien n'est envoyé"; return 1
    fi
  fi
  mv "$TMP" "$DEST/$dossier/$nom"
  chmod 600 "$DEST/$dossier/$nom"
  journaliser "$nature : $nom ($(stat -c %s "$DEST/$dossier/$nom") octets)"
}

fabriquer donnees quotidiennes "amend-$horodatage.tar.gz" '^data/docs\.json$' || true
fabriquer secrets secrets "amend-secrets-$horodatage.tar.gz" '(^|/)\.env$' || true

# ----------------------------------------------------------------- 2. envoyer
for nature in quotidiennes secrets; do
  a_envoyer=()
  while IFS= read -r nom; do
    [ -n "$nom" ] || continue
    grep -qxF -- "$nature/$nom" "$REGISTRE" || a_envoyer+=("$nom")
  done < <(noms_de "$nature" | sort)
  [ "${#a_envoyer[@]}" -gt 0 ] || continue

  chemins=()
  for nom in "${a_envoyer[@]}"; do chemins+=("$DEST/$nature/$nom"); done
  if ! proton filesystem upload "${chemins[@]}" "$PROTON_DEST/$nature" $PROTON_OPTIONS_ENVOI > "$DEST/.sortie" 2>&1; then
    echec "$nature : l'envoi a échoué ($(tail -n 1 "$DEST/.sortie" | cut -c1-200))"
    continue
  fi
  # Un CLI qui répond « 0 » ne prouve pas que le fichier est arrivé : on relit
  # le dossier distant, et seul ce qu'on y voit entre dans le registre.
  if ! proton filesystem list "$PROTON_DEST/$nature" > "$DEST/.liste" 2>&1; then
    echec "$nature : envoyé, mais le dossier distant ne se relit pas ($(tail -n 1 "$DEST/.liste" | cut -c1-200))"
    continue
  fi
  for nom in "${a_envoyer[@]}"; do
    if grep -qF -- "$nom" "$DEST/.liste"; then
      echo "$nature/$nom" >> "$REGISTRE"
      journaliser "$nature/$nom envoyé sur Proton"
    else
      echec "$nature/$nom : absent du dossier distant après l'envoi (dossier $PROTON_DEST/$nature créé ?)"
    fi
  done
done

# ------------------------------------------- 3. la rotation sur Proton (si dite)
# Seulement si on a dit comment supprimer (SAUVEGARDE.md §8) ; sinon, jamais.
# Garde les N plus récentes quotidiennes, puis — parmi les plus anciennes — les
# H dernières de dimanche (les « hebdomadaires » ne sont pas envoyées deux
# fois : un dimanche est déjà dans les quotidiennes), et S jeux de secrets.
a_garder() {
  local nature=$1
  local rang=0 dim=0 nom date_nom
  while IFS= read -r nom; do
    rang=$(( rang + 1 ))
    if [ "$nature" = "secrets" ]; then
      [ "$rang" -le "$GARDER_PROTON_SECRETS" ] && echo "$nature/$nom"
      continue
    fi
    if [ "$rang" -le "$GARDER_PROTON_QUOTIDIENNES" ]; then echo "$nature/$nom"; continue; fi
    date_nom=${nom#amend-}; date_nom=${date_nom%%-*}
    if [ "$(date -d "$date_nom" +%u 2>/dev/null || echo 0)" = "7" ] && [ "$dim" -lt "$GARDER_PROTON_HEBDOMADAIRES" ]; then
      dim=$(( dim + 1 )); echo "$nature/$nom"
    fi
  done < <(grep "^$nature/" "$REGISTRE" | cut -d/ -f2- | sort -r)
}

if [ -n "$PROTON_RM" ]; then
  garder=$( { a_garder quotidiennes; a_garder secrets; } || true )
  : > "$DEST/.registre.neuf"
  while IFS= read -r ligne; do
    [ -n "$ligne" ] || continue
    if grep -qxF -- "$ligne" <<< "$garder"; then
      echo "$ligne" >> "$DEST/.registre.neuf"
    elif $PROTON_RM "$PROTON_DEST/$ligne" > "$DEST/.sortie" 2>&1; then
      journaliser "$ligne supprimé de Proton (rotation)"
    else
      echo "$ligne" >> "$DEST/.registre.neuf"
      echec "$ligne : suppression distante refusée ($(tail -n 1 "$DEST/.sortie" | cut -c1-200))"
    fi
  done < "$REGISTRE"
  mv "$DEST/.registre.neuf" "$REGISTRE"
fi

# ------------------------------------------------ 4. la rotation ici (le disque)
# Chaque archive est un instantané complet : en garder deux ici suffit, la
# vraie réserve est sur Proton. Les plus récentes restent, envoyées ou non.
for nature in quotidiennes secrets; do
  noms_de "$nature" | tail -n +$(( GARDER_LOCAL + 1 )) | while read -r vieux; do
    rm -f -- "$DEST/$nature/$vieux"
  done
done

# ------------------------------------------------------------------ 5. conclure
if [ "$echoue" -eq 0 ]; then
  date '+%Y-%m-%d %H:%M:%S' > "$DEST/dernier-succes-proton"
  rm -f "$DEST/dernier-echec-proton"
  # Pour le back-office (« Dernier envoi sur Proton : il y a N h »), écrit
  # comme `signaler` de sauvegarde-serveur.sh : fichier temporaire puis
  # renommage, et .tmp ignoré par l'archive.
  if [ -d "$DATA_DIR" ]; then
    printf '{"ts":%s}\n' "$(( $(date +%s) * 1000 ))" > "$DATA_DIR/sauvegarde-proton.json.tmp" \
      && mv "$DATA_DIR/sauvegarde-proton.json.tmp" "$DATA_DIR/sauvegarde-proton.json" \
      || journaliser "avertissement : le back-office n'a pas pu être prévenu"
  fi
  journaliser "terminé"
  echo "Sauvegarde du $horodatage envoyée sur Proton ($PROTON_DEST)"
fi
exit "$echoue"
