#!/usr/bin/env bash
# Les contrôles d'une fenêtre calme (protocole de test global, claude/
# protocole-test-global.md, §2.2). À lancer SUR LE VPS, en SSH, par Sylvain :
#
#   cd /opt/amend/app && tools/fenetre-calme.sh avant --ip 203.0.113.7
#   ... la nuit de test ...
#   tools/fenetre-calme.sh apres
#
# « avant » : personne d'autre n'est là, le service est stable, il y a la
# place pour une copie de data/ — puis relevé de l'état de repos et copie.
# « apres » : même relevé, comparé au « avant » le plus récent : la machine
# est-elle revenue à son état de repos (scénario C16) ?
#
# Ne démarre, n'arrête et ne supprime rien : il lit, il copie, il compare.
# Les procès-verbaux vont dans tests/campagne/ (à garder avec les CSV).
#
# Variables : APP (/opt/amend/app), DATA (/opt/amend/data), SERVICE (amend),
# PORT (8787), IP_BANC (« --ip » : adresses publiques du banc et de Sylvain,
# séparées par des virgules — leurs connexions ne comptent pas comme étrangères).

set -u
APP="${APP:-/opt/amend/app}"
DATA="${DATA:-/opt/amend/data}"
SERVICE="${SERVICE:-amend}"
PORT="${PORT:-8787}"
IP_BANC="${IP_BANC:-}"
PV_DIR="${PV_DIR:-$APP/tests/campagne}"

mode="${1:-}"
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --ip) IP_BANC="$2"; shift 2 ;;
    --sans-copie) SANS_COPIE=1; shift ;;
    *) echo "Option inconnue : $1" >&2; exit 64 ;;
  esac
done
SANS_COPIE="${SANS_COPIE:-0}"
[ "$mode" = "avant" ] || [ "$mode" = "apres" ] || { sed -n '2,20p' "$0"; exit 64; }

mkdir -p "$PV_DIR"
horodatage="$(date +%Y%m%d-%H%M%S)"
pv="$PV_DIR/$horodatage-$mode.txt"
rouge=0

dire() { echo "$*" | tee -a "$pv"; }
ok()   { dire "  [ok]      $*"; }
alerte() { dire "  [ALERTE]  $*"; rouge=$((rouge + 1)); }
note() { dire "  [note]    $*"; }

pid_service() { systemctl show "$SERVICE" -p MainPID --value 2>/dev/null | grep -v '^0$' || pgrep -f 'node.*server/server.js' | head -1; }

releve() {
  local pid; pid="$(pid_service)"
  echo "pid=${pid:-?}"
  echo "commit=$(git -C "$APP" log --oneline -1 2>/dev/null | cut -c1-60)"
  echo "node=$(node -v 2>/dev/null)"
  echo "memoire_libre_mo=$(free -m 2>/dev/null | awk '/^Mem:/ {print $7}')"
  echo "swap_utilise_mo=$(free -m 2>/dev/null | awk '/^Swap:/ {print $3}')"
  echo "service_memoire_mo=$(( $(systemctl show "$SERVICE" -p MemoryCurrent --value 2>/dev/null | grep -E '^[0-9]+$' || echo 0) / 1048576 ))"
  echo "descripteurs=$( [ -n "${pid:-}" ] && ls "/proc/$pid/fd" 2>/dev/null | wc -l || echo '?')"
  echo "tmp_dans_data=$(find "$DATA" -name '*.tmp' 2>/dev/null | wc -l)"
  echo "data_ko=$(du -sk "$DATA" 2>/dev/null | cut -f1)"
  echo "data_fichiers=$(find "$DATA" -type f 2>/dev/null | wc -l)"
  echo "disque_libre_ko=$(df -k --output=avail "$DATA" 2>/dev/null | tail -1 | tr -d ' ')"
  echo "redemarrages_service=$(systemctl show "$SERVICE" -p NRestarts --value 2>/dev/null)"
  echo "uptime_service_s=$(ps -o etimes= -p "${pid:-0}" 2>/dev/null | tr -d ' ')"
  echo "erreurs_journal_1h=$(journalctl -u "$SERVICE" --since '-1h' -p err --no-pager -q 2>/dev/null | wc -l)"
}

dire "== fenêtre calme — $mode — $(date '+%F %T') =="

