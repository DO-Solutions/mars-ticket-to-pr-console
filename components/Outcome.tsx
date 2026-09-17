'use client';

import { useEffect, useState } from 'react';
import type { Ticket } from '@/lib/seed';
import type { PrState } from '@/lib/github';

const AUTHOR_STYLE: Record<string, string> = {
  fixer: 'text-[#69a6ff]',
  reviewer: 'text-[#c297ff]',
  system: 'text-[#8b97ad]',
  human: 'text-[#7ee08f]',
};

export function Outcome({ ticket }: { ticket?: Ticket }) {
  const [pr, setPr] = useState<PrState | null>(null);
  const prUrl = ticket?.prUrl;

  useEffect(() => {
    if (!prUrl) {
      setPr(null);
      return;
    }
    const num = prUrl.match(/\/pull\/(\d+)/)?.[1];
    if (!num) return;

    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/prs/${num}`, { cache: 'no-store' });
        if (res.ok && alive) setPr(await res.json());
      } catch {
        /* keep the last good value */
      }
    };
    void load();
    const iv = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [prUrl]);

  if (!ticket) {
    return (
      <div className="rounded-lg border border-[#1e2740] bg-[#0d1220] p-6 text-center text-[12px] text-[#5e6a80]">
        Select a ticket.
      </div>
    );
  }

  const verdict = pr?.reviews.at(-1);

  return (
    <div className="rounded-lg border border-[#1e2740] bg-[#0d1220] overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-[#1e2740] bg-[#101725]">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b97ad]">Outcome</span>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto">
        {pr ? (
          <div className="rounded-md border border-[#26304a] bg-[#101725] p-2.5">
            <div className="flex items-start gap-2">
              <span className="mono text-[11px] text-[#69a6ff]">#{pr.number}</span>
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] text-[#dbe4ef] hover:text-white hover:underline leading-snug flex-1"
              >
                {pr.title}
              </a>
            </div>
            <div className="mono text-[10px] text-[#5e6a80] pt-1.5">{pr.branch}</div>
            <div className="flex items-center gap-3 pt-2 mono text-[10px]">
              <span className="text-[#7ee08f]">+{pr.additions}</span>
              <span className="text-[#ff8b82]">−{pr.deletions}</span>
              <span className="text-[#8b97ad]">
                {pr.changedFiles} file{pr.changedFiles === 1 ? '' : 's'}
              </span>
              <span
                className={
                  pr.checks.conclusion === 'success'
                    ? 'text-[#7ee08f]'
                    : pr.checks.conclusion === 'failure'
                      ? 'text-[#ff8b82]'
                      : 'text-[#d29922]'
                }
              >
                CI{' '}
                {pr.checks.conclusion === 'success'
                  ? 'passing'
                  : pr.checks.conclusion === 'failure'
                    ? 'failing'
                    : 'running'}
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[#26304a] p-3 text-[11px] text-[#5e6a80]">
            No pull request yet.
          </div>
        )}

        {verdict && (
          <div
            className={`rounded-md border p-2.5 ${
              verdict.state === 'APPROVED'
                ? 'border-[#2ea043]/50 bg-[#2ea043]/10'
                : 'border-[#d29922]/50 bg-[#d29922]/10'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  verdict.state === 'APPROVED' ? 'text-[#7ee08f]' : 'text-[#f0c674]'
                }`}
              >
                {verdict.state === 'APPROVED' ? 'Approved' : 'Changes requested'}
              </span>
              <span className="mono text-[10px] text-[#5e6a80]">by {verdict.author}</span>
            </div>
            {verdict.body && (
              <div className="text-[11px] leading-relaxed text-[#c9d4e3] pt-1.5 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {verdict.body}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5e6a80] pb-1.5">
            Ticket activity
          </div>
          <div className="space-y-2">
            {ticket.comments.length === 0 && (
              <div className="text-[11px] text-[#465268]">Nothing yet.</div>
            )}
            {ticket.comments.map((c, i) => (
              <div key={i} className="rounded-md border border-[#1e2740] bg-[#101725] p-2">
                <div className="flex items-center gap-2 pb-1">
                  <span className={`mono text-[10px] font-semibold ${AUTHOR_STYLE[c.author]}`}>
                    {c.author === 'fixer' ? 'fixer agent' : c.author === 'reviewer' ? 'reviewer agent' : c.author}
                  </span>
                  <span className="mono text-[9px] text-[#465268]">
                    {new Date(c.at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-[11px] leading-relaxed text-[#c9d4e3] whitespace-pre-wrap">{c.body}</div>
                {c.prUrl && (
                  <a
                    href={c.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mono text-[10px] text-[#69a6ff] hover:underline inline-block pt-1"
                  >
                    {c.prUrl.replace('https://github.com/', '')}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
