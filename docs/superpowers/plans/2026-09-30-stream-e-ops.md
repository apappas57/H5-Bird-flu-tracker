# Stream E: Ops (runner, verify-only deploys, freshness canary, analytics) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the data pipeline to a nightly job on Alex's Mac (residential IP), make Vercel deploys verify-only, and alert on stale or failed data from the live site, so the tracker can never again serve two-month-old data behind a green badge.

**Architecture:** A plain shell script in the repo runs the build, commits `site/data/**` and pushes; launchd runs it nightly through agency-engine's `run_job.sh` wrapper, which owns heartbeats and failure alerts. A Python canary in agency-engine reads the live `summary.json`, evaluates pure rules against a small state file, records health, and alerts through `notify_durable`. CI and Vercel stop fetching live sources; Vercel runs `build.mjs --verify` on committed data.

**Tech Stack:** bash, launchd (plist through `~/agency-engine/run_job.sh`), Python 3 (`/usr/local/bin/python3`, `unittest`), Node 20+ (`/usr/local/bin/node`), GitHub Actions, Vercel (`vercel.json`), ntfy via `~/agency-engine/notify.py`.

**Spec:** `docs/superpowers/specs/2026-09-30-map-first-rebuild-design.md`, sections 4.1 to 4.4, 4.3, and the E row of section 8.

## Global Constraints

- Everything that fetches `agriculture.gov.au` runs from the Mac; cloud runs may fall back but must never regress data (spec 4.1).
- Job scripts stay plain and portable: no notifier calls inside them; `run_job.sh` does heartbeats and failure alerts (spec 4.4).
- Python jobs use `/usr/local/bin/python3`; node jobs use `/usr/local/bin/node`; PATH in plists is `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin` (spec 4.4).
- Gather every network result before any `agency.db` write; never inside a transaction (spec 4.4).
- Alerts: `logs/alerts.log`, then ntfy, then the macOS banner last; dedup once per day per `dedup_key` (spec 4.4).
- Every loaded launchd job is registered in `~/agency-engine/health_registry.py` and listed in `~/.claude/status/operating-cadence.md` (spec 4.4).
- No em dashes in any file this plan creates.
- Interfaces consumed from stream A: `node pipeline/build.mjs --verify` exits 0 when `site/data/**` is valid and 1 otherwise, fetching nothing; `summary.json` carries `freshness.generated_at` (ISO), `freshness.sources[key].status` in `ok|error|restored`, `official_au.as_at` (ISO) and `placement_stats.unplaced` (integer). Until stream A lands, `--verify` is absent and Task 5 must not be merged; Tasks 1 to 4 and 6 do not depend on it.
- Interface consumed from stream D: if `site/assets/three/birds.js` exists, CI rebuilds the bundle and fails on a diff (Task 5 guards on file existence).
- Interface consumed from stream B: `site/sitemap.xml` exists before Task 6 submits it.

---

## File structure

| File | Responsibility |
| --- | --- |
| `scripts/nightly-refresh.sh` (new, repo) | Lock, fast-forward pull, build, commit `site/data/**`, push. Exit 1 on failure. `--dry-run` does everything but commit and push. |
| `~/Library/LaunchAgents/com.alex.h5-build-push.plist` (new) | Nightly 19:45 local through `run_job.sh`. |
| `~/agency-engine/canary_birdflu_freshness.py` (new) | Fetch live summary, evaluate rules, record health, alert. `evaluate()` is pure and unit-tested. |
| `~/agency-engine/tests/test_canary_birdflu_freshness.py` (new) | Unit tests for `evaluate()` and the state-file streak logic. |
| `~/agency-engine/data/birdflu_canary_state.json` (created at runtime) | `{"error_streak": {"<source>": n}, "xlsx_404_streak": n, "last_run": ISO}`. |
| `~/Library/LaunchAgents/com.alex.birdflu-freshness-canary.plist` (new) | Daily 08:30 local through `run_job.sh`. |
| `~/agency-engine/health_registry.py` (append two dicts) | Doctor registration for both jobs. |
| `~/.claude/status/operating-cadence.md` (two rows) | Job inventory. |
| `vercel.json` (modify `buildCommand`) | Verify-only builds. |
| `.github/workflows/refresh.yml` (modify) | `npm ci`, commit every data file, never `--amend`. |
| `.github/workflows/ci.yml` (modify) | Tests and verify on committed data; no live fetch; bundle check when present. |
| `docs/STATUS.md` (modify) | Runtime and monitoring described. |

