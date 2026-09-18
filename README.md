# MARS demo — ticket → reviewed pull request

A working demo of **DigitalOcean Managed Agents (MARS)** doing a real unit of
engineering work, unattended, with guardrails.

A ticket on a Jira-style board is dispatched to an agent. The agent clones a
real repository, reproduces the bug, fixes the root cause, proves it with the
test suite, pushes a branch and opens a pull request. A **second, independent
agent** is then woken by GitHub's `pull_request` webhook, reviews the diff
against the repo's written conventions, and posts an approve / request-changes
verdict. Both agents comment back on the ticket.

Throughout, the console streams each session's **real** telemetry — the agent's
reasoning, every tool call with its arguments and duration, token counts and
cost — straight from the MARS session event API.

> The board is the only simulated part, standing in for a Jira connector that
> already exists in Action Gateway's catalogue. The sessions, tool calls, token
> accounting, branches, pull requests and reviews are all real.

## The two repos

| Repo | What it is |
|---|---|
| `mars-ticket-to-pr-console` (this one) | the console app, the agent manifests, and the setup/reset scripts |
| `mars-ticket-to-pr-taskflow` | the target repo the agent actually modifies, carrying four seeded work items |

## How it fits together

```
Console (App Platform)
  │  "Dispatch AI agent" on TF-101
  │  POST <trigger webhook>, HMAC-signed per the provider's scheme
  ▼
MARS fixer trigger  (webhook · session-mode reuse · custom signature)
  ▼
Warm MARS session   (OpenCode · deepseek-v4-pro via DO Gradient inference)
  ├─ reset workspace, reproduce the failing test
  ├─ fix src/, run npm test until green
  ├─ push agent/TF-101-… and `gh pr create`
  └─ POST the outcome to /api/agent/callback
  ▼
GitHub webhook: pull_request.opened
  ▼
MARS reviewer trigger (webhook · session-mode fresh · github signature)
  ├─ clone, `gh pr checkout`, run the tests itself
  ├─ judge the diff against AGENTS.md
  ├─ `gh pr review --approve` / `--request-changes`
  └─ POST the verdict to /api/agent/callback

Console reads back:  GET /v2/agents/sessions/{id}/events   (SSE, live)
                     GET /v2/agents/triggers/{id}/executions
```

### Why the fixer reuses a session and the reviewer does not

The fixer trigger runs in **reuse** mode, bound to a long-lived paused session.
Its session ID is therefore known before the webhook fires, so the console can
attach to the event stream first and cannot miss the start of a run — and the
warm workspace keeps the repo cloned and `node_modules` installed, which makes
runs noticeably faster on camera.

The reviewer stays **fresh** on purpose: an independent reviewer should start
from a clean checkout with no memory of how the fix was written. The console
folds its events into its own store as they stream, so the run is still fully
visible after the session is gone.

## Setup

### 1. Prerequisites

- `doctl` **beta** build with `harness-runtime` (≥ 1.168.0-beta.6) — the agent
  commands are not in the standard release
- the right team: `doctl auth switch --context "solutions demos"`
- Managed Agents enabled on the team
- A GitHub token with write access to the taskflow repo, **SSO-authorised** if
  the org enforces SAML. Note that SAML enforcement applies to the *token*, not
  the repository: an unauthorised token is refused on org resources even when
  the repo is public. Unauthenticated reads and SSH git are unaffected, which is
  why `scripts/reset-demo.sh` needs no token.

### 2. Credentials

Three secret files, none of which is ever committed:

```bash
mkdir -p ~/.secrets
# A Gradient model access key. Note these can no longer be created over the
# API — use the control panel's model access key page.
printf '%s' '<doo_v1_...>'  > ~/.secrets/do-inference.key
# A fine-grained GitHub PAT, scoped to ONLY the two demo repos, with
# contents:write + pull-requests:write.
printf '%s' '<github_pat_...>' > ~/.secrets/taskflow-pat
# Any random string; the agents present it when posting back to the console.
openssl rand -hex 24 > ~/.secrets/console-callback
```

The manifests declare these as `secrets:` *slots* and the scripts inject them
with `--secret NAME=@path`, so values go to DigitalOcean Secrets Manager at
create time and are never written into the repo or returned by the API.

### 3. Deploy the console

```bash
doctl apps create --spec .do/app.yaml
```

The spec deploys from a public git clone URL, which needs no GitHub App
installation on the org. There is therefore no deploy-on-push — redeploy with:

```bash
./scripts/deploy.sh
```

### 4. Wire up MARS

```bash
CONSOLE_URL=https://<your-app>.ondigitalocean.app ./scripts/setup-mars.sh
```

This creates the warm fixer session, warms its workspace, pauses it, creates
both triggers, and prints the environment variables to set on the app plus the
GitHub webhook to add to the taskflow repo. **Webhook secrets are shown once.**

### 5. Check it

```bash
./scripts/reset-demo.sh     # expect: 5 tickets in Backlog, 4 skipped tests on main
```

