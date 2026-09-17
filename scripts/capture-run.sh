#!/usr/bin/env bash
#
# Capture a session's transcript as a replay fixture. Run this right after a
# good live run so there is always an offline fallback for a recording.
#
#   ./scripts/capture-run.sh taskflow-fixer fixer-TF-101
#
set -euo pipefail
cd "$(dirname "$0")/.."

SESSION="${1:?usage: capture-run.sh <session-name-or-id> <fixture-name>}"
NAME="${2:?usage: capture-run.sh <session-name-or-id> <fixture-name>}"

SID="$(doctl harness-runtime show "$SESSION" -o json | python3 -c '
import json,sys
d=json.load(sys.stdin); s=d[0] if isinstance(d,list) else d.get("session",d)
print(s["session_id"])')"

TOKEN="$(doctl auth list 2>/dev/null >/dev/null; echo "${DIGITALOCEAN_ACCESS_TOKEN:-}")"
if [ -z "$TOKEN" ]; then
  echo "set DIGITALOCEAN_ACCESS_TOKEN (a DO PAT) to capture the event stream" >&2
  exit 1
fi

mkdir -p fixtures
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.digitalocean.com/v2/agents/sessions/$SID/events?replay_only=true" \
  -o "fixtures/$NAME.sse"

EVENTS="$(grep -c '^data: ' "fixtures/$NAME.sse" || true)"
echo "captured $EVENTS events -> fixtures/$NAME.sse"
[ "$EVENTS" -gt 0 ] || echo "WARNING: no events — a fresh-mode session is destroyed after its run and cannot be captured."