---

### Task 1: The nightly refresh script

**Files:**
- Create: `scripts/nightly-refresh.sh`
- Test: shell syntax check plus a dry run

**Interfaces:**
- Consumes: `node pipeline/build.mjs` (existing), git over HTTPS with the macOS keychain helper (already configured, `gh auth status` shows the token in the keyring).
- Produces: exit code 0 on "pushed" or "no changes", 1 on any failure; log lines prefixed `[refresh]`.

- [ ] **Step 1: Write the script**

```bash
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
[ "$(git branch --show-current)" = "main" ] || fail "not on main"
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
```

- [ ] **Step 2: Make it executable and syntax-check it**

Run: `chmod +x scripts/nightly-refresh.sh && bash -n scripts/nightly-refresh.sh && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 3: Dry run from the repo**

Run: `H5_LOCK_DIR=/tmp/h5locks scripts/nightly-refresh.sh --dry-run; echo "exit $?"`
Expected: `[refresh] ... pull --ff-only`, `[refresh] ... build`, then either `no changes today` or `dry run: would commit N file(s)`, and `exit 0`. `git status --porcelain -- site/data` prints nothing afterwards.

- [ ] **Step 4: Prove the lock works**

Run: `mkdir -p /tmp/h5locks/h5-build-push.lock && H5_LOCK_DIR=/tmp/h5locks scripts/nightly-refresh.sh --dry-run; echo "exit $?"; rmdir /tmp/h5locks/h5-build-push.lock`
Expected: `[refresh] ... FAIL: another refresh is running`, `exit 1`.

- [ ] **Step 5: Commit**

```bash
git add scripts/nightly-refresh.sh
git commit -m "ops: nightly refresh script for the residential runner"
```

---

### Task 2: The launchd job for the nightly refresh

**Files:**
- Create: `~/Library/LaunchAgents/com.alex.h5-build-push.plist`
- Read first: `~/agency-engine/run_job.sh` (argument order), `~/Library/LaunchAgents/com.alex.lead-canary.plist` (template)

**Interfaces:**
- Consumes: `scripts/nightly-refresh.sh` from Task 1; `run_job.sh` convention `ProgramArguments = [run_job.sh, <label>, <interpreter>, <script>, <args...>]`.
- Produces: heartbeat `~/agency-engine/data/heartbeats/h5-build-push.json` written by the wrapper; logs `~/agency-engine/logs/launchd_h5_build_push.{stdout,stderr}.log`.

- [ ] **Step 1: Confirm the wrapper's argument order**

Run: `head -40 ~/agency-engine/run_job.sh`
Expected: the header comment or the first assignments show label, interpreter, script, then args. If the order differs from the convention above, use the order the file shows in Step 2.

- [ ] **Step 2: Write the plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.alex.h5-build-push</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/Alex/agency-engine/run_job.sh</string>
    <string>h5-build-push</string>
    <string>/bin/bash</string>
    <string>/Users/Alex/dev/h5-bird-flu-tracker/scripts/nightly-refresh.sh</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/Alex/dev/h5-bird-flu-tracker</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>/Users/Alex</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>19</integer>
    <key>Minute</key><integer>45</integer>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>/Users/Alex/agency-engine/logs/launchd_h5_build_push.stdout.log</string>
  <key>StandardErrorPath</key><string>/Users/Alex/agency-engine/logs/launchd_h5_build_push.stderr.log</string>
</dict>
</plist>
```

- [ ] **Step 3: Lint and load**

Run: `plutil -lint ~/Library/LaunchAgents/com.alex.h5-build-push.plist && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.alex.h5-build-push.plist && launchctl print gui/$(id -u)/com.alex.h5-build-push | grep -E "state|program|last exit"`
Expected: `OK` from plutil, no error from bootstrap, and the print shows the program path and `state = waiting`.

