'use client';

import { useState, type ReactNode } from 'react';
import {
  fixerManifest,
  reviewerManifest,
  fixerPrompt,
  reviewerPrompt,
  fixerSkill,
  reviewerSkill,
} from '@/lib/manifests.generated';
import { Markdown } from './Markdown';

/**
 * The committed manifests carry ${CONSOLE_URL}/${CONSOLE_HOST} placeholders,
 * which doctl expands from the environment when the session is created. Show
 * the resolved values so this matches what actually ran.
 */
function resolve(text: string, targetRepo?: string): string {
  if (typeof window === 'undefined') return text;
  return (targetRepo
    ? text.replaceAll('"${TARGET_REPO}"', targetRepo).replaceAll('${TARGET_REPO}', targetRepo)
    : text)
    .replaceAll('"${CONSOLE_HOST}"', window.location.host)
    .replaceAll('${CONSOLE_HOST}', window.location.host)
    .replaceAll('"${CONSOLE_URL}"', window.location.origin)
    .replaceAll('${CONSOLE_URL}', window.location.origin);
}

function denyRules(yaml: string): string[] {
  return yaml
    .split('\n')
    .filter((l) => l.includes('action: deny'))
    .map((l) => l.match(/command: "([^"]+)"/)?.[1] ?? '')
    .filter(Boolean);
}

function allowHosts(yaml: string): string[] {
  const start = yaml.indexOf('egress:');
  if (start === -1) return [];
  return yaml
    .slice(start)
    .split(/\n(?=\S)/)[0]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).replace(/"/g, ''));
}

/** Light YAML colouring: comments recede, keys lead, values read as values. */
function highlightYaml(text: string): ReactNode[] {
  return text.split('\n').map((line, i) => {
    if (/^\s*#/.test(line)) {
      return (
        <div key={i} className="text-subtle">
          {line || ' '}
        </div>
      );
    }
    const kv = line.match(/^(\s*-?\s*)([A-Za-z0-9_.-]+)(:)(.*)$/);
    if (kv) {
      return (
        <div key={i}>
          <span className="text-secondary">{kv[1]}</span>
          <span className="text-blue">{kv[2]}</span>
          <span className="text-muted">{kv[3]}</span>
          <span className="text-secondary">{kv[4]}</span>
        </div>
      );
    }
    return (
      <div key={i} className="text-secondary">
        {line || ' '}
      </div>
    );
  });
}

type View =
  | { kind: 'manifest'; label: string; yaml: string }
  | { kind: 'prompt'; label: string; text: string }
  | { kind: 'skill'; label: string; skill: { name: string; description: string; body: string } };

export function AgentsTab({ targetRepo }: { targetRepo?: string }) {
  const views: View[] = [
    { kind: 'manifest', label: 'fixer.yaml', yaml: fixerManifest },
    { kind: 'manifest', label: 'reviewer.yaml', yaml: reviewerManifest },
    { kind: 'skill', label: 'fixer skill', skill: fixerSkill },
    { kind: 'skill', label: 'reviewer skill', skill: reviewerSkill },
    { kind: 'prompt', label: 'fixer prompt', text: fixerPrompt },
    { kind: 'prompt', label: 'reviewer prompt', text: reviewerPrompt },
  ];
  const [idx, setIdx] = useState(0);
  const view = views[idx];
  const yaml = view.kind === 'manifest' ? resolve(view.yaml, targetRepo) : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-lg border border-red/40 bg-red/5 p-3">
          <div className="text-sm font-semibold uppercase tracking-wider text-red pb-2">
            Denied outright
          </div>
          <div className="space-y-1.5">
            {denyRules(fixerManifest).map((r) => (
              <div key={r} className="mono text-secondary">
                {r}
              </div>
            ))}
          </div>
          <div className="text-sm text-muted pt-2.5 leading-relaxed">
            On an unattended run there is nobody to answer an approval prompt, so{' '}
            <span className="mono text-secondary">ask</span> is not a control here. Anything the agent
            must never do is denied outright.
          </div>
        </div>

        <div className="rounded-lg border border-do-blue/40 bg-do-blue/5 p-3">
          <div className="text-sm font-semibold uppercase tracking-wider text-blue pb-2">
            Egress allowlist
          </div>
          <div className="space-y-1.5">
            {allowHosts(resolve(fixerManifest, targetRepo)).map((h) => (
              <div key={h} className="mono text-secondary">
                {h}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-edge bg-panel p-3">
          <div className="text-sm font-semibold uppercase tracking-wider text-muted pb-2">
            Credentials
          </div>
          <div className="text-sm text-muted leading-relaxed">
            Declared as <span className="mono text-secondary">secrets</span> slots and injected when the
            session is created. Values go to DigitalOcean Secrets Manager and are never returned by the
            API or stored in the repository.
          </div>
          <div className="text-sm text-muted leading-relaxed pt-2">
            The reviewer additionally cannot{' '}
            <span className="mono text-secondary">git push</span>,{' '}
            <span className="mono text-secondary">git commit</span> or{' '}
            <span className="mono text-secondary">gh pr merge</span> — it can review and nothing else.
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-edge bg-panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-edge bg-raised">
          {views.map((v, i) => (
            <button
              key={v.label}
              onClick={() => setIdx(i)}
              className={`mono text-sm px-2.5 py-1 rounded transition ${
                i === idx ? 'bg-do-blue/20 text-primary' : 'text-muted hover:text-primary'
              }`}
            >
              {v.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-subtle">
            generated from the repository at build time
          </span>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {view.kind === 'manifest' && (
            <pre className="mono whitespace-pre-wrap break-words">{highlightYaml(yaml ?? '')}</pre>
          )}

          {view.kind === 'prompt' && (
            <pre className="mono text-secondary whitespace-pre-wrap break-words">{view.text}</pre>
          )}

          {view.kind === 'skill' && (
            <div>
              <div className="pb-3 mb-3 border-b border-edge">
                <div className="mono text-base text-blue">{view.skill.name}</div>
                <div className="text-sm text-muted pt-1">{view.skill.description}</div>
              </div>
              <Markdown text={view.skill.body} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
