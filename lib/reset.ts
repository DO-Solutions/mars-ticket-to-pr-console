import { reset as resetStore } from './store';

const GH = 'https://api.github.com';
const MARS = 'https://api.digitalocean.com/v2/agents';

export type ResetSummary = {
  ok: boolean;
  prsClosed: number;
  branchesDeleted: number;
  sessionsRemoved: number;
  warnings: string[];
};

const repo = () => process.env.TARGET_REPO ?? 'DO-Solutions/mars-ticket-to-pr-taskflow';

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

/** Every outbound call is bounded so a reset can never hang the request. */
const timeout = () => AbortSignal.timeout(15_000);

/**
 * Set the reviewer trigger's lifecycle status.
 *
 * Closing a pull request is itself a `pull_request` event, so a reset would
 * otherwise wake the reviewer for every PR it tidies up. The reviewer prompt
 * already exits early on those actions, so this is an optimisation rather than
 * a correctness fix — hence best-effort.
 */
async function setReviewerTrigger(status: 'active' | 'paused'): Promise<string | null> {
  const id = process.env.MARS_REVIEWER_TRIGGER_ID;
  const token = process.env.DO_API_TOKEN;
  if (!id || !token) return null;

  try {
    // PATCH with a status body is the shape that works; PUT returns 405 and
    // there is no /pause sub-resource. Verified against the live API.
    const res = await fetch(`${MARS}/triggers/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
      signal: timeout(),
    });
    if (res.ok) return null;
    return `could not set the reviewer trigger to ${status} (${res.status})`;
  } catch (e) {
    return `could not set the reviewer trigger to ${status}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Close every open pull request whose head branch is the agent's. */
async function closeAgentPrs(warnings: string[]): Promise<number> {
  let closed = 0;
  try {
    const res = await fetch(`${GH}/repos/${repo()}/pulls?state=open&per_page=100`, {
      headers: ghHeaders(),
      cache: 'no-store',
      signal: timeout(),
    });
    if (!res.ok) {
      warnings.push(`could not list pull requests (${res.status})`);
      return 0;
    }
    const prs = (await res.json()) as { number: number; head?: { ref?: string } }[];
    for (const pr of prs) {
      if (!pr.head?.ref?.startsWith('agent/')) continue;
      const r = await fetch(`${GH}/repos/${repo()}/pulls/${pr.number}`, {
        method: 'PATCH',
        headers: ghHeaders(),
        body: JSON.stringify({ state: 'closed' }),
        signal: timeout(),
      });
      if (r.ok) closed++;
      else if (r.status === 403 || r.status === 401) {
        warnings.push('GITHUB_TOKEN cannot close pull requests — it needs write access');
        break;
      } else warnings.push(`could not close #${pr.number} (${r.status})`);
    }
  } catch (e) {
    warnings.push(`closing pull requests failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return closed;
}

/**
 * Delete the agent's branches. This is what actually restores the repository —
 * `main` is never modified, because the agents only ever push branches and a
 * deny rule blocks pushing to main.
 */
async function deleteAgentBranches(warnings: string[]): Promise<number> {
  let deleted = 0;
  try {
    const res = await fetch(`${GH}/repos/${repo()}/git/matching-refs/heads/agent/`, {
      headers: ghHeaders(),
      cache: 'no-store',
      signal: timeout(),
    });
    if (!res.ok) {
      warnings.push(`could not list branches (${res.status})`);
      return 0;
    }
    const refs = (await res.json()) as { ref: string }[];
    for (const { ref } of refs) {
      const name = ref.replace('refs/heads/', '');
      const r = await fetch(`${GH}/repos/${repo()}/git/refs/heads/${name}`, {
        method: 'DELETE',
        headers: ghHeaders(),
        signal: timeout(),
      });
      if (r.ok || r.status === 204) deleted++;
      else if (r.status === 403 || r.status === 401) {
        warnings.push('GITHUB_TOKEN cannot delete branches — it needs write access');
        break;
      } else warnings.push(`could not delete ${name} (${r.status})`);
    }
  } catch (e) {
    warnings.push(`deleting branches failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return deleted;
}

/**
 * Remove leftover reviewer sandboxes.
 *
 * Fresh-mode sessions destroy themselves when their run ends, so this is
 * normally a no-op — it only catches one that is still winding down. It must
 * never touch the warm fixer session, which the fixer trigger is bound to:
 * deleting that breaks the demo until setup-mars.sh is run again.
 */
async function removeOrphanSessions(warnings: string[]): Promise<number> {
  const token = process.env.DO_API_TOKEN;
  if (!token) return 0;
  const keep = process.env.MARS_FIXER_SESSION_ID;
  let removed = 0;

  try {
    const res = await fetch(`${MARS}/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: timeout(),
    });
    if (!res.ok) return 0;

    const { sessions = [] } = (await res.json()) as {
      sessions?: { session_id: string; name?: string; status?: string }[];
    };

    for (const s of sessions) {
      const isReviewerSandbox = (s.name ?? '').startsWith('ht-exec-');
      const isDestroyed = (s.status ?? '').includes('DESTROYED');
      if (!isReviewerSandbox || isDestroyed) continue;
      if (keep && s.session_id === keep) continue; // never the bound fixer session

      const r = await fetch(`${MARS}/sessions/${s.session_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        signal: timeout(),
      });
      if (r.ok || r.status === 204) removed++;
      else warnings.push(`could not remove session ${s.name} (${r.status})`);
    }
  } catch (e) {
    warnings.push(`session cleanup failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return removed;
}

/**
 * Restore the demo to a known-good state.
 *
 * Note what this deliberately does not do: reset the agent's sandbox workspace.
 * That needs `doctl harness-runtime exec` and has no REST equivalent — and it
 * is unnecessary, because step 1 of the fixer's skill resets the workspace at
 * the start of every run.
 */
export async function resetDemo(): Promise<ResetSummary> {
  const warnings: string[] = [];

  const pauseWarning = await setReviewerTrigger('paused');
  if (pauseWarning) warnings.push(pauseWarning);

  const prsClosed = await closeAgentPrs(warnings);
  const branchesDeleted = await deleteAgentBranches(warnings);

  const resumeWarning = await setReviewerTrigger('active');
  if (resumeWarning) warnings.push(resumeWarning);

  const sessionsRemoved = await removeOrphanSessions(warnings);

  resetStore();

  return { ok: true, prsClosed, branchesDeleted, sessionsRemoved, warnings };
}
