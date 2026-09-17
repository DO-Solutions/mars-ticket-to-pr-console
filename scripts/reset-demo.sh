#!/usr/bin/env bash
#
# Put the demo back to a known-good state. Run this before every recording and
# before every client call — it is the difference between a demo that works
# twice and one that works twenty times.
#
#   1. closes the agent's open PRs and deletes its branches
#   2. restores the seeded defects on the target repo
#   3. clears the console's board state
#   4. resets the warm fixer session's workspace
#   5. reports leftover MARS sessions, which count against the team's cap
#
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${TARGET_REPO:-DO-Solutions/mars-ticket-to-pr-taskflow}"
CONSOLE_URL="${CONSOLE_URL:-}"

echo "==> closing open agent pull requests on $REPO"
gh pr list --repo "$REPO" --state open --json number,headRefName \
  --jq '.[] | select(.headRefName | startswith("agent/")) | .number' 2>/dev/null \
  | while read -r n; do
      [ -n "$n" ] || continue
      echo "    closing #$n"
      gh pr close "$n" --repo "$REPO" --delete-branch --comment "Closing: demo reset." >/dev/null
    done

echo "==> deleting any leftover agent/* branches"
gh api "repos/$REPO/git/matching-refs/heads/agent/" --jq '.[].ref' 2>/dev/null \
  | sed 's|refs/heads/||' \
  | while read -r b; do
      [ -n "$b" ] || continue
      echo "    deleting $b"
      gh api -X DELETE "repos/$REPO/git/refs/heads/$b" >/dev/null 2>&1 || true
    done

echo "==> confirming main still has the seeded defects"
gh api "repos/$REPO/contents/tests/tasks.test.js" --jq '.content' 2>/dev/null \
  | base64 --decode \
  | grep -c 'it.skip(' \
  | xargs -I{} echo "    {} skipped tests on main (expected: 4)"

if [ -n "$CONSOLE_URL" ]; then
  echo "==> resetting the console board"
  curl -sS -X POST "$CONSOLE_URL/api/demo/reset" >/dev/null && echo "    board reset"
fi

echo "==> resetting the warm fixer workspace"
if doctl harness-runtime show taskflow-fixer >/dev/null 2>&1; then
  doctl harness-runtime exec taskflow-fixer -- sh -c '
    cd /workspace/taskflow 2>/dev/null || exit 0
    git checkout main -q && git reset --hard origin/main -q && git clean -fd -q
    git branch --list "agent/*" | tr -d " " | xargs -r -n1 git branch -D -q
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
