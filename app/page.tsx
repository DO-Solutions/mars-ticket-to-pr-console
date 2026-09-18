'use client';

import { useCallback, useEffect, useState } from 'react';
import { Board } from '@/components/Board';
import { AgentFeed } from '@/components/AgentFeed';
import { Outcome } from '@/components/Outcome';
import { AgentsTab } from '@/components/AgentsTab';
import type { Ticket } from '@/lib/seed';
import type { Run } from '@/lib/store';

type ResetSummary = {
  ok: boolean;
  prsClosed?: number;
  branchesDeleted?: number;
  sessionsRemoved?: number;
  warnings?: string[];
  error?: string;
};

export default function Page() {
  const [tab, setTab] = useState<'board' | 'agents'>('board');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<ResetSummary>();
  const [targetRepo, setTargetRepo] = useState<string>();
  const [err, setErr] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([
        fetch('/api/tickets', { cache: 'no-store' }).then((x) => x.json()),
        fetch('/api/runs', { cache: 'no-store' }).then((x) => x.json()),
      ]);
      setTickets(t.tickets ?? []);
      setTargetRepo(t.targetRepo);
      setRuns(r.runs ?? []);
      if (!selected && t.tickets?.length) setSelected(t.tickets[0].key);
    } catch {
      /* transient — the next tick picks it up */
    }
  }, [selected]);

  // 700ms is fast enough that a streamed feed reads as live, without hammering
  // the instance during a recording.
  useEffect(() => {
    void refresh();
    const iv = setInterval(() => void refresh(), 700);
    return () => clearInterval(iv);
  }, [refresh]);

  const ticket = tickets.find((t) => t.key === selected);
  // Prefer a run that actually has something in it: a failed attach leaves an
  // empty run behind, and showing that instead of the live one looks like the
  // feed is broken.
  const pick = (role: 'fixer' | 'reviewer') => {
    const mine = runs.filter((r) => r.ticket === selected && r.role === role);
    return (
      mine.find((r) => r.status === 'running' && r.feed.length > 0) ??
      mine.find((r) => r.feed.length > 0) ??
      mine.find((r) => r.status === 'running') ??
      mine[0]
    );
  };
  const fixerRun = pick('fixer');
  const reviewerRun = pick('reviewer');

  const dispatch = async () => {
    if (!ticket) return;
    setBusy(true);
    setErr(undefined);
    try {
      const res = await fetch(`/api/tickets/${ticket.key}/dispatch`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) setErr(body.error ?? 'dispatch failed');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const reset = async () => {
    setResetting(true);
    setResetResult(undefined);
    setErr(undefined);
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      setResetResult(await res.json());
    } catch (e) {
      setResetResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setResetting(false);
      void refresh();
    }
  };

  const canDispatch = ticket && !busy && !resetting && fixerRun?.status !== 'running';

  return (
    <main className="min-h-screen p-5 max-w-[1800px] mx-auto">
      <header className="flex flex-wrap items-center gap-4 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-primary">TaskFlow Ops</h1>
          <p className="text-sm text-muted pt-0.5">
            A ticket becomes a reviewed pull request — worked by agents on DigitalOcean Managed Agents
          </p>
        </div>

        <nav className="flex items-center gap-1 ml-2" aria-label="Views">
          {([
            ['board', 'Board & runs'],
            ['agents', 'Agents & guardrails'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id}
              className={`text-base px-3 py-1.5 rounded transition ${
                tab === id ? 'bg-do-blue/20 text-primary font-medium' : 'text-muted hover:text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={reset}
            disabled={resetting}
            title="Close agent PRs, delete their branches, clear the board"
            className="text-sm px-3 py-1.5 rounded border border-edge text-muted hover:text-primary hover:border-edge-hi transition disabled:opacity-50"
          >
            {resetting ? 'resetting…' : 'reset demo'}
          </button>
          <button
            onClick={dispatch}
            disabled={!canDispatch}
            className="text-base font-medium px-4 py-1.5 rounded bg-do-blue text-white hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            {fixerRun?.status === 'running'
              ? 'Agent working…'
              : `Dispatch AI agent${ticket ? ` → ${ticket.key}` : ''}`}
          </button>
        </div>
      </header>

      {err && (
        <div className="mb-3 rounded-lg border border-red/60 bg-red/10 px-3 py-2.5 text-base text-red">
          {err}
        </div>
      )}

      {resetResult && (
        <div
          className={`mb-3 rounded-lg border px-3 py-2.5 text-base ${
            resetResult.ok ? 'border-green/50 bg-green/10 text-green' : 'border-red/60 bg-red/10 text-red'
          }`}
        >
          {resetResult.ok ? (
            <>
              Reset complete — {resetResult.prsClosed ?? 0} pull request(s) closed,{' '}
              {resetResult.branchesDeleted ?? 0} branch(es) deleted,{' '}
              {resetResult.sessionsRemoved ?? 0} session(s) removed.
              {resetResult.warnings?.length ? (
                <div className="text-sm text-amber pt-1.5">{resetResult.warnings.join(' · ')}</div>
              ) : null}
            </>
          ) : (
            <>Reset failed: {resetResult.error}</>
          )}
        </div>
      )}

      {tab === 'agents' ? (
        <AgentsTab targetRepo={targetRepo} />
      ) : (
        <>
          <Board tickets={tickets} selected={selected} onSelect={setSelected} />

          {ticket && (
            <div className="mt-3 rounded-lg border border-edge bg-panel p-3.5">
              <div className="flex flex-wrap items-start gap-2.5">
                <span className="mono text-base text-blue">{ticket.key}</span>
                <span className="text-lg text-primary font-medium">{ticket.summary}</span>
                <span className="ml-auto text-sm text-muted">reported by {ticket.reporter}</span>
              </div>
              <p className="text-base leading-relaxed text-secondary pt-2.5 whitespace-pre-wrap">
                {ticket.description}
              </p>
              {ticket.expectsBlockedAction && (
                <div className="mt-2.5 rounded-md border border-amber/50 bg-amber/10 px-3 py-2 text-sm text-amber">
                  This ticket deliberately asks for something the agent policy denies. Watch the feed
                  refuse it — and watch what it reaches for next.
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-3">
            <div className="xl:col-span-2 h-[640px]">
              <AgentFeed
                tabs={[
                  { id: 'fixer', label: 'Fixer agent', run: fixerRun },
                  { id: 'reviewer', label: 'Reviewer agent', run: reviewerRun },
                ]}
              />
            </div>
            <Outcome ticket={ticket} />
          </div>
        </>
      )}

      <footer className="pt-5 text-sm text-subtle text-center">
        The board stands in for Jira — in production this is Action Gateway&apos;s Jira connector.
        Everything else (sessions, tool calls, token counts, pull requests, reviews) is real.
      </footer>
    </main>
  );
}
