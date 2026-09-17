'use client';

import { useState } from 'react';
import { fixerManifest, reviewerManifest, fixerPrompt, reviewerPrompt } from '@/lib/manifests.generated';

type Tab = 'fixer' | 'reviewer' | 'prompts';

/** Pull the deny rules out of the manifest so they can be shown as a summary. */
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
  const block = yaml.slice(start).split(/\n(?=\S)/)[0];
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).replace(/"/g, ''));
}

/**
 * The committed manifests carry ${CONSOLE_URL}/${CONSOLE_HOST} placeholders,
 * which doctl expands from the environment at session-create time. Show the
 * resolved values so the panel matches what actually ran.
 */
function resolve(yaml: string): string {
  if (typeof window === 'undefined') return yaml;
  return yaml
    .replaceAll('"${CONSOLE_HOST}"', window.location.host)
    .replaceAll('${CONSOLE_HOST}', window.location.host)
    .replaceAll('"${CONSOLE_URL}"', window.location.origin)
    .replaceAll('${CONSOLE_URL}', window.location.origin);
}

export function Guardrails() {
  const [tab, setTab] = useState<Tab>('fixer');
  const yaml = resolve(tab === 'reviewer' ? reviewerManifest : fixerManifest);

  return (
    <div className="rounded-lg border border-[#1e2740] bg-[#0d1220] overflow-hidden flex flex-col">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1e2740] bg-[#101725]">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b97ad] pr-2">Guardrails</span>
        {(['fixer', 'reviewer', 'prompts'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`mono text-[10px] px-2 py-0.5 rounded transition ${
              tab === t ? 'bg-[#0069ff]/20 text-[#69a6ff]' : 'text-[#5e6a80] hover:text-[#8b97ad]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-3 overflow-y-auto max-h-[420px]">
        {tab !== 'prompts' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-[#f85149]/30 bg-[#f85149]/5 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#ff8b82] pb-1.5">
                  Denied outright
                </div>
                <div className="space-y-1">
                  {denyRules(yaml).map((r) => (
                    <div key={r} className="mono text-[10px] text-[#e0a3a0]">
                      {r}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-[#0069ff]/30 bg-[#0069ff]/5 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#69a6ff] pb-1.5">
                  Egress allowlist
                </div>
                <div className="space-y-1">
                  {allowHosts(yaml).map((h) => (
                    <div key={h} className="mono text-[10px] text-[#9cc2ff]">
                      {h}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-md border border-[#26304a] bg-[#0a0e17] p-2">
              <div className="text-[10px] text-[#5e6a80] pb-1.5">
                Credentials are declared as <span className="mono text-[#8b97ad]">secrets</span> slots and injected at
                session-create time — values go to DigitalOcean Secrets Manager and are never returned by the API.
              </div>
              <div className="text-[10px] text-[#5e6a80]">
                Note that <span className="mono text-[#8b97ad]">ask</span> is not a control on unattended runs: the
                platform auto-approves so the run can finish. Anything the agent must never do is a{' '}
                <span className="mono text-[#8b97ad]">deny</span> rule.
              </div>
            </div>
          </>
        )}

        <pre className="mono text-[9.5px] leading-relaxed text-[#8b97ad] whitespace-pre-wrap break-words bg-[#0a0e17] rounded-md border border-[#1e2740] p-2.5 max-h-72 overflow-y-auto">
          {tab === 'prompts' ? `# prompts/fixer.tmpl\n${fixerPrompt}\n\n# prompts/reviewer.tmpl\n${reviewerPrompt}` : yaml}
        </pre>
      </div>
    </div>
  );
}
