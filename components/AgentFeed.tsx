'use client';

import { useEffect, useRef } from 'react';
import type { Run, FeedItem } from '@/lib/store';

function Dur({ ms }: { ms?: number }) {
  if (ms === undefined) return null;
  return <span className="mono text-[10px] text-[#5e6a80]">{ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`}</span>;
}

function ToolCard({ item }: { item: Extract<FeedItem, { kind: 'tool' }> }) {
  const pending = item.ok === undefined;
  const arg = (() => {
    const i = item.input as any;
    if (!i) return '';
    if (typeof i === 'string') return i;
    // Show the most telling field rather than the whole blob.
    const first = i.command ?? i.cmd ?? i.path ?? i.file_path ?? i.pattern ?? i.queries ?? i.url;
    const s = typeof first === 'string' ? first : JSON.stringify(first ?? i);
    return s.length > 220 ? `${s.slice(0, 220)}…` : s;
  })();

  return (
    <div className="feed-item rounded-md border border-[#26304a] bg-[#101725] overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[#151d2e]">
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
            pending ? 'bg-[#d29922] live-dot' : item.ok ? 'bg-[#2ea043]' : 'bg-[#f85149]'
          }`}
        />
        <span className="mono text-[11px] text-[#c9d4e3]">{item.name || 'tool'}</span>
        <span className="ml-auto flex items-center gap-2">
          <Dur ms={item.durationMs} />
          {!pending && !item.ok && <span className="mono text-[10px] text-[#ff8b82]">failed</span>}
        </span>
      </div>
      {arg && <pre className="mono text-[10.5px] leading-relaxed text-[#8b97ad] px-2.5 py-1.5 whitespace-pre-wrap break-all">{arg}</pre>}
      {item.summary && (
        <pre className="mono text-[10px] leading-relaxed text-[#6f7c93] px-2.5 pb-1.5 border-t border-[#1e2740] pt-1.5 whitespace-pre-wrap break-all max-h-24 overflow-hidden">
          {item.summary.slice(0, 400)}
        </pre>
      )}
    </div>
  );
}

function Item({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case 'prompt':
      return (
        <div className="feed-item rounded-md border border-[#0069ff]/40 bg-[#0069ff]/10 px-2.5 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#69a6ff] pb-1">Prompt delivered</div>
          <div className="text-[11.5px] leading-relaxed text-[#c9d4e3] whitespace-pre-wrap">{item.text}</div>
        </div>
      );
    case 'text':
      return (
        <div
          className={`feed-item text-[12px] leading-relaxed whitespace-pre-wrap px-1 ${
            item.reasoning ? 'text-[#7d8aa3] italic' : 'text-[#dbe4ef]'
          }`}
        >
          {item.reasoning && <span className="mono text-[9px] not-italic text-[#5e6a80] pr-1.5">thinking</span>}
          {item.text}
        </div>
      );
    case 'tool':
      return <ToolCard item={item} />;
    case 'blocked':
      return (
        <div className="feed-item rounded-md border border-[#f85149]/50 bg-[#f85149]/10 px-2.5 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#ff8b82] pb-1">
            Blocked by policy
          </div>
          <div className="mono text-[10.5px] leading-relaxed text-[#e0a3a0] whitespace-pre-wrap">{item.detail}</div>
        </div>
      );
    case 'log':
      return (
        <div className="feed-item mono text-[10px] text-[#5e6a80] px-1 truncate">{item.message}</div>
      );
    case 'done':
      return (
        <div className="feed-item rounded-md border border-[#2ea043]/40 bg-[#2ea043]/10 px-2.5 py-2 flex items-center gap-3">
          <span className="text-[11px] font-semibold text-[#7ee08f]">Run complete</span>
          <span className="mono text-[10px] text-[#8b97ad]">
            {item.tokensIn.toLocaleString()} in / {item.tokensOut.toLocaleString()} out
          </span>
        </div>
      );
  }
}

export function AgentFeed({ run, label }: { run?: Run; label: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  const count = run?.feed.length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [count]);

  const running = run?.status === 'running';

  return (
    <div className="flex flex-col h-full rounded-lg border border-[#1e2740] bg-[#0d1220] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e2740] bg-[#101725]">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b97ad]">{label}</span>
        {running && (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#2ea043] live-dot" />
            <span className="mono text-[10px] text-[#7ee08f]">live</span>
          </span>
        )}
        {run && (
          <span className="ml-auto mono text-[10px] text-[#5e6a80]">
            {run.tokensIn > 0 && `${(run.tokensIn / 1000).toFixed(1)}k in · ${run.tokensOut} out`}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {!run && (
          <div className="h-full grid place-items-center text-center px-6">
            <div>
              <div className="text-[12px] text-[#5e6a80]">No run yet.</div>
              <div className="text-[11px] text-[#465268] pt-1">
                Pick a ticket and dispatch an agent — everything shown here is streamed from the
                session's real event feed.
              </div>
            </div>
          </div>
        )}
        {run?.feed.map((item, i) => (
          <Item key={i} item={item} />
        ))}
        {run?.status === 'failed' && (
          <div className="rounded-md border border-[#f85149]/50 bg-[#f85149]/10 px-2.5 py-2 text-[11px] text-[#ff8b82]">
            Run failed{run.error ? `: ${run.error}` : ''}
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
