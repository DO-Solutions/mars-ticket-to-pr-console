'use client';

import { useEffect, useState } from 'react';
import type { Ticket } from '@/lib/seed';
import type { PrState } from '@/lib/github';

const AUTHOR_STYLE: Record<string, string> = {
  fixer: 'text-blue',
  reviewer: 'text-violet',
  system: 'text-muted',
  human: 'text-green',
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
      <div className="rounded-lg border border-edge bg-panel p-6 text-center text-base text-subtle">
        Select a ticket.
      </div>
    );
  }

  const verdict = pr?.reviews.at(-1);

  return (
    <div className="rounded-lg border border-edge bg-panel overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-edge bg-raised">
        <span className="text-sm font-semibold uppercase tracking-wider text-muted">Outcome</span>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto">
        {pr ? (
          <div className="rounded-md border border-edge bg-raised p-2.5">
            <div className="flex items-start gap-2">
              <span className="mono text-sm text-blue">#{pr.number}</span>
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="text-base text-primary hover:text-white hover:underline leading-snug flex-1"
              >
                {pr.title}
              </a>
            </div>
            <div className="mono text-xs text-subtle pt-1.5">{pr.branch}</div>
            <div className="flex items-center gap-3 pt-2 mono text-xs">
              <span className="text-green">+{pr.additions}</span>
              <span className="text-red">−{pr.deletions}</span>
              <span className="text-muted">
                {pr.changedFiles} file{pr.changedFiles === 1 ? '' : 's'}
              </span>
              <span
                className={
                  pr.checks.conclusion === 'success'
                    ? 'text-green'
                    : pr.checks.conclusion === 'failure'
                      ? 'text-red'
                      : 'text-amber'
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
          <div className="rounded-md border border-dashed border-edge p-3 text-sm text-subtle">
            No pull request yet.
          </div>
        )}

        {verdict && (
          <div
            className={`rounded-md border p-2.5 ${
              verdict.state === 'APPROVED'
                ? 'border-green/50 bg-green/10'
                : 'border-amber/50 bg-amber/10'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  verdict.state === 'APPROVED' ? 'text-green' : 'text-amber'
                }`}
              >
                {verdict.state === 'APPROVED' ? 'Approved' : 'Changes requested'}
              </span>
              <span className="mono text-xs text-subtle">by {verdict.author}</span>
            </div>
            {verdict.body && (
              <div className="text-sm leading-relaxed text-secondary pt-1.5 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {verdict.body}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-subtle pb-1.5">
            Ticket activity
          </div>
          <div className="space-y-2">
            {ticket.comments.length === 0 && (
              <div className="text-sm text-subtle">Nothing yet.</div>
            )}
            {ticket.comments.map((c, i) => (
              <div key={i} className="rounded-md border border-edge bg-raised p-2">
                <div className="flex items-center gap-2 pb-1">
                  <span className={`mono text-xs font-semibold ${AUTHOR_STYLE[c.author]}`}>
                    {c.author === 'fixer' ? 'fixer agent' : c.author === 'reviewer' ? 'reviewer agent' : c.author}
                  </span>
                  <span className="mono text-xs text-subtle">
                    {new Date(c.at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-sm leading-relaxed text-secondary whitespace-pre-wrap">{c.body}</div>
                {c.prUrl && (
                  <a
                    href={c.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mono text-xs text-blue hover:underline inline-block pt-1"
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
