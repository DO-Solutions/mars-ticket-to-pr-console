import { applyEvent } from './consume';
import { createRun, updateRun, type Run } from './store';
import type { MarsEvent } from './mars';

/**
 * Replay a captured session transcript into the store.
 *
 * MARS is a Private Preview with no SLA, and a recorded demo should never
 * depend on a live sandbox. A fixture captured from a real run (see
 * scripts/capture-run.sh) replays through exactly the same reducer as a live
 * stream, so the feed renders identically — the UI cannot tell the difference,
 * and neither can the audience. Label it honestly when you use it.
 */
export function parseFixture(text: string): MarsEvent[] {
  const out: MarsEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      out.push(JSON.parse(line.slice(6)) as MarsEvent);
    } catch {
      /* skip malformed lines */
    }
  }
  return out;
}

export function startReplay(
  events: MarsEvent[],
  meta: { runId: string; role: Run['role']; ticket: string; speed?: number },
): void {
  const speed = meta.speed ?? 1;

  createRun({
    id: meta.runId,
    role: meta.role,
    ticket: meta.ticket,
    sessionId: 'replay',
    status: 'running',
    startedAt: Date.now(),
    feed: [],
    tokensIn: 0,
    tokensOut: 0,
    costMicros: 0,
  });

  // Preserve the original run's pacing so the replay feels like the real thing
  // rather than dumping the whole transcript at once.
  const t0 = events.find((e) => e.timestamp)?.timestamp;
  const base = t0 ? Date.parse(t0) : Date.now();

  events.forEach((ev) => {
    const offset = ev.timestamp ? Date.parse(ev.timestamp) - base : 0;
    const delay = Math.max(0, offset) / speed;
    setTimeout(() => {
      const done = applyEvent(meta.runId, ev);
      if (done) updateRun(meta.runId, { status: 'succeeded', endedAt: Date.now() });
    }, delay);
  });
}
