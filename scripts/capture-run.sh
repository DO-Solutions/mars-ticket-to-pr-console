#!/usr/bin/env bash
#
# Capture a session's most recent run as a replay fixture, so there is always an
# offline fallback for a recording. Run this straight after a good live run.
#
#   DIGITALOCEAN_ACCESS_TOKEN=... ./scripts/capture-run.sh taskflow-fixer fixer-TF-104
#   ./scripts/capture-run.sh taskflow-fixer everything --all     # whole transcript
#
# Two things happen automatically, both of which matter:
#
#  * Only events from the last `run.started` are kept. A reused session
#    accumulates every run it has ever served, and replaying all of them would
#    show several tickets being fixed in sequence.
#  * Account and session identifiers are pseudonymised. These fixtures are
#    committed to a public repository, so a raw transcript would publish the
#    team id and real session ids.
#
set -euo pipefail
cd "$(dirname "$0")/.."

SESSION="${1:?usage: capture-run.sh <session-name-or-id> <fixture-name> [--all]}"
NAME="${2:?usage: capture-run.sh <session-name-or-id> <fixture-name> [--all]}"
KEEP_ALL="${3:-}"

TOKEN="${DIGITALOCEAN_ACCESS_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f "$HOME/.secrets/do-api-token" ]; then
  TOKEN="$(cat "$HOME/.secrets/do-api-token")"
fi
if [ -z "$TOKEN" ]; then
  echo "set DIGITALOCEAN_ACCESS_TOKEN, or place a token at ~/.secrets/do-api-token" >&2
  exit 1
fi

SID="$(doctl harness-runtime show "$SESSION" -o json | python3 -c '
import json,sys
d=json.load(sys.stdin); s=d[0] if isinstance(d,list) else d.get("session",d)
print(s["session_id"])')"

mkdir -p fixtures
RAW="$(mktemp)"
trap 'rm -f "$RAW"' EXIT

curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.digitalocean.com/v2/agents/sessions/$SID/events?replay_only=true" -o "$RAW"

python3 - "$RAW" "fixtures/$NAME.sse" "$KEEP_ALL" <<'PY'
import hashlib, json, re, sys

raw, out, keep_all = sys.argv[1], sys.argv[2], sys.argv[3] == '--all'
frames = [l for l in open(raw).read().split('\n') if l.startswith('data: ')]

if not keep_all:
    starts = [i for i, l in enumerate(frames) if '"type":"run.started"' in l.replace(' ', '')]
    if starts:
        frames = frames[starts[-1]:]

text = '\n\n'.join(frames) + '\n'

# These fixtures are committed to a public repo — do not publish account ids.
text = re.sub(r'"tenant_id":"\d+"', '"tenant_id":"0"', text)

def pseudo(val, prefix=''):
    h = hashlib.sha256(('demo-fixture' + val).encode()).hexdigest()
    if prefix:
        return prefix + h[:24]
    return f'{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}'

for pat, pre in ((r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ''),
                 (r'ses_[A-Za-z0-9]{8,}', 'ses_'),
                 (r'prt_[A-Za-z0-9]{8,}', 'prt_')):
    for v in sorted(set(re.findall(pat, text)), key=len, reverse=True):
        text = text.replace(v, pseudo(v, pre))

open(out, 'w').write(text)

n = len(frames)
kinds = {}
for f in frames:
    try:
        kinds.setdefault(json.loads(f[6:]).get('type', '?'), 0)
        kinds[json.loads(f[6:])['type']] += 1
    except Exception:
        pass
print(f'captured {n} events -> {out}')
print('  ' + ', '.join(f'{k}={v}' for k, v in sorted(kinds.items())))
if not any('tool_call' in k for k in kinds):
    print('  WARNING: no tool calls captured — is this the run you meant?')
PY

echo "Sanitised and ready to commit. Say plainly when you are showing a replay."
