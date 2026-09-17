import { listExecutions } from './mars';
import { consumeSession } from './consume';
import { createRun, markReviewerExecutionSeen } from './store';

/**
 * Watch the reviewer trigger for new executions.
 *
 * The reviewer is fired by GitHub directly, not by this app, so we only learn a
 * review is happening by polling the trigger's executions. Once an execution
 * appears with a session ID we start folding its events into the store — which
 * we must do live, because a fresh-mode session's history is unretrievable the
 * moment the run ends.
 */
export function watchReviewer(ticket: string, opts: { forMs?: number } = {}): void {
  const triggerId = process.env.MARS_REVIEWER_TRIGGER_ID;
  if (!triggerId) return;

  const deadline = Date.now() + (opts.forMs ?? 12 * 60 * 1000);

  const tick = async (): Promise<void> => {
    if (Date.now() > deadline) return;
    try {
      for (const ex of await listExecutions(triggerId)) {
        if (!ex.session_id) continue;
        if (!markReviewerExecutionSeen(ex.execution_id)) continue;

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
      // Transient API failure: just try again on the next tick.
    }
    setTimeout(() => void tick(), 2000);
  };

  void tick();
}
