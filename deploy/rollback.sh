#!/usr/bin/env bash
# Switches back to an earlier release on the Hostinger VPS (OD-06, TD-73). Run as the poolx user:
#   rollback.sh            -> the newest release older than the active one
#   rollback.sh <dir-name> -> a specific release under /srv/poolx/releases (see `ls -t /srv/poolx/releases`)
# Code only: database migrations are forward-only and are never rolled back by this script (DEPLOYMENT_GUIDE.md).
set -euo pipefail

APP_DIR="${POOLX_APP_DIR:-/srv/poolx}"
HEALTH_URL="http://127.0.0.1:3000/api/health"
active=$(readlink -f "$APP_DIR/current")

if [ -n "${1:-}" ]; then
  target="$APP_DIR/releases/$1"
else
  target=""
  seen_active=no
  for dir in $(ls -1dt "$APP_DIR"/releases/*/); do
    dir=$(readlink -f "$dir")
    if [ "$seen_active" = yes ]; then target="$dir"; break; fi
    [ "$dir" = "$active" ] && seen_active=yes
  done
fi

[ -n "$target" ] && [ -d "$target" ] || { echo "no earlier release to roll back to" >&2; exit 1; }
[ "$(readlink -f "$target")" != "$active" ] || { echo "$target is already active" >&2; exit 1; }

ln -sfn "$target" "$APP_DIR/current.next"
mv -Tf "$APP_DIR/current.next" "$APP_DIR/current"
sudo /usr/bin/systemctl restart poolx

for _ in $(seq 1 30); do
  if curl --silent --fail --max-time 5 "$HEALTH_URL" >/dev/null; then
    echo "rolled back to $target (healthy)"
    echo "rollback $(basename "$target") $(date -u +%FT%TZ)" >>"$APP_DIR/deployments.log"
    exit 0
  fi
  sleep 2
done
echo "rolled back to $target but the health check is failing — see journalctl -u poolx" >&2
exit 1