- [ ] **Step 4: Kick it once by hand and read the log**

Run: `launchctl kickstart gui/$(id -u)/com.alex.h5-build-push; sleep 120; tail -5 ~/agency-engine/logs/launchd_h5_build_push.stdout.log; cat ~/agency-engine/data/heartbeats/h5-build-push.json`
Expected: `[refresh]` lines ending in `no changes today` or `pushed <sha>`, and a heartbeat JSON with a recent timestamp. If the run pushed, `git -C ~/dev/h5-bird-flu-tracker log --oneline -1` shows `chore: daily data refresh (mac)`.

- [ ] **Step 5: Record it**

No repo commit (the plist lives outside the repo). Add the row to `~/.claude/status/operating-cadence.md` in Task 4.

---

### Task 3: The freshness canary

**Files:**
- Create: `~/agency-engine/canary_birdflu_freshness.py`
- Create: `~/agency-engine/tests/test_canary_birdflu_freshness.py`
- Read first: `~/agency-engine/canary_contact_form.py` (the model), `~/agency-engine/notify.py` (`notify_durable` signature), `~/agency-engine/ingest_validate.py` (`record_run`), `~/agency-engine/db.py` (`record_ingest_health`, around line 288).

**Interfaces:**
- Consumes: live `https://www.birdflutracker.org/data/summary.json` with `freshness.generated_at`, `freshness.sources`, `official_au.as_at`, `official_au.dataset_url`, `placement_stats.unplaced` (stream A). Until stream A ships, the canary tolerates missing keys: a missing `freshness` block is itself a finding ("summary has no freshness block").
- Produces: exit 0 healthy, 1 failure; `ingest_runs` and `ingest_health` rows for script `canary_birdflu_freshness`, client `birdflu`; ntfy with `dedup_key="birdflu-freshness"`.

- [ ] **Step 1: Write the failing tests**

