#!/bin/bash
# =====================================================================
#  TSTV Camera Probe  (READ-ONLY)
#  Finds the Panasonic PTZ cameras on the studio network and records
#  what they will accept from a laptop. It only sends QUERY commands:
#  nothing moves, nothing is saved, no settings change.
#
#  Run:   bash tstv_camera_probe.sh
#  Or, if you already know the camera IPs (from the RP50 SYSTEM menu):
#         bash tstv_camera_probe.sh 192.168.0.10 192.168.0.11 192.168.0.12
#
#  Output: tstv_camera_probe_report.txt (next to this script)
# =====================================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
REPORT="$DIR/tstv_camera_probe_report.txt"
TMP="$(mktemp -d)"
: > "$REPORT"

log() { echo "$@" | tee -a "$REPORT"; }
hr()  { log "---------------------------------------------------------------"; }

# One HTTP GET. Prints: HTTP_CODE|BODY (body trimmed to one line)
get() {
  local url="$1" out code
  out="$(curl -s -m 3 -w $'\n%{http_code}' "$url" 2>/dev/null)"
  code="${out##*$'\n'}"
  out="${out%$'\n'*}"
  out="$(printf '%s' "$out" | tr '\r\n' '  ' | cut -c1-300)"
  printf '%s|%s' "${code:-000}" "$out"
}

log "TSTV CAMERA PROBE REPORT"
log "Run at: $(date)"
log "Computer: $(uname -sm)"
hr

# ---------------------------------------------------------------------
# 1. Network interfaces on this laptop
# ---------------------------------------------------------------------
log "1. THIS LAPTOP'S NETWORK"
SUBNETS=""
for IF in $(ifconfig -l 2>/dev/null); do
  IP="$(ifconfig "$IF" 2>/dev/null | awk '/inet /{print $2; exit}')"
  [ -z "$IP" ] && continue
  case "$IP" in 127.*) continue;; esac
  log "  $IF  ->  $IP"
  case "$IP" in
    169.254.*) log "     ^ self-assigned address: this port got no address from the studio network." ;;
    *) SUBNETS="$SUBNETS ${IP%.*}" ;;
  esac
done
log ""
log "Wi-Fi network: $(networksetup -getairportnetwork en0 2>/dev/null | sed 's/Current Wi-Fi Network: //')"
hr

# ---------------------------------------------------------------------
# 2. Find devices with a web server (cameras answer on port 80)
# ---------------------------------------------------------------------
log "2. SEARCHING FOR CAMERAS"
CANDIDATES=""
if [ $# -gt 0 ]; then
  CANDIDATES="$*"
  log "  Using IPs given on the command line: $CANDIDATES"
else
  SUBNETS="$(echo $SUBNETS | tr ' ' '\n' | sort -u)"
  if [ -z "$SUBNETS" ]; then
    log "  No usable network found. See the README steps for setting a manual IP."
  fi
  for S in $SUBNETS; do
    log "  Scanning $S.1-254 (about 20 seconds)..."
    seq 1 254 | xargs -P 64 -I{} sh -c \
      'c=$(curl -s -o /dev/null -m 1 -w "%{http_code}" "http://'"$S"'.{}/" 2>/dev/null); [ "$c" != "000" ] && echo "'"$S"'.{}"' \
      >> "$TMP/found.txt" 2>/dev/null
  done
  [ -f "$TMP/found.txt" ] && CANDIDATES="$(sort -t. -k4 -n -u "$TMP/found.txt" | tr '\n' ' ')"
  log "  Devices with a web server: ${CANDIDATES:-none}"
fi
log ""
log "  ARP table (every device this laptop has seen on the wire):"
arp -an 2>/dev/null | grep -v incomplete | sed 's/^/    /' | tee -a "$REPORT" >/dev/null
hr

# ---------------------------------------------------------------------
# 3. Query each device. Q... (aw_cam) and #... with no value (aw_ptz)
#    are query-only commands in Panasonic's protocol.
# ---------------------------------------------------------------------
PTZ_QUERIES="O:Power APC:Pan/Tilt_position GZ:Zoom_position GF:Focus_position GI:Iris_position D1:Focus_auto D3:Iris_auto S:Last_preset_recalled PE00:Presets_saved_1-40 PE01:Presets_saved_41-80 PE02:Presets_saved_81-100 UPVS:Preset_speed"
CAM_QUERIES="QID:Model QSV:Software_version QGU:Gain QAW:White_balance_mode QRI:R_gain QBI:B_gain QRS:R_pedestal QBS:B_pedestal QSH:Shutter_mode QTD:Detail QAF:Focus_mode QIR:Iris_mode"

log "3. DEVICE DETAILS"
CAMS=0
for IP in $CANDIDATES; do
  hr
  log "DEVICE $IP"
  R="$(get "http://$IP/")"
  log "  Web page: HTTP ${R%%|*}"
  HDR="$(curl -s -I -m 3 "http://$IP/" 2>/dev/null | grep -i -E '^(server|www-authenticate):' | tr -d '\r')"
  [ -n "$HDR" ] && log "  Headers: $HDR"
  TITLE="$(curl -s -m 3 "http://$IP/" 2>/dev/null | grep -i -o '<title>[^<]*' | head -1 | sed 's/^<[tT][iI][tT][lL][eE]>//')"
  [ -n "$TITLE" ] && log "  Page title: $TITLE"

  ID="$(get "http://$IP/cgi-bin/aw_cam?cmd=QID&res=1")"
  if [ "${ID%%|*}" = "404" ] || [ "${ID%%|*}" = "000" ]; then
    log "  -> Not a Panasonic camera (no camera control address). Could be the RP50, a switch, or something else."
    continue
  fi
  CAMS=$((CAMS+1))
  log "  -> Panasonic camera control address answered (HTTP ${ID%%|*}): ${ID#*|}"
  [ "${ID%%|*}" = "401" ] && log "  !! Camera asks for a username/password for control commands."

  log "  Camera settings (aw_cam):"
  for Q in $CAM_QUERIES; do
    R="$(get "http://$IP/cgi-bin/aw_cam?cmd=${Q%%:*}&res=1")"
    log "    $(printf '%-22s' "${Q#*:}") ${Q%%:*}  ->  HTTP ${R%%|*}  ${R#*|}"
    sleep 0.15
  done
  log "  Pan/tilt/lens (aw_ptz):"
  for Q in $PTZ_QUERIES; do
    R="$(get "http://$IP/cgi-bin/aw_ptz?cmd=%23${Q%%:*}&res=1")"
    log "    $(printf '%-22s' "${Q#*:}") #${Q%%:*}  ->  HTTP ${R%%|*}  ${R#*|}"
    sleep 0.15
  done
  R="$(get "http://$IP/cgi-bin/getinfo?FILE=1")"
  log "  Info file: HTTP ${R%%|*}  ${R#*|}"
  R="$(get "http://$IP/cgi-bin/model_serial")"
  log "  Model/serial: HTTP ${R%%|*}  ${R#*|}"
done
hr
log "SUMMARY: found $CAMS Panasonic camera(s)."
[ "$CAMS" -eq 0 ] && log "If 0: check the cable is in the same network switch as the RP50, and see the README for setting a manual IP."
log "Report saved to: $REPORT"
rm -rf "$TMP"
