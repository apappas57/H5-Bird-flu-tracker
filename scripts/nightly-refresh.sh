#!/bin/bash
# Nightly data refresh for birdflutracker.org, run from a residential IP.
# Builds site/data/** from the live sources, commits and pushes when it changed.
# Plain and portable on purpose: no notifier calls here. The launchd wrapper
# (run_job.sh) records the heartbeat and alerts on a non-zero exit.
#
# Usage: scripts/nightly-refresh.sh [--dry-run]
set -u
set -o pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOCK_DIR="${H5_LOCK_DIR:-$HOME/agency-engine/locks}"
LOCK="$LOCK_DIR/h5-build-push.lock"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

log() { printf '[refresh] %s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*"; }
fail() { log "FAIL: $*"; exit 1; }

mkdir -p "$LOCK_DIR"
if ! mkdir "$LOCK" 2>/dev/null; then
  # A lock older than 3 hours is a crashed run, not a running one.
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +180 2>/dev/null)" ]; then
    log "stale lock removed"; rmdir "$LOCK" || fail "could not remove stale lock"
    mkdir "$LOCK" || fail "could not take lock"
  else
    fail "another refresh is running (lock $LOCK)"
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

cd "$REPO" || fail "repo missing at $REPO"
[ "$(git branch --show-current)" = "${H5_ALLOW_BRANCH:-main}" ] || fail "not on ${H5_ALLOW_BRANCH:-main}"
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "working tree has uncommitted changes"

log "pull --ff-only"
git pull -q --ff-only origin main || fail "pull failed (network down, or main diverged)"

log "build"
if ! /usr/local/bin/node pipeline/build.mjs; then
  fail "build exited non-zero"
fi

if [ -z "$(git status --porcelain -- site/data)" ]; then
  log "no changes today"; exit 0
fi

# Never commit anything that looks like a credential, even by accident.
if git diff -- site/data | grep -qiE 'api[_-]?key|secret|token=|password'; then
  fail "staged data contains a secret-looking string; refusing to commit"
fi

if [ "$DRY_RUN" = "1" ]; then
  log "dry run: would commit $(git status --porcelain -- site/data | wc -l | tr -d ' ') file(s)"
  git checkout -q -- site/data
  exit 0
fi

git add -A site/data || fail "git add failed"
git commit -q -m "chore: daily data refresh (mac)" || fail "commit failed"
git push -q origin main || fail "push failed"
log "pushed $(git rev-parse --short HEAD)"
