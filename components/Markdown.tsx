import type { ReactNode } from 'react';

/**
 * A deliberately small markdown renderer for agent prose.
 *
 * The agents emit only headings, bold and inline code (plus the occasional
 * fenced block), so a full markdown dependency would be weight for nothing.
 *
 * Only ever apply this to agent prose. Tool arguments, command output and YAML
 * must render verbatim — a stray asterisk in a shell command is an asterisk,
 * not emphasis.
 */

/** Render `**bold**` and `` `code` `` within a single line. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      out.push(
        <strong key={`${keyBase}-b${i++}`} className="font-semibold text-primary">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      out.push(
        <code key={`${keyBase}-c${i++}`} className="mono bg-code text-blue rounded px-1 py-px">
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let fence: string[] | null = null;
  let key = 0;

  const flushFence = () => {
    if (!fence) return;
    blocks.push(
      <pre
        key={`f${key++}`}
        className="mono bg-code border border-edge rounded-md px-3 py-2 my-2 overflow-x-auto text-secondary"
      >
        {fence.join('\n')}
      </pre>,
    );
    fence = null;
  };

  // Collect a run of 4-space-indented lines as one code block.
  let indented: string[] | null = null;
  const flushIndented = () => {
    if (!indented) return;
    blocks.push(
      <pre
        key={`i${key++}`}
        className="mono bg-code border border-edge rounded-md px-3 py-2 my-2 overflow-x-auto text-secondary whitespace-pre-wrap break-all"
      >
        {indented.join('\n').replace(/\s+$/, '')}
      </pre>,
    );
    indented = null;
  };

  for (const line of lines) {
    if (!fence && /^ {4,}\S/.test(line)) {
      (indented ??= []).push(line.replace(/^ {4}/, ''));
      continue;
    }
    if (indented && line.trim() === '') {
      indented.push('');
      continue;
    }
    if (indented) flushIndented();

    if (line.trimStart().startsWith('```')) {
      if (fence) flushFence();
      else fence = [];
      continue;
    }
    if (fence) {
      fence.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push(
        <div key={`h${key++}`} className="text-base font-semibold text-primary mt-3 mb-1">
          {inline(heading[2], `h${key}`)}
        </div>,
      );
      continue;
    }

    if (line.trim() === '') {
      blocks.push(<div key={`s${key++}`} className="h-2" />);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      blocks.push(
        <div key={`l${key++}`} className="flex gap-2 pl-1">
          <span className="text-subtle select-none">•</span>
          <span className="flex-1">{inline(bullet[1], `l${key}`)}</span>
        </div>,
      );
      continue;
    }

    blocks.push(<div key={`p${key++}`}>{inline(line, `p${key}`)}</div>);
  }
  flushFence();
  flushIndented();

  return <div className="text-base leading-relaxed text-secondary">{blocks}</div>;
}
