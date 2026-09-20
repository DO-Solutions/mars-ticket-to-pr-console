#!/usr/bin/env bash
#
# Push and redeploy the console.
#
# The app is deployed from a public git clone URL rather than through the GitHub
# App, because installing that app on the org needs an owner. The trade-off is
# no deploy-on-push, so a redeploy is an explicit step: this script.
#
#   ./scripts/deploy.sh            # push main, then redeploy and wait
#   ./scripts/deploy.sh --no-push  # redeploy what is already on main
#
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="${APP_NAME:-mars-ticket-to-pr-console}"

if [ "${1:-}" != "--no-push" ]; then
  echo "==> pushing main"
  git push origin main
fi

APP_ID="$(doctl apps list --format ID,Spec.Name --no-header \
  | awk -v n="$APP_NAME" '$2 == n {print $1}' | head -1)"

if [ -z "$APP_ID" ]; then
  echo "no app named $APP_NAME — create it first with:" >&2
  echo "  doctl apps create --spec .do/app.yaml" >&2
  exit 1
fi
echo "==> app $APP_ID"

echo "==> triggering a deployment"
doctl apps create-deployment "$APP_ID" --wait --format ID,Phase --no-header

URL="$(doctl apps get "$APP_ID" --format DefaultIngress --no-header)"
echo "==> live at $URL"

# A deployment can report ACTIVE before the service answers, so check the app
# rather than trusting the phase.
for i in $(seq 1 10); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/tickets" || true)"
  if [ "$code" = "200" ]; then echo "==> /api/tickets OK"; exit 0; fi
  sleep 5
done
echo "WARNING: $URL/api/tickets did not return 200 — check:" >&2
echo "  doctl apps logs $APP_ID console --type run --tail 50" >&2
exit 1
