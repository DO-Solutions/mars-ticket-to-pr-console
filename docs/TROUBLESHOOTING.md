# Troubleshooting and operating notes

Problems actually hit while building and running this demo, and what they turned
out to be. Kept out of the README so that stays readable.

## Runtime

**The demo is slow, or the feed sits still.** A long model turn emits no events,
so a still feed is normal. The console shows an elapsed timer and, after twelve
quiet seconds, says the model is working. Runs measured on TF-101: 85s, 127s and
333s. Only treat it as broken if the feed is empty from the very start.

**Every run fails with `403 Forbidden` from
`inference-trusted.vpc-endpoint.internal.digitalocean.com`.** Sandbox inference
rejected `doo_v1_` model access keys as of 2026-09-20, including freshly issued
ones, while the same key worked against the public `inference.do-ai.run`
endpoint. The workaround is a DigitalOcean PAT with **full access** — per
`doctl serverless-inference --help`, "all scopes must be granted for the
serverless inference API to work", so a narrowly scoped token cannot work.
See `INFERENCE-403-REPORT.md` (kept outside the repo) for the full evidence.
Revoke the PAT when the key path is fixed.

**The reviewer runs but posts nothing, and its prompt fields are blank.** The
GitHub webhook is using GitHub's default content type. Set it to
`application/json` — with form encoding the body arrives as one urlencoded
`payload=` string and no `{{.field}}` placeholder resolves. The run still
succeeds and bills tokens, so this fails quietly. The reviewer prompt is written
to detect and name this case.

**A pull request gets no review, and executions sit in `pending`.** An earlier
execution is stuck in `running` — its session is gone but the execution never
finished — and executions on a trigger are serialised, so everything behind it
waits:

```bash
doctl harness-runtime triggers list-executions <reviewer-trigger-id>
```

Executions cannot be cancelled, and pausing/resuming only clears the `pending`
entries. Recovery is to recreate the reviewer trigger and re-paste its webhook
secret into the repository. To avoid it, do not let a trigger fire for events
you do not intend to act on — which is why `reset-demo.sh` leaves the reviewer
paused and dispatch re-arms it.

**The review is a comment, not a formal approval.** Deliberate. GitHub refuses
`APPROVED` and `CHANGES_REQUESTED` when the reviewer is the pull request's own
author, and both agents share one GitHub identity here. The reviewer posts with
`gh pr review --comment` and leads with `## APPROVED` or `## CHANGES REQUESTED`,
which the console reads for its badge. Do not instruct the agent to try
`--approve` first: that call can never succeed, and whether anything gets posted
then depends on the agent improvising a fallback — which sometimes left pull
requests with no review at all. Giving the reviewer its own GitHub account
restores genuine review states.

## Things that bite when extending this

- **Each bash call is a fresh shell.** An `export` in one command is gone by the
  next. Session env vars from the manifest (`$TARGET_REPO`, `$GITHUB_TOKEN`) are
  fine; anything the agent sets itself is not. A prompt that told the agent to
  `export PR_NUMBER=…` and use it later made the reviewer review nothing while
  reporting success.
- **Skills are not auto-discovered.** The platform writes them to
  `/workspace/.agents/skills/<name>/SKILL.md`, but the agent will not consult one
  from its `description` alone — asked for a canary phrase held only in a skill,
  it invented an answer. Name the file in the prompt.
- **Skills are baked in at session-create time.** An existing session keeps its
  original playbook when the manifest changes.
- **Deleting a session that a reuse trigger is bound to deletes the trigger**,
  which the guide documents only in the opposite direction. Not an issue in the
  current fresh-mode setup, but it will bite anyone who switches to reuse.
- **Reused sessions carry their conversation.** That is why both agents now use
  fresh sessions: the fixer was carrying every previous ticket into the next run,
  which inflated context and had it inventing branch names like `-v10` because it
  remembered the earlier ones.
- **Prompts must be imperative.** "Run X with your bash tool and paste the real
  output" works; a conversational prompt produced zero tool calls.
- **Guardrails must be `deny`, not `ask`.** On an unattended run there is nobody
  to answer a prompt, so the platform auto-approves anything set to `ask`.
- **`doctl harness-runtime validate` is local only.** It checks manifest syntax
  and makes no API call. Confirm behaviour by running a session.
- **The sandbox has no `jq`.** It has `gh`, git, node 20, npm, python3 and make.
  The skills use `python3` for JSON.
- **A session's event stream replays its history on every connect**, with no
  cursor (`from_seq`, `since_seq`, `cursor` and `Last-Event-ID` are all ignored).
  The console gates on the `stream.state` frame that flips from `catching_up` to
  `live`.
