'use client';

import { useCallback, useEffect, useState } from 'react';
import { Board } from '@/components/Board';
import { AgentFeed } from '@/components/AgentFeed';
import { Outcome } from '@/components/Outcome';
import { Guardrails } from '@/components/Guardrails';
import type { Ticket } from '@/lib/seed';
import type { Run } from '@/lib/store';

export default function Page() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([
        fetch('/api/tickets', { cache: 'no-store' }).then((x) => x.json()),
        fetch('/api/runs', { cache: 'no-store' }).then((x) => x.json()),
      ]);
      setTickets(t.tickets ?? []);
      setRuns(r.runs ?? []);
      if (!selected && t.tickets?.length) setSelected(t.tickets[0].key);
    } catch {
      /* transient — the next tick will pick it up */
    }
  }, [selected]);

  // 700ms is fast enough that a streamed feed reads as live, without hammering
  // the box during a recording.
  useEffect(() => {
    void refresh();
    const iv = setInterval(() => void refresh(), 700);
    return () => clearInterval(iv);
  }, [refresh]);

  const ticket = tickets.find((t) => t.key === selected);
  const fixerRun = runs.find((r) => r.ticket === selected && r.role === 'fixer');
  const reviewerRun = runs.find((r) => r.ticket === selected && r.role === 'reviewer');

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
    await fetch('/api/demo/reset', { method: 'POST' });
    void refresh();
  };

  // Offline fallback: replay a captured run through the same reducer a live
  // session uses. MARS is a Private Preview with no SLA, so a recording should
  // never be hostage to a live sandbox.
  const replay = async () => {
    if (!ticket) return;
    await fetch('/api/demo/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixture: 'sample-with-tools.sse', ticket: ticket.key, speed: 3 }),
    });
    void refresh();
  };

  const canDispatch = ticket && !busy && fixerRun?.status !== 'running';

  return (
    <main className="min-h-screen p-4 max-w-[1800px] mx-auto">
      <header className="flex items-center gap-3 pb-4">
        <div>
          <h1 className="text-[15px] font-semibold text-[#e6edf3]">TaskFlow Ops</h1>
          <p className="text-[11px] text-[#5e6a80]">
            A ticket becomes a reviewed pull request — worked by agents on DigitalOcean Managed Agents
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={replay}
            title="Replay a captured run — no live sandbox needed"
            className="mono text-[10px] px-2.5 py-1.5 rounded border border-[#26304a] text-[#8b97ad] hover:text-white hover:border-[#3a4763] transition"
          >
            replay (offline)
          </button>
          <button
            onClick={reset}
            className="mono text-[10px] px-2.5 py-1.5 rounded border border-[#26304a] text-[#8b97ad] hover:text-white hover:border-[#3a4763] transition"
          >
            reset demo
          </button>
          <button
            onClick={dispatch}
            disabled={!canDispatch}
            className="text-[12px] font-medium px-3.5 py-1.5 rounded bg-[#0069ff] text-white hover:bg-[#1f7aff] disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            {fixerRun?.status === 'running' ? 'Agent working…' : `Dispatch AI agent${ticket ? ` → ${ticket.key}` : ''}`}
          </button>
        </div>
      </header>

      {err && (
        <div className="mb-3 rounded-md border border-[#f85149]/50 bg-[#f85149]/10 px-3 py-2 text-[11px] text-[#ff8b82]">
          {err}
        </div>
      )}

      <Board tickets={tickets} selected={selected} onSelect={setSelected} />

      {ticket && (
        <div className="mt-3 rounded-lg border border-[#1e2740] bg-[#0d1220] p-3">
          <div className="flex items-start gap-2">
            <span className="mono text-[12px] text-[#69a6ff]">{ticket.key}</span>
            <span className="text-[13px] text-[#e6edf3] font-medium">{ticket.summary}</span>
            <span className="ml-auto mono text-[10px] text-[#5e6a80]">reported by {ticket.reporter}</span>
          </div>
          <p className="text-[11.5px] leading-relaxed text-[#8b97ad] pt-2 whitespace-pre-wrap">{ticket.description}</p>
          {ticket.expectsBlockedAction && (
            <div className="mt-2 rounded border border-[#d29922]/40 bg-[#d29922]/10 px-2 py-1.5 text-[10.5px] text-[#f0c674]">
              This ticket deliberately asks for something the agent policy denies — watch the feed refuse it and
              report it rather than working around it.
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
        <div className="lg:col-span-2 grid grid-rows-2 gap-3 h-[620px]">
          <AgentFeed run={fixerRun} label="Fixer agent — live session feed" />
          <AgentFeed run={reviewerRun} label="Reviewer agent — independent session" />
        </div>
        <div className="space-y-3">
          <Outcome ticket={ticket} />
          <Guardrails />
        </div>
      </div>

      <footer className="pt-4 text-[10px] text-[#3f4859] text-center">
        The board stands in for Jira — in production this is Action Gateway&apos;s Jira connector. Everything else
        (sessions, tool calls, token counts, pull requests, reviews) is real.
      </footer>
    </main>
  );
}