```python
#!/usr/bin/env python3
"""Tests for canary_birdflu_freshness.evaluate(): pure rules, no network."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import canary_birdflu_freshness as c  # noqa: E402

NOW = datetime(2026, 10, 2, 8, 30, tzinfo=timezone.utc)


def summary(**over):
    base = {
        "freshness": {
            "generated_at": (NOW - timedelta(hours=12)).isoformat(),
            "sources": {"daff-events": {"status": "ok"}, "daff-latest": {"status": "ok"},
                        "daff-updates": {"status": "ok"}, "fao-au": {"status": "ok"}},
        },
        "official_au": {"as_at": (NOW - timedelta(days=1)).isoformat(),
                        "dataset_url": "https://example.test/H5.xlsx"},
        "placement_stats": {"unplaced": 0},
    }
    for k, v in over.items():
        base[k] = v
    return base


class EvaluateTests(unittest.TestCase):
    def test_healthy_summary_has_no_findings(self):
        findings, state = c.evaluate(summary(), {}, NOW, xlsx_status=200)
        self.assertEqual(findings, [])
        self.assertEqual(state["error_streak"], {})

    def test_stale_generated_at(self):
        s = summary()
        s["freshness"]["generated_at"] = (NOW - timedelta(hours=40)).isoformat()
        findings, _ = c.evaluate(s, {}, NOW, xlsx_status=200)
        self.assertTrue(any("generated_at" in f for f in findings))

    def test_old_official_as_at(self):
        s = summary()
        s["official_au"]["as_at"] = (NOW - timedelta(days=5)).isoformat()
        findings, _ = c.evaluate(s, {}, NOW, xlsx_status=200)
        self.assertTrue(any("as_at" in f for f in findings))

    def test_as_at_three_days_is_fine(self):
        s = summary()
        s["official_au"]["as_at"] = (NOW - timedelta(days=3)).isoformat()
        findings, _ = c.evaluate(s, {}, NOW, xlsx_status=200)
        self.assertEqual(findings, [])

    def test_source_error_alerts_only_on_second_day(self):
        s = summary()
        s["freshness"]["sources"]["daff-events"]["status"] = "error"
        f1, st1 = c.evaluate(s, {}, NOW, xlsx_status=200)
        self.assertEqual(f1, [])
        self.assertEqual(st1["error_streak"]["daff-events"], 1)
        f2, st2 = c.evaluate(s, st1, NOW + timedelta(days=1), xlsx_status=200)
        self.assertTrue(any("daff-events" in f for f in f2))
        self.assertEqual(st2["error_streak"]["daff-events"], 2)

    def test_source_recovery_resets_streak(self):
        st = {"error_streak": {"daff-events": 1}}
        _, st2 = c.evaluate(summary(), st, NOW, xlsx_status=200)
        self.assertEqual(st2["error_streak"], {})

    def test_xlsx_404_alerts_only_on_second_day(self):
        f1, st1 = c.evaluate(summary(), {}, NOW, xlsx_status=404)
        self.assertEqual(f1, [])
        f2, _ = c.evaluate(summary(), st1, NOW + timedelta(days=1), xlsx_status=404)
        self.assertTrue(any("spreadsheet" in f for f in f2))

    def test_unplaced_records_alert(self):
        findings, _ = c.evaluate(summary(placement_stats={"unplaced": 2}), {}, NOW, xlsx_status=200)
        self.assertTrue(any("unplaced" in f for f in findings))

    def test_missing_freshness_block_is_a_finding(self):
        s = summary(); del s["freshness"]
        findings, _ = c.evaluate(s, {}, NOW, xlsx_status=200)
        self.assertTrue(any("freshness" in f for f in findings))


class StateFileTests(unittest.TestCase):
    def test_round_trip(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "state.json")
            self.assertEqual(c.load_state(p), {})
            c.save_state(p, {"error_streak": {"x": 1}})
            self.assertEqual(json.load(open(p))["error_streak"], {"x": 1})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd ~/agency-engine && /usr/local/bin/python3 -m unittest tests.test_canary_birdflu_freshness -v 2>&1 | tail -3`
Expected: `ModuleNotFoundError: No module named 'canary_birdflu_freshness'`

- [ ] **Step 3: Write the canary**