if [ "$mode" = "avant" ]; then
  dire ""
  dire "1. Personne d'autre n'est là"
  # Les adresses distantes des connexions établies sur 443 (Caddy), sans celles du banc.
  autres="$(ss -Htn state established "( sport = :443 )" 2>/dev/null | awk '{print $4}' | sed -E 's/:[0-9]+$//; s/^\[(.*)\]$/\1/' | sort -u | grep -vxF -f <(echo "$IP_BANC" | tr ',' '\n' | sed '/^$/d' ; echo none) || true)"
  if [ -z "$autres" ]; then ok "aucune connexion établie sur 443 en dehors de $IP_BANC"; else alerte "connexions de : $(echo $autres | tr '\n' ' ')"; fi
  if command -v journalctl >/dev/null; then
    c="$(journalctl -u caddy --since '-15min' --no-pager -q 2>/dev/null | grep -oE '"remote_ip":"[^"]+"' | sort -u | grep -vF -f <(echo "$IP_BANC" | tr ',' '\n' | sed '/^$/d' | sed 's/.*/"remote_ip":"&"/' ; echo none) || true)"
    if [ -z "$c" ]; then note "journal de Caddy : aucune IP étrangère dans les 15 dernières minutes (ou pas de journal d'accès activé)"; else alerte "Caddy a servi : $(echo $c | tr '\n' ' ')"; fi
  fi

  dire ""
  dire "2. Le service est stable"
  up="$(ps -o etimes= -p "$(pid_service)" 2>/dev/null | tr -d ' ')"
  if [ -n "${up:-}" ] && [ "$up" -gt 3600 ]; then ok "actif depuis $((up / 60)) min"; else note "actif depuis ${up:-?} s (moins d'une heure : la mémoire n'est pas à son régime)"; fi
  [ "$(systemctl is-active "$SERVICE" 2>/dev/null)" = "active" ] && ok "systemctl : active" || alerte "systemctl ne dit pas « active »"
  libre="$(free -m | awk '/^Mem:/ {print $7}')"
  [ "${libre:-0}" -gt 300 ] && ok "${libre} Mo de mémoire disponible" || alerte "seulement ${libre:-?} Mo de mémoire disponible"

  dire ""
  dire "3. Il y a la place pour une copie de data/"
  need=$(( $(du -sk "$DATA" | cut -f1) * 2 ))
  have="$(df -k --output=avail "$DATA" | tail -1 | tr -d ' ')"
  if [ "$have" -gt "$need" ]; then ok "$((have / 1024)) Mo libres pour $((need / 2048)) Mo de données"; else alerte "disque trop juste ($((have / 1024)) Mo libres)"; fi

  dire ""
  dire "4. Rappels (à vérifier à la main)"
  note "une sauvegarde du NAS de moins d'une heure, dont l'archive s'ouvre (tirer-sauvegarde.sh)"
  note "les connecteurs MCP des invités ne tournent pas cette nuit"
  note "le plafond de dépense Anthropic est posé ; budget des appels réels : 40 appels, 10 courriels"

  dire ""
  dire "5. Copie de data/ sur la machine"
  if [ "$SANS_COPIE" = "1" ]; then note "copie sautée (--sans-copie)"
  elif [ "$rouge" -gt 0 ]; then note "copie non faite : corrigez les alertes d'abord"
  else
    cible="$DATA.bak-$(date +%Y%m%d-%H%M)"
    if cp -a "$DATA" "$cible"; then ok "copie dans $cible (à supprimer après la campagne)"; else alerte "la copie a échoué"; fi
  fi
fi

dire ""
dire "État de repos"
releve | sed 's/^/    /' | tee -a "$pv" >/dev/null
releve | sed 's/^/    /'

if [ "$mode" = "apres" ]; then
  avant="$(ls -1t "$PV_DIR"/*-avant.txt 2>/dev/null | head -1)"
  dire ""
  if [ -z "$avant" ]; then
    alerte "aucun relevé « avant » à comparer dans $PV_DIR"
  else
    dire "Comparaison avec $(basename "$avant")"
    val() { grep -E "^    $2=" "$1" | head -1 | cut -d= -f2; }
    for cle in descripteurs tmp_dans_data redemarrages_service; do
      a="$(val "$avant" "$cle")"; b="$(releve | grep -E "^$cle=" | cut -d= -f2)"
      if [ "${a:-}" = "${b:-}" ]; then ok "$cle inchangé ($b)"; else alerte "$cle : $a → $b"; fi
    done
    a="$(val "$avant" service_memoire_mo)"; b="$(releve | grep -E '^service_memoire_mo=' | cut -d= -f2)"
    if [ -n "${a:-}" ] && [ -n "${b:-}" ] && [ "$b" -le $(( a + 60 )) ]; then ok "mémoire du service : $a → $b Mo (+60 Mo tolérés)"; else alerte "mémoire du service : ${a:-?} → ${b:-?} Mo"; fi
    a="$(val "$avant" data_ko)"; b="$(releve | grep -E '^data_ko=' | cut -d= -f2)"
    note "data/ : $((a / 1024)) → $((b / 1024)) Mo (les documents de test sont encore là : à supprimer à la main)"
    a="$(val "$avant" pid)"; b="$(releve | grep -E '^pid=' | cut -d= -f2)"
    [ "$a" = "$b" ] && ok "même processus ($b)" || note "le service a changé de processus ($a → $b) : attendu après le scénario C7, sinon à expliquer"
  fi
fi

dire ""
if [ "$rouge" -eq 0 ]; then dire "→ tout est vert."; else dire "→ $rouge alerte(s) : voir ci-dessus."; fi
dire "Procès-verbal : $pv"
exit $(( rouge > 0 ? 1 : 0 ))
