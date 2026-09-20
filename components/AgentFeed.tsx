'use client';

import { useEffect, useRef, useState } from 'react';
import type { Run, FeedItem } from '@/lib/store';
import { Markdown } from './Markdown';

function duration(ms?: number): string | null {
  if (ms === undefined) return null;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** The most telling field of a tool's input, rather than the whole blob. */
function describeInput(input: unknown): string {
  if (!input) return '';
  if (typeof input === 'string') return input;
  const i = input as Record<string, unknown>;
  const first = i.command ?? i.cmd ?? i.path ?? i.file_path ?? i.pattern ?? i.queries ?? i.url;
  return typeof first === 'string' ? first : JSON.stringify(first ?? i);
}

function ToolCard({ item }: { item: Extract<FeedItem, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false);
  const pending = item.ok === undefined;
  const cmd = describeInput(item.input);
  const out = item.summary ?? '';
  // Only offer expansion when there is genuinely more to see.
  const long = out.length > 300 || out.split('\n').length > 6;
  const shown = open || !long ? out : out.slice(0, 300);

  return (
    <div className="feed-item rounded-lg border border-edge bg-raised overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-edge">
        <span
          className={`h-2 w-2 rounded-full shrink-0 ${
            pending ? 'bg-amber live-dot' : item.ok ? 'bg-green' : 'bg-red'
          }`}
          aria-hidden
        />
        <span className="mono text-sm text-primary font-medium">{item.name || 'tool'}</span>
        <span className="ml-auto flex items-center gap-2.5">
          {duration(item.durationMs) && (
            <span className="mono text-xs text-muted">{duration(item.durationMs)}</span>
          )}
          {pending && <span className="text-xs text-amber">running</span>}
          {!pending && !item.ok && <span className="text-xs text-red font-medium">blocked / failed</span>}
        </span>
      </div>

      {cmd && (
        <pre className="mono bg-code text-secondary px-3 py-2 whitespace-pre-wrap break-all border-b border-edge">
          {cmd}
        </pre>
      )}

      {out && (
        <div className="px-3 py-2">
          <pre className="mono text-muted whitespace-pre-wrap break-all">{shown}</pre>
          {long && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="mono text-xs text-blue hover:text-primary mt-1.5"
            >
              {open ? 'show less' : `show all (${out.length} chars)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Item({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case 'prompt':
      return (
        <div className="feed-item rounded-lg border border-do-blue/60 bg-do-blue/10 px-3 py-2.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue pb-1.5">
            Prompt delivered
          </div>
          <div className="text-base leading-relaxed text-secondary whitespace-pre-wrap">{item.text}</div>
        </div>
      );

    case 'text':
      if (!item.text.trim()) return null;
      return item.reasoning ? (
        <div className="feed-item border-l-2 border-edge-hi pl-3">
          <div className="mono text-xs uppercase tracking-wider text-subtle pb-1">thinking</div>
          <div className="text-sm leading-relaxed text-muted whitespace-pre-wrap">{item.text}</div>
        </div>
      ) : (
        <div className="feed-item px-0.5">
          <Markdown text={item.text} />
        </div>
      );

    case 'tool':
      return <ToolCard item={item} />;

    case 'blocked':
      return (
        <div className="feed-item rounded-lg border border-red/60 bg-red/10 px-3 py-2.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-red pb-1.5">
            Blocked by policy
          </div>
          <div className="mono text-secondary whitespace-pre-wrap">{item.detail}</div>
        </div>
      );

    case 'log':
      return <div className="feed-item mono text-xs text-subtle px-0.5">{item.message}</div>;

    case 'done':
      return (
        <div className="feed-item rounded-lg border border-green/50 bg-green/10 px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-base font-semibold text-green">Run complete</span>
          <span className="mono text-sm text-secondary">
            {item.tokensIn.toLocaleString()} in / {item.tokensOut.toLocaleString()} out
          </span>
        </div>
      );
  }
}

export type FeedTab = { id: string; label: string; run?: Run };

/**
 * One tall pane showing whichever agent is active.
 *
 * The fixer and reviewer never run at the same time — the reviewer is woken by
 * the pull request the fixer opens — so a single large pane reads far better
 * than two cramped ones, and it follows the active run on its own.
 */
function Elapsed({ run }: { run: Run }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (run.status !== 'running') return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [run.status]);

  const end = run.endedAt ?? now;
  const secs = Math.max(0, Math.round((end - run.startedAt) / 1000));
  const mins = Math.floor(secs / 60);
  return <span className="mono text-xs text-muted">{mins ? `${mins}m ${secs % 60}s` : `${secs}s`}</span>;
}

/**
 * A long model turn emits no events, so silence is normal and must not look
 * like a hang. Runs here have taken from 45 seconds to five and a half
 * minutes.
 */
function Thinking({ run }: { run: Run }) {
  const [quietFor, setQuietFor] = useState(0);
  const last = run.feed.length;
  const stamp = useRef(Date.now());

  useEffect(() => {
    stamp.current = Date.now();
    setQuietFor(0);
  }, [last]);

  useEffect(() => {
    if (run.status !== 'running') return;
    const iv = setInterval(() => setQuietFor(Math.round((Date.now() - stamp.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [run.status]);

  if (run.status !== 'running' || quietFor < 12) return null;
  return (
    <div className="feed-item flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-edge bg-raised">
      <span className="h-2 w-2 rounded-full bg-amber live-dot shrink-0" aria-hidden />
      <span className="text-sm text-secondary">
        Model is working — no output for {quietFor}s. Long turns are normal; runs have taken up to
        five minutes.
      </span>
    </div>
  );
}

export function AgentFeed({ tabs }: { tabs: FeedTab[] }) {
  const [selected, setSelected] = useState(tabs[0]?.id);
  const [userPicked, setUserPicked] = useState(false);
  const [following, setFollowing] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = tabs.find((t) => t.run?.status === 'running');
  const current = tabs.find((t) => t.id === selected) ?? tabs[0];
  const run = current?.run;
  const count = run?.feed.length ?? 0;

  // Follow whichever agent starts working, so nobody has to notice the
  // handover — but stop as soon as the viewer picks a tab themselves, or their
  // click is undone on the next render.
  useEffect(() => {
    if (!userPicked && active && active.id !== selected) setSelected(active.id);
  }, [active, selected, userPicked]);

  useEffect(() => {
    if (following) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [count, following]);

  // Scrolling up should stop the view being yanked away mid-read.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  return (
    <div className="flex flex-col h-full rounded-lg border border-edge bg-panel overflow-hidden">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-edge bg-raised">
        {tabs.map((t) => {
          const isRunning = t.run?.status === 'running';
          return (
            <button
              key={t.id}
              onClick={() => {
                setSelected(t.id);
                setUserPicked(true);
              }}
              className={`flex items-center gap-2 text-sm px-2.5 py-1 rounded transition ${
                t.id === current?.id
                  ? 'bg-do-blue/20 text-primary font-medium'
                  : 'text-muted hover:text-primary'
              }`}
            >
              {t.label}
              {isRunning && <span className="h-2 w-2 rounded-full bg-green live-dot" aria-label="live" />}
            </button>
          );
        })}

        <span className="ml-auto flex items-center gap-3">
          {run && <Elapsed run={run} />}
          {run && run.tokensIn > 0 && (
            <span className="mono text-xs text-muted">
              {(run.tokensIn / 1000).toFixed(1)}k in / {run.tokensOut.toLocaleString()} out
            </span>
          )}
          {!following && (
            <button
              onClick={() => setFollowing(true)}
              className="mono text-xs text-blue hover:text-primary"
            >
              jump to latest ↓
            </button>
          )}
        </span>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {!run && (
          <div className="h-full grid place-items-center text-center px-8">
            <div>
              <div className="text-base text-muted">No run yet.</div>
              <div className="text-sm text-subtle pt-1.5 max-w-md">
                Pick a ticket and dispatch an agent. Everything here is streamed from the session&apos;s
                own event feed — the reasoning, every tool call with its arguments and duration, and the
                token count.
              </div>
            </div>
          </div>
        )}
        {run?.feed.map((item, i) => (
          <Item key={i} item={item} />
        ))}
        {run && <Thinking run={run} />}
        {run?.status === 'failed' && (
          <div className="rounded-lg border border-red/60 bg-red/10 px-3 py-2.5 text-base text-red">
            Run failed{run.error ? `: ${run.error}` : ''}
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