```python
#!/usr/bin/env python3
"""Freshness canary for birdflutracker.org.

Guards the silent failure that bit the tracker in August to September 2026:
a green daily job serving two-month-old data. It judges the OUTCOME (the live
summary.json), not the job. Alerts through ntfy when:

  - freshness.generated_at is older than 36 hours
  - official_au.as_at is older than 4 days (the department skips some weekends)
  - a DAFF source reports status "error" on two consecutive runs
  - the official spreadsheet URL is not HTTP 200 on two consecutive runs
  - placement_stats.unplaced is above zero
  - the summary has no freshness block at all

Usage:
  canary_birdflu_freshness.py            probe, record, alert
  canary_birdflu_freshness.py --dry-run  probe and print only
"""
import argparse
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

SUMMARY_URL = "https://www.birdflutracker.org/data/summary.json"
STATE_PATH = os.path.join(HERE, "data", "birdflu_canary_state.json")
SCRIPT = "canary_birdflu_freshness"
CLIENT = "birdflu"
UA = "Mozilla/5.0 (Macintosh) gw-canary/1.0"
MAX_AGE_HOURS = 36
MAX_AS_AT_DAYS = 4
DAFF_SOURCES = ("daff-events", "daff-latest", "daff-updates")


def parse_iso(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def load_state(path):
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def save_state(path, state):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(state, fh, indent=2)
    os.replace(tmp, path)


def evaluate(summary, state, now, xlsx_status):
    """Pure. Returns (findings: list[str], new_state: dict)."""
    findings = []
    streak = dict((state or {}).get("error_streak", {}))
    xlsx_streak = int((state or {}).get("xlsx_404_streak", 0))

    fresh = summary.get("freshness")
    if not isinstance(fresh, dict):
        findings.append("summary has no freshness block")
        fresh = {}

    gen = parse_iso(fresh.get("generated_at"))
    if gen is None:
        if fresh:
            findings.append("freshness.generated_at missing or unparseable")
    elif now - gen > timedelta(hours=MAX_AGE_HOURS):
        findings.append("freshness.generated_at is %.0f hours old" % ((now - gen).total_seconds() / 3600))

    official = summary.get("official_au") or {}
    as_at = parse_iso(official.get("as_at"))
    if as_at is None:
        findings.append("official_au.as_at missing or unparseable")
    elif now - as_at > timedelta(days=MAX_AS_AT_DAYS):
        findings.append("official_au.as_at is %d days old" % (now - as_at).days)

    sources = fresh.get("sources") or {}
    for key in DAFF_SOURCES:
        status = (sources.get(key) or {}).get("status")
        if status == "error":
            streak[key] = streak.get(key, 0) + 1
            if streak[key] >= 2:
                findings.append("%s in error for %d consecutive runs" % (key, streak[key]))
        else:
            streak.pop(key, None)

    if xlsx_status != 200:
        xlsx_streak += 1
        if xlsx_streak >= 2:
            findings.append("official spreadsheet returned HTTP %s for %d consecutive runs" % (xlsx_status, xlsx_streak))
    else:
        xlsx_streak = 0

    unplaced = (summary.get("placement_stats") or {}).get("unplaced", 0)
    if unplaced:
        findings.append("%d official records are unplaced" % unplaced)

    new_state = {"error_streak": streak, "xlsx_404_streak": xlsx_streak, "last_run": now.isoformat()}
    return findings, new_state


def fetch_json(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def head_status(url, timeout=30):
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status
    except urllib.error.HTTPError as err:
        return err.code
    except (urllib.error.URLError, OSError):
        return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="probe and print, no record, no alert")
    args = ap.parse_args()
    now = datetime.now(timezone.utc)

    # Gather every network input first. Nothing below touches the database
    # until all fetches are done (never inside a transaction).
    try:
        summary = fetch_json(SUMMARY_URL)
        fetch_error = None
    except Exception as err:  # noqa: BLE001
        summary, fetch_error = {}, "%s: %s" % (type(err).__name__, err)
    xlsx_url = (summary.get("official_au") or {}).get("dataset_url") or \
        "https://www.agriculture.gov.au/sites/default/files/documents/H5_bird_flu_events.xlsx"
    xlsx_status = head_status(xlsx_url)

    state = load_state(STATE_PATH)
    findings, new_state = evaluate(summary, state, now, xlsx_status)
    if fetch_error:
        findings.insert(0, "could not fetch live summary: " + fetch_error)

    for line in findings or ["healthy"]:
        print("[birdflu-canary] " + line)

    if args.dry_run:
        return 1 if findings else 0

    save_state(STATE_PATH, new_state)

    import ingest_validate as iv  # noqa: E402
    import db  # noqa: E402
    status = "failure" if findings else "healthy"
    iv.record_run(SCRIPT, CLIENT, status, rows_written=0, reason="; ".join(findings) or None,
                  latest_source_ts=(summary.get("freshness") or {}).get("generated_at"))
    db.record_ingest_health(SCRIPT, CLIENT, not findings, error="; ".join(findings) or None)

    if findings:
        from notify import notify_durable  # noqa: E402
        notify_durable("BIRDFLU TRACKER: data not fresh",
                       "\n".join(findings) + "\n" + SUMMARY_URL,
                       dedup_key="birdflu-freshness", priority="high", tags=["bird"], job_alert=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the tests**

Run: `cd ~/agency-engine && /usr/local/bin/python3 -m unittest tests.test_canary_birdflu_freshness -v 2>&1 | tail -4`
Expected: `Ran 10 tests`, `OK`.

- [ ] **Step 5: Dry-run against the live site**

Run: `cd ~/agency-engine && /usr/local/bin/python3 canary_birdflu_freshness.py --dry-run; echo "exit $?"`
Expected today (before stream A ships): `[birdflu-canary] summary has no freshness block`, `exit 1`. After stream A ships: `[birdflu-canary] healthy`, `exit 0`. Both are correct; the dry run never records or alerts.

- [ ] **Step 6: Commit (agency-engine is its own repository)**

Run: `cd ~/agency-engine && git status --short | head` to confirm only the two new files are pending, then:

```bash
cd ~/agency-engine
git add canary_birdflu_freshness.py tests/test_canary_birdflu_freshness.py
git commit -m "canary: birdflutracker.org data freshness"
```

If `~/agency-engine` is not a git repository, skip the commit and say so in the task report.

---

### Task 4: Register both jobs and schedule the canary

**Files:**
- Create: `~/Library/LaunchAgents/com.alex.birdflu-freshness-canary.plist`
- Modify: `~/agency-engine/health_registry.py` (append two dicts to `REGISTRY`)
- Modify: `~/.claude/status/operating-cadence.md` (two rows in the job inventory)

**Interfaces:**
- Consumes: `REGISTRY` list shape in `health_registry.py` (read the `contact-form-canary` entry near line 197 and the `clicksend-balance-canary` entry near line 190 first, and copy their exact key names).
- Produces: `doctor.py --full` reports `h5-build-push` and `birdflu-freshness-canary`; `doctor.py --check-cadence` shows no drift.

- [ ] **Step 1: Read the two precedent entries**

Run: `grep -n -A 12 '"contact-form-canary"' ~/agency-engine/health_registry.py | head -30`
Expected: a dict with `label`, `kind`, `schedule`, `exit_codes`, `assertions` (a heartbeat assertion). Use exactly those keys.

- [ ] **Step 2: Append the two entries**

Append inside `REGISTRY`, matching the precedent's key names and assertion helper exactly (if the precedent's heartbeat assertion is a helper call such as `heartbeat_fresh("contact-form-canary", hours=26)`, mirror it):

```python
    {
        "label": "h5-build-push",
        "kind": "ingest",
        "schedule": "daily 19:45",
        "exit_codes": {0: "healthy", 1: "failure"},
        "assertions": [heartbeat_fresh("h5-build-push", hours=30)],
        "note": "birdflutracker.org nightly data refresh from the residential IP; commits site/data and pushes main",
    },
    {
        "label": "birdflu-freshness-canary",
        "kind": "canary",
        "schedule": "daily 08:30",
        "exit_codes": {0: "healthy", 1: "failure"},
        "assertions": [heartbeat_fresh("birdflu-freshness-canary", hours=30)],
        "note": "judges the live birdflutracker.org summary.json; alerts on stale data or failed DAFF sources",
    },
