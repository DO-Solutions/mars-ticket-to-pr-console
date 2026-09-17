#!/usr/bin/env bash
#
# Stand up the MARS side of the demo: one warm fixer session, one reuse trigger
# bound to it, and one fresh trigger for the reviewer. Prints the environment
# variables the console app needs, and the GitHub webhook settings to paste.
#
# Prerequisites
#   - doctl beta build with `harness-runtime` (1.168.0-beta.6 or later)
#   - the right team selected: doctl auth switch --context "solutions demos"
#   - CONSOLE_URL set to the deployed app URL (or a tunnel, for local testing)
#   - secret files present (see SECRET_DIR below)
#
set -euo pipefail
cd "$(dirname "$0")/.."

SECRET_DIR="${SECRET_DIR:-$HOME/.secrets}"
INFERENCE_KEY="$SECRET_DIR/do-inference.key"     # Gradient model access key
GITHUB_PAT="$SECRET_DIR/taskflow-pat"            # fine-grained PAT, the 2 demo repos
CALLBACK_TOKEN="$SECRET_DIR/console-callback"    # shared secret for /api/agent/callback

if [ -z "${CONSOLE_URL:-}" ]; then
  echo "set CONSOLE_URL to the console app base URL, e.g. https://xxx.ondigitalocean.app" >&2
  exit 1
fi
export CONSOLE_URL
export CONSOLE_HOST="${CONSOLE_URL#https://}"
CONSOLE_HOST="${CONSOLE_HOST#http://}"
export CONSOLE_HOST="${CONSOLE_HOST%%/*}"

for f in "$INFERENCE_KEY" "$GITHUB_PAT" "$CALLBACK_TOKEN"; do
  [ -f "$f" ] || { echo "missing secret file: $f" >&2; exit 1; }
done

echo "==> console: $CONSOLE_URL (host $CONSOLE_HOST)"

SECRET_FLAGS=(
  --secret "HARNESS_INFERENCE_API_KEY=@$INFERENCE_KEY"
  --secret "GITHUB_TOKEN=@$GITHUB_PAT"
  --secret "CONSOLE_TOKEN=@$CALLBACK_TOKEN"
)

# ---------------------------------------------------------------------------
# 1. The warm fixer session.
#
# The fixer trigger runs in reuse mode, which needs a session that already
# exists and is paused. This is deliberate: a fresh trigger session is destroyed
# the instant its run ends and its transcript becomes unretrievable, so the
# console could never reliably stream it. A bound session's ID is known up
# front, so the UI attaches before the webhook fires.
# ---------------------------------------------------------------------------
echo "==> creating the warm fixer session"
if doctl harness-runtime show taskflow-fixer >/dev/null 2>&1; then
  echo "    taskflow-fixer already exists — reusing it"
else
  doctl harness-runtime create agents/fixer.yaml "${SECRET_FLAGS[@]}" --interactive=false
fi

FIXER_SESSION_ID="$(doctl harness-runtime show taskflow-fixer -o json | python3 -c '
import json,sys
d=json.load(sys.stdin)
s=d[0] if isinstance(d,list) else d.get("session",d)
print(s["session_id"])')"
echo "    session: $FIXER_SESSION_ID"

# Warm the workspace so the first demo run is not the one that pays for the
# clone and npm install.
echo "==> warming the workspace (clone + npm ci)"
doctl harness-runtime exec taskflow-fixer -- sh -c '
  cd /workspace
  if [ ! -d taskflow/.git ]; then gh repo clone "$TARGET_REPO" taskflow; fi
  cd taskflow && git fetch origin main -q && [ -d node_modules ] || npm ci --silent
  echo "workspace ready: $(git rev-parse --short HEAD)"
' || echo "    (warm-up failed — check the GITHUB_TOKEN secret and TARGET_REPO)"

echo "==> pausing it so a reuse trigger can bind"
doctl harness-runtime pause taskflow-fixer >/dev/null
sleep 3

# ---------------------------------------------------------------------------
# 2. Triggers.
# ---------------------------------------------------------------------------
echo "==> creating the fixer trigger (webhook, reuse, custom signature)"
FIXER_TRIGGER_JSON="$(doctl harness-runtime triggers create \
  --kind webhook --name taskflow-fixer \
  --session-mode reuse --bound-session-id "$FIXER_SESSION_ID" \
  --provider custom \
  --prompt "$(cat prompts/fixer.tmpl)" \
  --output-mode none -o json)"

echo "==> creating the reviewer trigger (webhook, fresh, github signature)"
REVIEWER_TRIGGER_JSON="$(doctl harness-runtime triggers create \
  --kind webhook --name taskflow-reviewer \
  --session-mode fresh --spec agents/reviewer.yaml \
  --provider github \
  --prompt "$(cat prompts/reviewer.tmpl)" \
  --output-mode none \
  "${SECRET_FLAGS[@]}" -o json)"

read -r FIXER_TRIGGER_ID FIXER_SECRET <<<"$(python3 -c '
import json,sys
t=json.loads(sys.argv[1]); t=t[0] if isinstance(t,list) else t
print(t["trigger_id"], t.get("webhook_secret",""))' "$FIXER_TRIGGER_JSON")"

read -r REVIEWER_TRIGGER_ID REVIEWER_SECRET REVIEWER_URL <<<"$(python3 -c '
import json,sys
t=json.loads(sys.argv[1]); t=t[0] if isinstance(t,list) else t
print(t["trigger_id"], t.get("webhook_secret",""), (t.get("webhook") or {}).get("webhook_url",""))' "$REVIEWER_TRIGGER_JSON")"

# ---------------------------------------------------------------------------
# 3. What to do with the output.
# ---------------------------------------------------------------------------
cat <<OUT

============================================================
Set these on the console app (App Platform > Settings > env):

  DO_API_TOKEN=<a DO PAT with full access>
  TARGET_REPO=DO-Solutions/mars-ticket-to-pr-taskflow
  GITHUB_TOKEN=<read-only fine-grained PAT for the taskflow repo>
  AGENT_CALLBACK_TOKEN=$(cat "$CALLBACK_TOKEN")
  MARS_FIXER_SESSION_ID=$FIXER_SESSION_ID
  MARS_FIXER_TRIGGER_ID=$FIXER_TRIGGER_ID
  MARS_FIXER_TRIGGER_SECRET=$FIXER_SECRET
  MARS_REVIEWER_TRIGGER_ID=$REVIEWER_TRIGGER_ID

Add this webhook to DO-Solutions/mars-ticket-to-pr-taskflow
(Settings > Webhooks > Add webhook):

  Payload URL:  $REVIEWER_URL
  Content type: application/json
  Secret:       $REVIEWER_SECRET
  Events:       "Let me select individual events" > Pull requests only

Webhook secrets are shown once. Save them now; to reissue, use
  doctl harness-runtime triggers rotate-secret <trigger-id>
============================================================
OUT
