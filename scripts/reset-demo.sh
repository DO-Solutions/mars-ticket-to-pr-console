#!/usr/bin/env bash
#
# Put the demo back to a known-good state. Run this before every recording and
# before every client call — it is the difference between a demo that works
# twice and one that works twenty times.
#
#   1. deletes the agent's branches, which also closes their pull requests
#   2. confirms main still carries the seeded defects
#   3. clears the console's board state
#   4. resets the warm fixer session's workspace
#   5. reports leftover MARS sessions, which count against the team's cap
#
# Deliberately works over SSH and unauthenticated reads, so it does not depend
# on a GitHub API token. That matters in a SAML-enforced org, where an
# unauthorised token is refused on org resources even when the repo is public.
# If ~/.secrets/taskflow-pat exists it is used to close PRs with a comment,
# which is tidier but never required.
#
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${TARGET_REPO:-DO-Solutions/mars-ticket-to-pr-taskflow}"
SSH_REMOTE="git@github.com:${REPO}.git"
CONSOLE_URL="${CONSOLE_URL:-}"
PAT_FILE="${PAT_FILE:-$HOME/.secrets/taskflow-pat}"

echo "==> open agent pull requests (unauthenticated read)"
curl -sS "https://api.github.com/repos/$REPO/pulls?state=open&per_page=100" \
  | python3 -c '
import json,sys
try: prs=json.load(sys.stdin)
except Exception: prs=[]
if isinstance(prs,dict): prs=[]
agent=[p for p in prs if (p.get("head") or {}).get("ref","").startswith("agent/")]
print("    %d open agent PR(s)" % len(agent))
for p in agent:
    print("      #%s %s" % (p["number"], p["head"]["ref"]))
' || echo "    (could not read; continuing)"

# Closing a PR with a comment is nicer, but optional — deleting the branch
# below closes it either way.
if [ -f "$PAT_FILE" ]; then
  echo "==> closing them via the API (token found)"
  TOKEN="$(cat "$PAT_FILE")"
  curl -sS -H "Authorization: Bearer $TOKEN" \
    "https://api.github.com/repos/$REPO/pulls?state=open&per_page=100" \
    | python3 -c '
import json,sys
try: prs=json.load(sys.stdin)
except Exception: prs=[]
if isinstance(prs,dict): prs=[]
for p in prs:
    if (p.get("head") or {}).get("ref","").startswith("agent/"): print(p["number"])
' | while read -r n; do
      [ -n "$n" ] || continue
      curl -sS -X PATCH -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"state":"closed"}' \
        "https://api.github.com/repos/$REPO/pulls/$n" >/dev/null && echo "    closed #$n"
    done
else
  echo "==> no token at $PAT_FILE — branch deletion below will close the PRs"
fi

echo "==> deleting remote agent/* branches over SSH"
BRANCHES="$(git ls-remote --heads "$SSH_REMOTE" 'refs/heads/agent/*' 2>/dev/null | awk '{print $2}' | sed 's|refs/heads/||' || true)"
if [ -z "$BRANCHES" ]; then
  echo "    none to delete"
else
  echo "$BRANCHES" | while read -r b; do
    [ -n "$b" ] || continue
    git push --quiet "$SSH_REMOTE" --delete "$b" && echo "    deleted $b"
  done
fi

echo "==> confirming main still has the seeded defects"
curl -sS "https://raw.githubusercontent.com/$REPO/main/tests/tasks.test.js" \
  | grep -c 'it.skip(' \
  | xargs -I{} echo "    {} skipped tests on main (expected: 4)" || echo "    (could not read)"

if [ -n "$CONSOLE_URL" ]; then
  echo "==> resetting the console board"
  curl -sS -X POST "$CONSOLE_URL/api/demo/reset" >/dev/null && echo "    board reset"
else
  echo "==> set CONSOLE_URL to also reset the board"
fi

echo "==> resetting the warm fixer workspace"
if doctl harness-runtime show taskflow-fixer >/dev/null 2>&1; then
  doctl harness-runtime exec taskflow-fixer -- sh -c '
    cd /workspace/taskflow 2>/dev/null || exit 0
    git checkout main -q && git fetch origin main -q && git reset --hard origin/main -q && git clean -fd -q
    git branch --list "agent/*" | tr -d " " | xargs -r -n1 git branch -D -q 2>/dev/null || true
    echo "workspace clean at $(git rev-parse --short HEAD)"
  ' || echo "    (session unreachable — it may be paused; this is fine)"
  doctl harness-runtime pause taskflow-fixer >/dev/null 2>&1 || true
else
  echo "    no taskflow-fixer session — run scripts/setup-mars.sh first"
fi

echo "==> live MARS sessions (each counts against the team cap)"
doctl harness-runtime list

echo
echo "Ready. Expected state: 5 tickets in Backlog, no open agent PRs, 4 skipped tests on main."