```

- [ ] **Step 3: Write the canary plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.alex.birdflu-freshness-canary</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/Alex/agency-engine/run_job.sh</string>
    <string>birdflu-freshness-canary</string>
    <string>/usr/local/bin/python3</string>
    <string>/Users/Alex/agency-engine/canary_birdflu_freshness.py</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/Alex/agency-engine</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>/Users/Alex</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>8</integer>
    <key>Minute</key><integer>30</integer>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>/Users/Alex/agency-engine/logs/launchd_birdflu_freshness_canary.stdout.log</string>
  <key>StandardErrorPath</key><string>/Users/Alex/agency-engine/logs/launchd_birdflu_freshness_canary.stderr.log</string>
</dict>
</plist>
```

- [ ] **Step 4: Lint, load, verify with the doctor**

Run: `plutil -lint ~/Library/LaunchAgents/com.alex.birdflu-freshness-canary.plist && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.alex.birdflu-freshness-canary.plist && cd ~/agency-engine && /usr/local/bin/python3 doctor.py --check-cadence 2>&1 | grep -iE "h5-build-push|birdflu" `
Expected: both labels listed with no "NOT in registry" and no "registered but not loaded".

- [ ] **Step 5: Add the two rows to the cadence note**

In `~/.claude/status/operating-cadence.md`, in the job inventory table, add (match the table's columns):

```
| com.alex.h5-build-push | daily 19:45 | nightly-refresh.sh in ~/dev/h5-bird-flu-tracker; commits site/data, pushes main | heartbeat 30h | 30 Sep 2026 |
| com.alex.birdflu-freshness-canary | daily 08:30 | canary_birdflu_freshness.py; judges live summary.json; ntfy dedup birdflu-freshness | heartbeat 30h | 30 Sep 2026 |
```

- [ ] **Step 6: Commit the registry change (agency-engine repo, if it is one)**

```bash
cd ~/agency-engine
git add health_registry.py
git commit -m "registry: h5-build-push and birdflu-freshness-canary"
```

---

### Task 5: Verify-only Vercel builds, cloud workflows that commit everything

**Files:**
- Modify: `vercel.json` (`buildCommand`)
- Modify: `.github/workflows/refresh.yml` (commit step, `npm ci`)
- Modify: `.github/workflows/ci.yml` (replace the live-fetch step)

**Interfaces:**
- Consumes: `node pipeline/build.mjs --verify` (stream A). This task is blocked until stream A's `--verify` is on `main`; check with `node pipeline/build.mjs --verify; echo $?` before starting.
- Consumes: `package-lock.json` exists (stream A adds `fflate`; stream D adds `three` and `esbuild` as dev dependencies). If no lockfile exists yet, use `npm install --no-audit --no-fund` in place of `npm ci` and note it.
- Produces: deploys that never fetch; a cloud refresh that commits `site/data/**` in full.

- [ ] **Step 1: Change the Vercel build command**

In `vercel.json` replace:

```json
  "buildCommand": "node pipeline/build.mjs",
```

with:

```json
  "buildCommand": "node pipeline/build.mjs --verify",
```

- [ ] **Step 2: Rewrite the refresh workflow's steps**

Replace everything from `- name: Refresh data from live sources` to the end of `refresh.yml` with:

```yaml
      - name: Install dependencies
        run: npm ci

      - name: Refresh data from live sources (falls back to committed data when blocked)
        run: node pipeline/build.mjs

      - name: Commit every regenerated data file
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -A site/data
          if git diff --cached --quiet; then
            echo "No changes today."
          else
            git commit -m "chore: daily data refresh (cloud)"
            git push
          fi
```

- [ ] **Step 3: Rewrite the CI workflow's steps**

Replace the three steps `Syntax-check front-end`, `Run data pipeline (exercises live source fetch)` and `Validate generated data` in `ci.yml` with:

```yaml
      - name: Install dependencies
        run: npm ci

      - name: Syntax-check every script
        run: |
          for f in site/*.js pipeline/*.mjs pipeline/lib/*.mjs pipeline/sources/*.mjs; do node --check "$f"; done

      - name: Unit tests
        run: npm test

      - name: Verify committed data (no network)
        run: node pipeline/build.mjs --verify

      - name: Bundle is up to date (when the birds runtime exists)
        run: |
          if [ -f site/assets/three/birds.js ]; then
            npm run bundle
            git diff --exit-code -- site/assets/three/birds.js
          else
            echo "no bundle yet"
          fi
```

Keep the existing `Validate history dataset` step as it is.

- [ ] **Step 4: Run what CI will run, locally**

Run: `cd ~/dev/h5-bird-flu-tracker && npm ci && for f in site/*.js pipeline/*.mjs pipeline/lib/*.mjs pipeline/sources/*.mjs; do node --check "$f" || echo "FAIL $f"; done && npm test && node pipeline/build.mjs --verify; echo "verify exit $?"`
Expected: no `FAIL` lines, tests pass, `verify exit 0`.

- [ ] **Step 5: Commit**

```bash
git add vercel.json .github/workflows/refresh.yml .github/workflows/ci.yml
git commit -m "ops: verify-only Vercel builds; cloud refresh commits every data file; CI stops fetching"
```

- [ ] **Step 6: Watch the first deploy and the first cloud refresh**

After the parent pushes: `gh run list --repo apappas57/H5-Bird-flu-tracker --limit 2` shows CI green; the Vercel deployment for the commit is `READY`; `curl -s https://www.birdflutracker.org/data/summary.json | head -c 200` shows the same `generated_at` as the committed file (the build no longer regenerates it). The next morning, `gh run view --repo apappas57/H5-Bird-flu-tracker $(gh run list --repo apappas57/H5-Bird-flu-tracker --workflow refresh.yml --limit 1 --json databaseId -q '.[0].databaseId') --log | grep -E "No changes|chore: daily"` shows either outcome without error.

---

### Task 6: Visits: Web Analytics, Search Console, sitemap

**Files:**
- Modify: `docs/STATUS.md` (runtime and monitoring section)
- Read: `site/sitemap.xml` (stream B), `~/agency-engine/gsc_add_site.py`

**Interfaces:**
- Consumes: Alex has clicked Enable on the Vercel project's Analytics tab (spec 11.1); stream B added `<script defer src="/_vercel/insights/script.js"></script>` to `index.html`; `site/sitemap.xml` exists.
- Produces: `/_vercel/insights/script.js` served with 200; the domain in Search Console with the sitemap submitted.

- [ ] **Step 1: Confirm analytics is live**

Run: `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://www.birdflutracker.org/_vercel/insights/script.js`
Expected: `200 application/javascript` (or `text/javascript`). A `404` means the dashboard toggle is not on yet: stop and report; do not work around it.

- [ ] **Step 2: Find where the domain's DNS lives**

Run: `dig NS birdflutracker.org +short`
Expected: the nameservers name the host (for example `ns1.vercel-dns.com`). Record the answer in the task report. If it is Vercel DNS, the TXT record for Search Console can be added with the Vercel MCP `update_record`/`replace_domains_by_domain_records` tools by the parent; otherwise Alex adds it at the registrar (spec 11.5).

- [ ] **Step 3: Register the site and submit the sitemap**

Run: `cd ~/agency-engine && /usr/local/bin/python3 gsc_add_site.py --help` to read its arguments, then run it for `https://www.birdflutracker.org/` with the sitemap `https://www.birdflutracker.org/sitemap.xml`.
Expected: `sites.add https://www.birdflutracker.org/: ok` and `sitemap submitted: https://www.birdflutracker.org/sitemap.xml`. If the script reports the site is unverified, stop and report which verification method it asks for.

- [ ] **Step 4: Update STATUS.md**

Replace the `## Now` section of `docs/STATUS.md` with:

```markdown
## Now

_Last updated: <today's date>._

The pipeline runs nightly at 19:45 AEST on Alex's Mac (`scripts/nightly-refresh.sh`, launchd label
`com.alex.h5-build-push`), commits `site/data/**` and pushes `main`. The GitHub Actions cron is a
second attempt from the cloud. Vercel builds run `build.mjs --verify` and never fetch, so a deploy
serves exactly the committed data. A daily canary (`canary_birdflu_freshness.py`, 08:30 AEST) reads
the live `summary.json` and alerts when data is stale, a DAFF source fails two days running, the
official spreadsheet is missing, or a record is unplaced. Visits are measured with Vercel Web
Analytics; the site is registered in Search Console.
```

- [ ] **Step 5: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs: runtime and monitoring after the ops move"
```

---

## Self-review

- Spec 4.1 runner: Tasks 1, 2. Spec 4.1 cloud cron commits everything: Task 5. Spec 4.1 verify-only Vercel: Task 5. Spec 4.2 canary rules (36 h, 4 days, two-day streaks, spreadsheet, unplaced): Task 3. Spec 4.3 analytics, GSC, sitemap submission: Task 6. Spec 4.4 conventions (wrapper, paths, labels, registry, cadence note): Tasks 2, 3, 4.
- Names used across tasks: `h5-build-push` (Tasks 1, 2, 4, 5 note), `birdflu-freshness-canary` (Tasks 3, 4), `canary_birdflu_freshness` script name (Tasks 3, 4), `birdflu_canary_state.json` (Task 3), `dedup_key="birdflu-freshness"` (Task 3). `evaluate(summary, state, now, xlsx_status)` returns `(findings, new_state)` in both the tests and the implementation.
- The one external dependency of Task 5 (`--verify` from stream A) and of Task 6 (the tag and sitemap from stream B, the dashboard toggle from Alex) are stated as blockers, not assumed.
