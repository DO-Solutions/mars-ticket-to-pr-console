import { seedTickets, type Ticket, type Comment, type Column } from './seed';

export type FeedItem =
  | { kind: 'prompt'; text: string; at: number }
  | { kind: 'text'; text: string; reasoning: boolean; at: number }
  | { kind: 'tool'; id: string; name: string; input: unknown; ok?: boolean; durationMs?: number; summary?: string; at: number }
  | { kind: 'log'; level: number; message: string; at: number }
  | { kind: 'blocked'; detail: string; at: number }
  | { kind: 'done'; tokensIn: number; tokensOut: number; costMicros: number; at: number };

export type Run = {
  id: string;
  role: 'fixer' | 'reviewer';
  ticket: string;
  sessionId?: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  startedAt: number;
  endedAt?: number;
  feed: FeedItem[];
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
  prUrl?: string;
  error?: string;
};

type State = {
  tickets: Map<string, Ticket>;
  runs: Map<string, Run>;
  /** Reviewer executions already picked up, so the watcher doesn't double-attach. */
  seenReviewerExecutions: Set<string>;
};

// Next.js can re-evaluate modules across requests and HMR reloads; keep the
// demo's state on the global object so a dispatch isn't lost mid-run.
const g = globalThis as unknown as { __marsDemo?: State };

function init(): State {
  return {
    tickets: new Map(seedTickets().map((t) => [t.key, t])),
    runs: new Map(),
    seenReviewerExecutions: new Set(),
  };
}

function state(): State {
  if (!g.__marsDemo) g.__marsDemo = init();
  return g.__marsDemo;
}

export function reset(): void {
  g.__marsDemo = init();
}

// ---- tickets ----

export function listTickets(): Ticket[] {
  return [...state().tickets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function getTicket(key: string): Ticket | undefined {
  return state().tickets.get(key);
}

export function moveTicket(key: string, column: Column): void {
  const t = state().tickets.get(key);
  if (t) t.column = column;
}

export function addComment(key: string, comment: Comment): void {
  const t = state().tickets.get(key);
  if (!t) return;
  t.comments.push(comment);
  if (comment.prUrl) t.prUrl = comment.prUrl;
}

// ---- runs ----

export function createRun(run: Run): Run {
  state().runs.set(run.id, run);
  const t = state().tickets.get(run.ticket);
  if (t && !t.runIds.includes(run.id)) t.runIds.push(run.id);
  return run;
}

export function getRun(id: string): Run | undefined {
  return state().runs.get(id);
}

export function listRuns(): Run[] {
  return [...state().runs.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export function updateRun(id: string, patch: Partial<Run>): void {
  const r = state().runs.get(id);
  if (r) Object.assign(r, patch);
}

export function appendFeed(id: string, item: FeedItem): void {
  const r = state().runs.get(id);
  if (!r) return;

  // Coalesce consecutive streamed text of the same kind into one bubble, so the
  // feed reads as prose instead of hundreds of one-token rows.
  const last = r.feed[r.feed.length - 1];
  if (item.kind === 'text' && last?.kind === 'text' && last.reasoning === item.reasoning) {
    // The agent emits runs of 20+ newlines between tool calls. Kept verbatim
    // they leave the feed looking mostly empty, so collapse any run of three
    // or more into a single blank line.
    last.text = `${last.text}${item.text}`.replace(/\n{3,}/g, '\n\n');
    return;
  }

  // Collapse a log line repeated back to back (the runtime emits some in bursts).
  if (item.kind === 'log' && last?.kind === 'log' && last.message === item.message) return;

  if (item.kind === 'tool' && item.ok !== undefined) {
    // A completion event: fold it into the matching started event.
    const started = [...r.feed].reverse().find((f) => f.kind === 'tool' && f.id === item.id) as
      | Extract<FeedItem, { kind: 'tool' }>
      | undefined;
    if (started) {
      started.ok = item.ok;
      started.durationMs = item.durationMs;
      started.summary = item.summary;
      return;
    }
  }

  r.feed.push(item);
}

export function markReviewerExecutionSeen(id: string): boolean {
  const s = state();
  if (s.seenReviewerExecutions.has(id)) return false;
  s.seenReviewerExecutions.add(id);
  return true;
}

export type { Ticket, Comment, Column };
