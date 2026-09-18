const GH = 'https://api.github.com';

function repo(): string {
  return process.env.TARGET_REPO ?? 'DO-Solutions/mars-ticket-to-pr-taskflow';
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export type PrState = {
  number: number;
  title: string;
  url: string;
  branch: string;
  state: string;
  merged: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  checks: { status: string; conclusion: string | null };
  reviews: { author: string; state: string; declaredState?: string; body: string; at: string }[];
};

/** Read the verdict the agent declared in its review body. */
function verdictFromBody(body: string): string {
  const head = body.slice(0, 120).toUpperCase();
  if (/REQUEST[_ ]?CHANGES|CHANGES[_ ]REQUESTED/.test(head)) return 'CHANGES_REQUESTED';
  if (/\bAPPROVE(D)?\b/.test(head)) return 'APPROVED';
  return 'COMMENTED';
}

export async function getPr(number: number): Promise<PrState | null> {
  const r = await fetch(`${GH}/repos/${repo()}/pulls/${number}`, { headers: headers(), cache: 'no-store' });
  if (!r.ok) return null;
  const pr = (await r.json()) as any;

  const [reviewsRes, checksRes] = await Promise.all([
    fetch(`${GH}/repos/${repo()}/pulls/${number}/reviews`, { headers: headers(), cache: 'no-store' }),
    fetch(`${GH}/repos/${repo()}/commits/${pr.head.sha}/check-runs`, { headers: headers(), cache: 'no-store' }),
  ]);

  const reviews = reviewsRes.ok
    ? ((await reviewsRes.json()) as any[]).map((v) => ({
        author: v.user?.login ?? 'unknown',
        // GitHub refuses APPROVED / CHANGES_REQUESTED when the reviewer is the
        // pull request's own author, so a single-identity setup can only ever
        // produce COMMENTED. The agent states its verdict on the first line, so
        // fall back to that rather than showing no verdict at all.
        state: v.state === 'COMMENTED' ? verdictFromBody(v.body ?? '') : v.state,
        declaredState: v.state,
        body: v.body ?? '',
        at: v.submitted_at,
      }))
    : [];

  let checks = { status: 'unknown', conclusion: null as string | null };
  if (checksRes.ok) {
    const cr = (await checksRes.json()) as any;
    const runs: any[] = cr.check_runs ?? [];
    if (runs.length) {
      const anyRunning = runs.some((x) => x.status !== 'completed');
      checks = {
        status: anyRunning ? 'in_progress' : 'completed',
        conclusion: anyRunning ? null : runs.every((x) => x.conclusion === 'success') ? 'success' : 'failure',
      };
    }
  }

  return {
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    branch: pr.head?.ref ?? '',
    state: pr.state,
    merged: Boolean(pr.merged),
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    changedFiles: pr.changed_files ?? 0,
    checks,
    reviews,
  };
}

export function prNumberFromUrl(url: string): number | null {
  const m = url.match(/\/pull\/(\d+)/);
  return m ? Number(m[1]) : null;
}
