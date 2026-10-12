# Troubleshooting and operating notes

Problems actually hit while building and running this demo, and what they turned
out to be. Kept out of the README so that stays readable.

## Runtime

**The demo is slow, or the feed sits still.** A long model turn emits no events,
so a still feed is normal. The console shows an elapsed timer and, after twelve
quiet seconds, says the model is working. Runs measured on TF-101: 85s, 127s and
333s. Only treat it as broken if the feed is empty from the very start.

**A run fails with `403 Forbidden` from the internal inference endpoint.** The
`HARNESS_INFERENCE_API_KEY` is not valid for sandbox inference. Create a fresh
model access key in the control panel with the console switched to the right
team, and re-inject it into both triggers with `--secret`. Two keys issued
during this build failed this way while a later one worked, so if a key misbehaves,
replace it before investigating further.

**A run fails with `404 https://api.githubcopilot.com/…`.** No inference key
reached the sandbox. Omitting it does not fall back to DigitalOcean inference —
OpenCode falls back to its own default provider. The key is mandatory.

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

**The review posts through Action Gateway, not the `gh` CLI.** The reviewer
calls the `github_create_pr_review` action, and `gh pr review` is blocked by a
deny rule so the gateway is the only route a verdict can take. The gateway runs
as the GitHub account bound to the team's `github` connection — a dedicated bot,
not the identity that opened the pull request — which is what makes a formal
`APPROVE` or `REQUEST_CHANGES` possible.

The bot needs no organization membership to *post* while the repositories are
public — GitHub grants everyone read access, and read is enough to submit a
review. It is not enough for that review to count. GitHub's permission table
gates "approve or request changes to a pull request with required reviews"
behind **write** access, so the approval is recorded in the timeline but
`reviewDecision` stays `null` and merging is not gated. Verify with the REST
reviews endpoint *and* the GraphQL `reviewDecision` field — the first will say
`APPROVED` while the second says `null`, and only the second reflects what the
pull request page shows.

To make the approval count, an organization owner must add the bot as a
collaborator with **write** access (`DO-Solutions` restricts outside-collaborator
invitations to owners, so a repository admin cannot do it). Adding a branch
protection rule requiring one approving review then makes the merge box show the
requirement satisfied by the agent. When the repositories become internal, the
bot needs collaborator access regardless, or the call starts returning 403.

**A review call returns `unauthorized` / `requires_authorization`.** The team's
GitHub connection has lapsed or was never made. The error carries its own fix:
a `connect_url` and a verification code. Open it in a **private window** signed
in as the bot — the OAuth flow silently binds whichever account the browser is
already logged into, so doing this in your normal session binds you instead,
and the formal approval stops working with no obvious cause. Verify afterwards
with `GET /v2/action-gateway/connections`, or by asking a session to invoke
`github_github_get_user`, which returns the bound login.

**`ask` is not enforced on Action Gateway tools; `deny` is.** Measured on both
opencode and claude-code: a rule of `action: ask` on a gateway tool did not
prompt and did not stop the call. A `deny` rule does work, and works by removing
the tool from the catalog the agent can discover — it reports the action does
not exist. Treat `deny` as the control and `ask` as decoration.

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
