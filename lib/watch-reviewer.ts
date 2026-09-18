import { getSession, listExecutions } from './mars';
import { consumeSession } from './consume';
import { createRun, markReviewerExecutionSeen } from './store';

/**
 * Watch the reviewer trigger for new executions.
 *
 * The reviewer is fired by GitHub, not by this app, so the only way to learn a
 * review is happening is to poll the trigger's executions. Two things to be
 * careful about:
 *
 *  - The execution list is the trigger's whole history. Attaching to all of it
 *    means attaching to sessions destroyed hours ago, which 404 and litter the
 *    board with failed empty runs — and the UI can then show one of those
 *    instead of the live run. So only executions that started after this
 *    watcher did are considered.
 *  - A fresh-mode session is destroyed when its run ends, so check the session
 *    is still alive before creating a run for it. Otherwise we create a run we
 *    can never populate.
 */
export function watchReviewer(ticket: string, opts: { forMs?: number } = {}): void {
  const triggerId = process.env.MARS_REVIEWER_TRIGGER_ID;
  if (!triggerId) return;

  const startedAt = Date.now();
  const deadline = startedAt + (opts.forMs ?? 12 * 60 * 1000);
  // The reviewer fires once the fixer opens its pull request, a minute or two
  // after dispatch. A small backdate absorbs clock skew without reaching back
  // into history.
  const since = startedAt - 60_000;

  const tick = async (): Promise<void> => {
    if (Date.now() > deadline) return;
    try {
      for (const ex of await listExecutions(triggerId)) {
        if (!ex.session_id) continue;

        const created = ex.created_at ? Date.parse(ex.created_at) : 0;
        if (!created || created < since) continue; // history, not ours

        if (!markReviewerExecutionSeen(ex.execution_id)) continue;

        const session = await getSession(ex.session_id);
        if (!session || session.status.includes('DESTROYED')) {
          console.log(`[watch] skipping ${ex.execution_id.slice(0, 8)} — session already gone`);
          continue;
        }

        console.log(`[watch] picked up reviewer execution ${ex.execution_id.slice(0, 8)}`);
        createRun({
          id: ex.execution_id,
          role: 'reviewer',
          ticket,
          sessionId: ex.session_id,
          status: 'running',
          startedAt: Date.now(),
          feed: [],
          tokensIn: 0,
          tokensOut: 0,
          costMicros: 0,
        });
        void consumeSession(ex.execution_id, ex.session_id);
      }
    } catch {
      // Transient API failure: try again on the next tick.
    }
    setTimeout(() => void tick(), 2000);
  };

  void tick();
}
