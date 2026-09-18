'use client';

import type { Ticket } from '@/lib/seed';

const COLUMNS: { id: Ticket['column']; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'done', label: 'Done' },
];

const TYPE_STYLE: Record<string, string> = {
  Bug: 'bg-red/15 text-red border-red/40',
  Feature: 'bg-do-blue/15 text-blue border-do-blue/40',
  Chore: 'bg-muted/15 text-muted border-muted/40',
};

export function Board({
  tickets,
  selected,
  onSelect,
}: {
  tickets: Ticket[];
  selected?: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      {COLUMNS.map((col) => {
        const items = tickets.filter((t) => t.column === col.id);
        return (
          <div key={col.id} className="rounded-lg bg-panel border border-edge p-2.5 min-h-[170px]">
            <div className="flex items-center justify-between px-0.5 pb-2.5">
              <span className="text-sm font-semibold uppercase tracking-wider text-muted">
                {col.label}
              </span>
              <span className="text-sm text-subtle">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((t) => (
                <button
                  key={t.key}
                  onClick={() => onSelect(t.key)}
                  aria-current={selected === t.key}
                  className={`w-full text-left rounded-md border p-2.5 transition ${
                    selected === t.key
                      ? 'border-do-blue bg-do-blue/10'
                      : 'border-edge bg-raised hover:border-edge-hi'
                  }`}
                >
                  <div className="flex items-center gap-2 pb-1.5">
                    <span className="mono text-sm text-blue">{t.key}</span>
                    <span className={`mono text-xs px-1.5 py-px rounded border ${TYPE_STYLE[t.type]}`}>
                      {t.type}
                    </span>
                  </div>
                  <div className="text-base leading-snug text-primary">{t.summary}</div>
                  {t.comments.length > 0 && (
                    <div className="pt-1.5 text-sm text-muted">
                      {t.comments.length} comment{t.comments.length === 1 ? '' : 's'}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
