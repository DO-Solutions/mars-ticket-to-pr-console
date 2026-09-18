import { openEventStream, parseEventStream, type MarsEvent } from './mars';
import { appendFeed, getRun, updateRun } from './store';

/**
 * Internal runtime chatter that carries no meaning for a viewer: harness
 * plumbing, per-turn diffs, and idle pings. Dropping these keeps the feed
 * readable on a recording without hiding anything the agent actually did.
 */
function isNoise(message: string): boolean {
  return (
    message.startsWith('unhandled:') ||
    message === 'session.diff' ||
    message === 'session_idle_awaiting_user'
  );
}

/**
 * Detect a tool call stopped by a `deny` rule.
 *
 * A denied call comes back with ok=false, duration_ms=0 and a summary
 * explaining that a rule prevented it, including the matching rule as JSON.
 * The patterns below are matched against that summary; the keyword list is a
 * loose backstop in case the wording changes.
 */
function looksBlocked(text: string): boolean {
  return (
    /prevents you from using this specific tool call/i.test(text) ||
    /"action"\s*:\s*"deny"/i.test(text) ||
    /\b(denied|blocked by policy|not permitted|permission denied)\b/i.test(text)
  );
}

/** Reduce one MARS event into the run's feed. Returns true if the run finished. */
export function applyEvent(runId: string, ev: MarsEvent): boolean {
  const at = ev.timestamp ? Date.parse(ev.timestamp) : Date.now();
  const d = (ev.data ?? {}) as Record<string, any>;

  switch (ev.type) {
    case 'run.started':
      updateRun(runId, { status: 'running' });
      if (typeof d.agent === 'string') {
        appendFeed(runId, { kind: 'prompt', text: d.agent, at });
      }
      return false;

    case 'run.token_delta':
      if (typeof d.text === 'string' && d.text.length) {
        appendFeed(runId, { kind: 'text', text: d.text, reasoning: Boolean(d.is_reasoning), at });
      }
      return false;

    case 'run.tool_call_started':
      appendFeed(runId, {
        kind: 'tool',
        id: String(d.tool_call_id ?? ''),
        name: String(d.name ?? 'tool'),
        input: d.input,
        at,
      });
      return false;

    case 'run.tool_call_completed': {
      const summary = typeof d.summary === 'string' ? d.summary : undefined;
      appendFeed(runId, {
        kind: 'tool',
        id: String(d.tool_call_id ?? ''),
        name: '',
        input: undefined,
        ok: Boolean(d.ok),
        durationMs: typeof d.duration_ms === 'number' ? d.duration_ms : undefined,
        summary,
        at,
      });
      if (d.ok === false && summary && looksBlocked(summary)) {
        appendFeed(runId, { kind: 'blocked', detail: summary.slice(0, 400), at });
      }
      return false;
    }

    case 'run.usage_recorded': {
      const u = (d.usage ?? {}) as Record<string, number>;
      const r = getRun(runId);
      if (r) {
        updateRun(runId, {
          tokensIn: r.tokensIn + (u.input_tokens ?? 0),
          tokensOut: r.tokensOut + (u.output_tokens ?? 0),
        });
      }
      return false;
    }

    case 'run.log': {
      const message = String(d.message ?? '');
      if (message && !isNoise(message)) {
        appendFeed(runId, { kind: 'log', level: Number(d.level ?? 3), message, at });
        if (looksBlocked(message)) appendFeed(runId, { kind: 'blocked', detail: message.slice(0, 400), at });
      }
      return false;
    }

    case 'run.completed':
      appendFeed(runId, {
        kind: 'done',
        tokensIn: Number(d.total_tokens_in ?? 0),
        tokensOut: Number(d.total_tokens_out ?? 0),
        costMicros: Number(d.run_cost_micros ?? 0),
        at,
      });
      updateRun(runId, {
        status: 'succeeded',
        endedAt: at,
        tokensIn: Number(d.total_tokens_in ?? 0),
        tokensOut: Number(d.total_tokens_out ?? 0),
        costMicros: Number(d.run_cost_micros ?? 0),
      });
      return true;

    default:
      return false;
  }
}

/**
 * Follow a session's event stream and fold everything into the store.
 *
 * This runs server-side and is what makes the feed survive a page reload — and
 * what makes a fresh-mode reviewer run observable at all, since the platform
 * destroys that session (and its retrievable history) the moment it ends.
 */
export async function consumeSession(
  runId: string,
  sessionId: string,
  opts: { timeoutMs?: number; afterSeq?: number } = {},
): Promise<void> {
  const afterSeq = opts.afterSeq ?? 0;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), opts.timeoutMs ?? 15 * 60 * 1000);

  try {
    const res = await openEventStream(sessionId, { signal: ac.signal });
    if (!res.ok) {
      updateRun(runId, { status: 'failed', error: `event stream ${res.status}` });
      return;
    }
    for await (const ev of parseEventStream(res)) {
      // A reused session replays its whole history on connect; anything at or
      // below the watermark belongs to an earlier run.
      if (typeof ev.seq === 'number' && ev.seq <= afterSeq) continue;
      const finished = applyEvent(runId, ev);
      if (finished) break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('abort')) updateRun(runId, { error: msg });
  } finally {
    clearTimeout(timeout);
    ac.abort();
  }
}
