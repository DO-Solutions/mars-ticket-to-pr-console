import { NextResponse } from 'next/server';
import { fireTrigger, setTriggerStatus, waitForExecutionSession } from '@/lib/mars';
import { consumeSession } from '@/lib/consume';
import { watchReviewer } from '@/lib/watch-reviewer';
import { createRun, getTicket, moveTicket, addComment, updateRun } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ticket = getTicket(key);
  if (!ticket) return NextResponse.json({ error: 'unknown ticket' }, { status: 404 });

  // An unset variable and a leftover REPLACE_ME placeholder are the same
  // problem, and both should say so rather than failing somewhere downstream.
  const conf = (name: string): string | undefined => {
    const v = process.env[name];
    return !v || v === 'REPLACE_ME' ? undefined : v;
  };
  const triggerId = conf('MARS_FIXER_TRIGGER_ID');
  const secret = conf('MARS_FIXER_TRIGGER_SECRET');
  if (!triggerId || !secret) {
    return NextResponse.json(
      {
        error:
          'MARS is not configured on this app. Set MARS_FIXER_TRIGGER_ID and ' +
          'MARS_FIXER_TRIGGER_SECRET from the output of scripts/setup-mars.sh.',
      },
      { status: 500 },
    );
  }

  // The payload keys must line up with the {{.ticket.*}} placeholders in
  // prompts/fixer.tmpl — MARS renders those against this body.
  const payload = {
    ticket: {
      key: ticket.key,
      type: ticket.type,
      summary: ticket.summary,
      description: ticket.description,
      reporter: ticket.reporter,
    },
  };

  // Reset leaves the reviewer trigger paused so that closing pull requests
  // cannot spawn executions. Re-arm it here, so it is live for this run.
  const reviewerTrigger = process.env.MARS_REVIEWER_TRIGGER_ID;
  if (reviewerTrigger) await setTriggerStatus(reviewerTrigger, 'active');

  let executionId: string;
  try {
    ({ executionId } = await fireTrigger(triggerId, secret, payload));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  // The run exists before its sandbox does: with a fresh-mode trigger the
  // session is created by the firing, so record the run now and attach as soon
  // as the execution tells us where it landed.
  createRun({
    id: executionId,
    role: 'fixer',
    ticket: ticket.key,
    status: 'running',
    startedAt: Date.now(),
    feed: [],
    tokensIn: 0,
    tokensOut: 0,
    costMicros: 0,
  });

  void (async () => {
    const sessionId = await waitForExecutionSession(triggerId, executionId);
    if (!sessionId) {
      console.error(`[dispatch ${executionId}] execution never reported a session`);
      updateRun(executionId, { status: 'failed', error: 'the run never started a sandbox' });
      return;
    }
    console.log(`[dispatch ${executionId}] sandbox ${sessionId}`);
    updateRun(executionId, { sessionId });
    await consumeSession(executionId, sessionId, { triggerId });
  })();
  watchReviewer(ticket.key);

  moveTicket(ticket.key, 'in_progress');
  addComment(ticket.key, {
    author: 'system',
    body: `Dispatched to the MARS fixer agent (execution ${executionId.slice(0, 8)}).`,
    at: Date.now(),
  });

  return NextResponse.json({ ok: true, runId: executionId });
}