Then dispatch TF-101 in the UI.

## Running the console locally

```bash
npm install
npm run dev
```

With no MARS environment variables set, the board and panes work and dispatch
returns a clear error naming what is missing. To drive a real run locally, the
agents need to reach your machine — expose it with a tunnel and set
`CONSOLE_URL` to the public URL before running `setup-mars.sh`, since the
egress allowlist in the manifests is built from that host.

## Environment variables

| Variable | Purpose |
|---|---|
| `DO_API_TOKEN` | reads sessions, events and trigger executions |
| `GITHUB_TOKEN` | read-only, renders PR and review state |
| `AGENT_CALLBACK_TOKEN` | shared secret for `/api/agent/callback` |
| `MARS_FIXER_SESSION_ID` | the warm session the console streams |
| `MARS_FIXER_TRIGGER_ID` / `_SECRET` | dispatch target and its signing secret |
| `MARS_REVIEWER_TRIGGER_ID` | polled to discover review runs |
| `TARGET_REPO` | the repo the agents clone and open PRs against; defaults to `DO-Solutions/mars-ticket-to-pr-taskflow` |

`TARGET_REPO` is the single switch that points the demo at a different copy of
the target repo. It is read by the console, by `scripts/reset-demo.sh`, and —
via `${TARGET_REPO}` expansion at session-create time — by both agent
manifests. Set it once in the environment before running `setup-mars.sh` and
everything follows.

A note on why that switch exists: the agents need **write** access to the target
repo, which means a token. In a SAML-enforced org a fine-grained token may need
administrator approval, which can take days. Pointing `TARGET_REPO` at a mirror
you own (`TARGET_REPO=<you>/mars-ticket-to-pr-taskflow`) lets the demo run
end to end in the meantime, and flipping it back later is one variable.

## Troubleshooting

**The reviewer runs but posts nothing, and its prompt shows blank fields.**
The GitHub webhook is using GitHub's default content type. Set it to
`application/json` — with form encoding the whole body arrives as one
urlencoded `payload=` string and no `{{.field}}` placeholder can resolve. The
run still succeeds and bills tokens, so this fails quietly; the reviewer prompt
is written to detect and name it.

**The fixer feed shows the previous run.** The fixer reuses a warm session,
whose event stream replays from the beginning on every connect. The console
records the session's latest `seq` before firing and ignores anything at or
below it. If you drive a reused session by hand, apply the same watermark.

**Branch names drift to `-v2`, `-v3`.** Stale branches from earlier runs were
left in the warm session's workspace, so `git switch -c` hit a name that already
existed. Step 1 of the fixer's skill now deletes local `agent/*` branches. Note
that the skill is written into the sandbox when the session is created, so an
older session keeps the old playbook — rebuild it (see below) to pick up a
change.

**Rebuilding the warm session also requires recreating the fixer trigger.**
Removing the session a reuse trigger is bound to takes the trigger with it. The
full sequence is: remove the session, create it from the manifest, warm it,
pause it, create the fixer trigger bound to the new session, then update
`MARS_FIXER_SESSION_ID`, `MARS_FIXER_TRIGGER_ID` and
`MARS_FIXER_TRIGGER_SECRET` on the app. The reviewer trigger is unaffected, so
the GitHub webhook stays valid.

**The review is posted as a comment, not a formal approval.** This is
deliberate. GitHub refuses `APPROVED` and `CHANGES_REQUESTED` when the reviewer
is the pull request's own author, and both agents share one GitHub identity
here. The reviewer therefore posts with `gh pr review --comment` and puts the
verdict on the first line as `## APPROVED` or `## CHANGES REQUESTED`, which the
console reads for its verdict badge.

Do not instruct the agent to try `--approve` first. That call can never succeed
in this configuration, so whether anything gets posted then depends on the agent
improvising a fallback — which it sometimes did and sometimes did not, leaving
pull requests with no review at all. Give the reviewer its own GitHub account
and PAT to restore genuine review states.

**A reviewer session appears during a reset.** Closing a pull request is also a
`pull_request` event, and GitHub's UI cannot filter by action. The reviewer
prompt exits early unless the action is `opened`, `reopened` or `synchronize`.

## Notes

A few practical things worth knowing if you are running or extending this demo:

- The sandbox image has `gh`, git, node 20, npm, python3 and make preinstalled.
  It does **not** have `jq`, so the agent skills use `python3` for JSON.
- Prompts must be imperative. Ask the agent to "run X with your bash tool and
  paste the real output" — a conversational prompt gets a conversational answer.
- Name the skill file explicitly in the prompt rather than relying on the agent
  to pick a skill up from its description.
- Guardrails are `deny` rules, not `ask`. On an unattended run there is nobody to
  answer a prompt, so anything the agent must never do needs denying outright.
- `doctl harness-runtime validate` checks a manifest's syntax locally. Confirm
  actual behaviour by running a session.
