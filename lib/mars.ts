import crypto from 'node:crypto';

const API = 'https://api.digitalocean.com/v2/agents';

function token(): string {
  const t = process.env.DO_API_TOKEN;
  if (!t) throw new Error('DO_API_TOKEN is not set');
  return t;
}

/**
 * Sign and fire a MARS webhook trigger.
 *
 * Uses the signing scheme reported for the `custom` provider by
 * `doctl harness-runtime triggers list-providers`. The signature covers the
 * exact bytes sent, so sign the serialised body and send that same string —
 * never re-serialise in between.
 */
export async function fireTrigger(
  triggerId: string,
  secret: string,
  payload: unknown,
): Promise<{ executionId: string }> {
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

  const res = await fetch(`${API}/triggers/${triggerId}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DigitalOcean-Signature': `t=${ts},v1=${sig}`,
    },
    body,
    // Fail fast: a dispatch that cannot reach the trigger should report that,
    // not sit until the platform's gateway times the request out.
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`trigger fire failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { execution_id: string };
  return { executionId: json.execution_id };
}

export type Execution = {
  execution_id: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  session_id?: string;
  failure_reason?: string;
};

export async function listExecutions(triggerId: string): Promise<Execution[]> {
  const res = await fetch(`${API}/triggers/${triggerId}/executions`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { executions?: Execution[] } | Execution[];
  return Array.isArray(json) ? json : (json.executions ?? []);
}

export async function getExecution(triggerId: string, executionId: string): Promise<Execution | undefined> {
  const all = await listExecutions(triggerId);
  return all.find((e) => e.execution_id === executionId);
}

export type SessionStatus = string;

export async function getSession(sessionId: string): Promise<{ status: SessionStatus; name?: string } | null> {
  const res = await fetch(`${API}/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { session: { status: string; name: string } };
  return { status: json.session.status, name: json.session.name };
}

/**
 * Open the session event stream. MARS serves this as Server-Sent Events, so the
 * response body is a stream of `event:`/`data:` lines rather than JSON.
 * `replayOnly` fetches the history so far and closes; otherwise it stays open.
 */
export async function openEventStream(
  sessionId: string,
  opts: { replayOnly?: boolean; signal?: AbortSignal } = {},
): Promise<Response> {
  const qs = opts.replayOnly ? '?replay_only=true' : '';
  return fetch(`${API}/sessions/${sessionId}/events${qs}`, {
    headers: { Authorization: `Bearer ${token()}`, Accept: 'text/event-stream' },
    cache: 'no-store',
    signal: opts.signal,
  });
}

/**
 * The highest `seq` currently in a session's transcript.
 *
 * A reused session accumulates history, and its event stream replays from the
 * beginning on every connect. Capturing the position before firing a trigger
 * lets a consumer ignore the previous run's events — without this, a new run
 * immediately inherits the last run's feed and its `run.completed`.
 */
export async function latestSeq(sessionId: string): Promise<number> {
  try {
    const res = await openEventStream(sessionId, { replayOnly: true });
    if (!res.ok) return 0;
    let max = 0;
    for await (const ev of parseEventStream(res)) {
      if (typeof ev.seq === 'number' && ev.seq > max) max = ev.seq;
    }
    return max;
  } catch {
    return 0;
  }
}

export type MarsEvent = {
  event_id?: string;
  session_id?: string;
  seq?: number;
  timestamp?: string;
  type: string;
  data?: Record<string, unknown>;
};

/** Parse an SSE byte stream into MARS events. */
export async function* parseEventStream(res: Response): AsyncGenerator<MarsEvent> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a frame may hold several lines.
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          yield JSON.parse(line.slice(6)) as MarsEvent;
        } catch {
          // A partial or non-JSON data line: skip it rather than killing the stream.
        }
      }
    }
  }
}
