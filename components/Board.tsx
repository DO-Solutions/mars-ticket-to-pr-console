'use client';

import type { Ticket } from '@/lib/seed';

const COLUMNS: { id: Ticket['column']; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'done', label: 'Done' },
];

const TYPE_STYLE: Record<string, string> = {
  Bug: 'bg-[#f85149]/15 text-[#ff8b82] border-[#f85149]/30',
  Feature: 'bg-[#0069ff]/15 text-[#69a6ff] border-[#0069ff]/30',
  Chore: 'bg-[#8b97ad]/15 text-[#a8b3c7] border-[#8b97ad]/30',
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
    <div className="grid grid-cols-4 gap-2">
      {COLUMNS.map((col) => {
        const items = tickets.filter((t) => t.column === col.id);
        return (
          <div key={col.id} className="rounded-lg bg-[#0d1220] border border-[#1e2740] p-2 min-h-[150px]">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b97ad]">{col.label}</span>
              <span className="text-[11px] text-[#5e6a80]">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((t) => (
                <button
                  key={t.key}
                  onClick={() => onSelect(t.key)}
                  className={`w-full text-left rounded-md border p-2 transition ${
                    selected === t.key
                      ? 'border-[#0069ff] bg-[#0069ff]/10'
                      : 'border-[#26304a] bg-[#151c2c] hover:border-[#3a4763]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 pb-1">
                    <span className="mono text-[11px] text-[#69a6ff]">{t.key}</span>
                    <span className={`mono text-[9px] px-1 py-px rounded border ${TYPE_STYLE[t.type]}`}>
                      {t.type}
                    </span>
                  </div>
                  <div className="text-[12px] leading-snug text-[#c9d4e3]">{t.summary}</div>
                  {t.comments.length > 0 && (
                    <div className="pt-1 text-[10px] text-[#5e6a80]">{t.comments.length} comment(s)</div>
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
