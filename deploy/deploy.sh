#!/usr/bin/env bash
# Builds and activates one release on the Hostinger VPS (OD-06, TD-73). Run as the poolx user:
#   /srv/poolx/current/deploy/deploy.sh <git-ref>        e.g. master, v1.0.0, or a commit sha
# (first deploy: run it from a checkout, e.g. `git --git-dir=/srv/poolx/repo.git show master:deploy/deploy.sh | bash -s master`)
#
# Steps: export the ref from the bare repo -> install -> build -> launch check -> switch symlink -> restart -> health
# check -> automatic rollback to the previous release if the new one is not healthy. Database migrations are NOT run
# here: apply them first with `supabase db push` (DEPLOYMENT_GUIDE.md), and keep them compatible with the running release.
set -euo pipefail

APP_DIR="${POOLX_APP_DIR:-/srv/poolx}"
REPO="$APP_DIR/repo.git"
ENV_FILE="${POOLX_ENV_FILE:-/etc/poolx/poolx.env}"
KEEP_RELEASES=5
HEALTH_URL="http://127.0.0.1:3000/api/health"

ref="${1:?usage: deploy.sh <git-ref> [--skip-launch-check]}"
skip_launch_check="${2:-}"

log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

[ -r "$ENV_FILE" ] || { log "env file $ENV_FILE missing or unreadable"; exit 1; }

# A bare repo you push to over SSH (`git push vps master`); fetch too if it has an origin remote.
if git --git-dir="$REPO" remote get-url origin >/dev/null 2>&1; then
  git --git-dir="$REPO" fetch --quiet --tags origin '+refs/heads/*:refs/heads/*'
fi
sha=$(git --git-dir="$REPO" rev-parse --verify --quiet "${ref}^{commit}") || { log "unknown ref: $ref"; exit 1; }
release="$APP_DIR/releases/$(date -u +%Y%m%d%H%M%S)-${sha:0:12}"

log "building $ref ($sha) in $release"
mkdir -p "$release"
git --git-dir="$REPO" archive "$sha" | tar -x -C "$release"
ln -s "$ENV_FILE" "$release/.env.production.local"
cd "$release"

pnpm install --frozen-lockfile --prefer-offline
NEXT_DEPLOYMENT_ID="$sha" NEXT_TELEMETRY_DISABLED=1 pnpm build

if [ "$skip_launch_check" = "--skip-launch-check" ]; then
  # Allowed for staging only: production must pass every launch check (TD-71).
  log "WARNING: launch check skipped"
else
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file="$ENV_FILE" scripts/launch-check.mts
fi

previous=$(readlink -f "$APP_DIR/current" 2>/dev/null || true)
ln -sfn "$release" "$APP_DIR/current.next"
mv -Tf "$APP_DIR/current.next" "$APP_DIR/current"
log "activated; restarting"
sudo /usr/bin/systemctl restart poolx

healthy=no
for _ in $(seq 1 30); do
  if curl --silent --fail --max-time 5 "$HEALTH_URL" >/dev/null; then healthy=yes; break; fi
  sleep 2
done

if [ "$healthy" != yes ]; then
  log "health check failed"
  if [ -n "$previous" ] && [ -d "$previous" ]; then
    ln -sfn "$previous" "$APP_DIR/current.next"
    mv -Tf "$APP_DIR/current.next" "$APP_DIR/current"
    sudo /usr/bin/systemctl restart poolx
    log "rolled back to $previous"
  fi
  exit 1
fi

log "healthy: $sha is live"
echo "$sha $(date -u +%FT%TZ) $ref" >>"$APP_DIR/deployments.log"

# Keep the newest releases (never the active one).
active=$(readlink -f "$APP_DIR/current")
ls -1dt "$APP_DIR"/releases/*/ | tail -n +"$((KEEP_RELEASES + 1))" | while read -r old; do
  [ "$(readlink -f "$old")" = "$active" ] || rm -rf "$old"
done
