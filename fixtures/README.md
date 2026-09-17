# Replay fixtures

Captured session transcripts, replayed by `POST /api/demo/replay` so the console
can be demonstrated with no live sandbox. They go through the same reducer as a
live stream, so the feed renders identically.

MARS is a Private Preview with no SLA. Always keep a current fixture so a
recording or a client call never depends on a live sandbox being healthy.

| Fixture | What it is |
|---|---|
| `sample-session.sse` | a short real run — enough to prove the plumbing |
| `sample-with-tools.sse` | a longer real run with tool calls, durations and token accounting |

Both shipped fixtures are **placeholders** captured from unrelated sessions
while the demo was being built. Replace them with a real fixer run as soon as
one succeeds:

```bash
export DIGITALOCEAN_ACCESS_TOKEN=<a DO PAT>
./scripts/capture-run.sh taskflow-fixer fixer-TF-101
```

Note that only a **reuse**-mode session can be captured this way, since it
persists after its run. The reviewer runs in fresh mode, so capture its run from
the console's own persisted store instead.

Say plainly when you are showing a replay rather than a live run.
