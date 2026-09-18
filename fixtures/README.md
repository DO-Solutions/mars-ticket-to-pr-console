# Replay fixtures

Captured session transcripts, replayed by `POST /api/demo/replay` so the console
can be demonstrated with no live sandbox. They go through the same reducer as a
live stream, so the feed renders identically.

MARS is a Private Preview with no SLA. Always keep a current fixture so a
recording or a client call never depends on a live sandbox being healthy.

| Fixture | What it is |
|---|---|
| `fixer-TF-104.sse` | a real fixer run on TF-104: reproduce, fix, test, push, open the PR, report back (156 events, 11 tool calls) |

Refresh it after any run you would rather show:

```bash
export DIGITALOCEAN_ACCESS_TOKEN=<a DO PAT>
./scripts/capture-run.sh taskflow-fixer fixer-TF-101
```

Note that only a **reuse**-mode session can be captured this way, since it
persists after its run. The reviewer runs in fresh mode, so capture its run from
the console's own persisted store instead.

Say plainly when you are showing a replay rather than a live run.
