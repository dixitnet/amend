#!/bin/bash
# Côté PRODUCTION : ce que la machine de sauvegarde a le droit de tirer.
#
# Ce script n'est jamais lancé à la main ni par un timer du VPS. Il est la
# « commande forcée » d'une clé SSH réservée à la sauvegarde : quoi que la
# machine qui se connecte demande, elle n'obtient que l'un des deux flux
# ci-dessous, et rien d'autre (pas de shell, pas de redirection de port).
# Voir deploy/SAUVEGARDE.md pour la mise en place.
#
#   ssh ... donnees   → data/ en tar.gz (documents, images, comptes, journaux)
#   ssh ... secrets   → .env, Caddyfile, unité systemd, en tar.gz
#   ssh ... signaler  → note l'heure de la dernière copie réussie dans
#                       data/sauvegarde-distante.json, que le back-office
#                       affiche : l'arrêt silencieux d'une sauvegarde
#                       devient visible là où l'on regarde déjà
#
# Les secrets sont séparés des données : ils n'ont pas la même durée de vie,
# ni le même dossier, ni les mêmes droits chez le destinataire.
set -uo pipefail

DATA_DIR="${AMEND_DATA_DIR:-/opt/amend/data}"
APP_DIR="${AMEND_APP_DIR:-/opt/amend/app}"

commande="${SSH_ORIGINAL_COMMAND:-${1:-}}"

# Copier à chaud suffit (voir claude/conception-sauvegarde.md) : les
# registres sont écrits atomiquement, les journaux sont en ajout seul. Le
# code de sortie 1 de tar veut dire « un fichier a changé pendant la
# lecture » — c'est la vie d'un dossier vivant, pas une erreur.
tolerer_changement() {
  local code=$1
  if [ "$code" -eq 1 ]; then return 0; fi
  return "$code"
}

case "$commande" in
  donnees)
    # Le dossier s'appelle `data` : l'archive se déplie à côté de lui
    # (`tar xzf … -C /opt/amend`), comme celle du back-office.
    tar czf - --exclude='*.tmp' -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"
    tolerer_changement $?
    ;;
  secrets)
    # Chemins relatifs à `/` : `tar xzf … -C /` remet chaque fichier à sa
    # place. Un fichier absent ou illisible est signalé sur stderr et
    # écarté — mieux vaut une sauvegarde incomplète qui le dit que pas de
    # sauvegarde du tout.
    fichiers=()
    for f in "$APP_DIR/.env" /etc/caddy/Caddyfile /etc/systemd/system/amend.service; do
      if [ -r "$f" ]; then
        fichiers+=("${f#/}")
      else
        echo "sauvegarde-serveur : $f absent ou illisible, ignoré" >&2
      fi
    done
    if [ ${#fichiers[@]} -eq 0 ]; then
      echo "sauvegarde-serveur : aucun fichier de configuration lisible" >&2
      exit 3
    fi
    tar czf - -C / "${fichiers[@]}"
    tolerer_changement $?
    ;;
  signaler)
    # Écriture atomique (fichier temporaire puis renommage) : le back-office
    # ne lit jamais un fichier à moitié écrit, et l'archive ignore les .tmp.
    printf '{"ts":%s}\n' "$(( $(date +%s) * 1000 ))" > "$DATA_DIR/sauvegarde-distante.json.tmp" \
      && mv "$DATA_DIR/sauvegarde-distante.json.tmp" "$DATA_DIR/sauvegarde-distante.json"
    ;;
  *)
    echo "sauvegarde-serveur : commande inconnue (attendu : donnees | secrets | signaler)" >&2
    exit 2
    ;;
esac
