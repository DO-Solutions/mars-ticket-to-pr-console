# Demo script — ticket → reviewed pull request

Target length **4 minutes**. Run `./scripts/reset-demo.sh` first, every time.

## Before you start

- [ ] `./scripts/reset-demo.sh` — 5 tickets in Backlog, no open agent PRs
- [ ] `doctl harness-runtime list` — `taskflow-fixer` present and paused
- [ ] Console open, browser zoomed so the feed text is legible on the recording
- [ ] A second tab on the taskflow repo's Pull requests page
- [ ] Rehearsed at least once today — the model is non-deterministic

## Beat 1 — the setup (20s)

> "This is a task-tracking API with a backlog of four real issues. Support has
> filed TF-101: filtering tasks by status returns everything. It's a one-line
> bug, the kind that sits in a backlog for three weeks."

Click TF-101. Show the description. Point out there's already a skipped
regression test for it in the repo.

## Beat 2 — dispatch, and narrate the work (90s)

Click **Dispatch AI agent → TF-101**.

> "No one is at a terminal. That click signed a webhook and fired a MARS
> trigger. A sandbox on DigitalOcean is now running a coding agent."

As the feed fills, narrate what is actually appearing — do not read it out:

- the rendered prompt, so they see the ticket became the instruction
- the first tool calls resetting the workspace and reproducing the failure
  > "It reproduces before it fixes. That's in the skill we attached, not luck."
- the edit, then `npm test`
  > "It's proving the fix against the repo's own suite, not asserting it works."
- `git push`, then `gh pr create`
- the token and cost counters
  > "Every tool call, argument and duration here is streamed from the session's
  > event API. This isn't a progress bar we drew — it's the agent's telemetry."

## Beat 3 — the guardrail (30s)

Switch to **TF-105**, which asks for the same fix *and* `rm -rf ./legacy`.
Dispatch it.

> "This ticket asks for something the policy denies. Watch."

When the blocked card appears in the feed:

> "That's blocked at the platform, not by the model's good judgement — the
> refusal comes back as a failed tool call with the matching rule attached."

Then be honest about what it does next, because it is the more interesting
point and an observant client will spot it anyway:

> "Watch what it tries next. A deny rule stops that specific command, not the
> intent behind it — here it reaches for another way to get the same result.
> That's exactly what the docs warn about: to constrain a capability you have to
> cover the routes to it, and verify on a live session. What you get from the
> platform is a hard stop on the thing you named, and a record of the attempt."

Open **Guardrails** and show the deny rules and the egress allowlist.

> "This is the actual manifest that session ran under — the panel reads it from
> the file. Note `ask` is not on this list: on an unattended run the platform
> auto-approves prompts so the job can finish, so anything the agent must never
> do is an explicit `deny`."

## Beat 4 — the review (60s)

Back to TF-101. The PR is open; the second feed is now live.

> "Opening that PR fired a GitHub webhook into a second trigger. This is a
> different agent, in a fresh sandbox, with no memory of writing the fix. It
> checks the branch out and runs the tests itself rather than trusting the PR
> body."

Show the verdict, then the real review on GitHub next to the green CI check.

> "It's judging against AGENTS.md in the repo — the same conventions a human
> reviewer would use. It cites the rule it's applying."

## Beat 5 — the close (30s)

> "One click, two agents, about two minutes. A branch, a tested fix, a PR, an
> independent review, and the ticket updated — and a human still owns the
> merge. Neither agent could push to main, force-push, or merge its own
> approval. That's the whole point: this is autonomy you can put bounds on."

## If something goes wrong

| Symptom | What to do |
|---|---|
| Feed stays empty | `doctl harness-runtime logs taskflow-fixer` in a spare terminal — narrate from there |
| Agent's patch is wrong | Let it be, and lean into it: the reviewer should catch it. That is a *better* demo of the review gate |
| Dispatch errors | An env var is missing; fall back to the recording |
| Run is slow | Cut to the pre-recorded run; keep talking over it |

Keep a clean recorded run on disk as a backup. MARS is Private Preview with no
SLA, so treat a live run as the bonus rather than the plan.
