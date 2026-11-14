#!/bin/sh
# Calls one scheduled job on the local app (OD-06, TD-73). Run by /etc/cron.d/poolx as the poolx user.
#   poolx-cron.sh poolx|auctions|notifications
# The CRON_SECRET is read from the env file and passed to curl on stdin, so it never appears in `ps` or the crontab.
# flock skips a run while the previous run of the same job is still going.
set -eu

job="${1:-}"
case "$job" in
  poolx | auctions | notifications) ;;
  *)
    echo "usage: $0 poolx|auctions|notifications" >&2
    exit 2
    ;;
esac

env_file="${POOLX_ENV_FILE:-/etc/poolx/poolx.env}"
secret=$(sed -n 's/^CRON_SECRET=//p' "$env_file" | tail -n 1)
if [ -z "$secret" ]; then
  logger -t poolx-cron "job=$job error=CRON_SECRET not set"
  exit 1
fi

lock="/tmp/poolx-cron-$job.lock"
exec 9>"$lock"
if ! flock -n 9; then
  logger -t poolx-cron "job=$job skipped=previous run still active"
  exit 0
fi

# Response bodies contain counts only (no personal data), so they are safe to log.
if out=$(printf 'header = "Authorization: Bearer %s"\n' "$secret" |
  curl --config - --silent --show-error --fail --max-time 55 "http://127.0.0.1:3000/api/cron/$job" 2>&1); then
  logger -t poolx-cron "job=$job ok $out"
else
  logger -t poolx-cron -p user.err "job=$job failed $out"
  exit 1
fi
