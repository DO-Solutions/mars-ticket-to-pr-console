import { NextResponse } from 'next/server';
import { fireTrigger } from '@/lib/mars';
import { consumeSession } from '@/lib/consume';
import { watchReviewer } from '@/lib/watch-reviewer';
import { createRun, getTicket, moveTicket, addComment } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ticket = getTicket(key);
  if (!ticket) return NextResponse.json({ error: 'unknown ticket' }, { status: 404 });

  const triggerId = process.env.MARS_FIXER_TRIGGER_ID;
  const secret = process.env.MARS_FIXER_TRIGGER_SECRET;
  const sessionId = process.env.MARS_FIXER_SESSION_ID;
  if (!triggerId || !secret || !sessionId) {
    return NextResponse.json(
      { error: 'MARS_FIXER_TRIGGER_ID, MARS_FIXER_TRIGGER_SECRET and MARS_FIXER_SESSION_ID must be set' },
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

  let executionId: string;
  try {
    ({ executionId } = await fireTrigger(triggerId, secret, payload));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  // The fixer trigger runs in reuse mode, so its session ID is known before the
  // webhook fires and we can follow the run from its first event. The session is
  // not destroyed afterwards either, so its transcript stays replayable.
  createRun({
    id: executionId,
    role: 'fixer',
    ticket: ticket.key,
    sessionId,
    status: 'running',
    startedAt: Date.now(),
    feed: [],
    tokensIn: 0,
    tokensOut: 0,
    costMicros: 0,
  });

  void consumeSession(executionId, sessionId);
  watchReviewer(ticket.key);

  moveTicket(ticket.key, 'in_progress');
  addComment(ticket.key, {
    author: 'system',
    body: `Dispatched to the MARS fixer agent (execution ${executionId.slice(0, 8)}).`,
    at: Date.now(),
  });

  return NextResponse.json({ ok: true, runId: executionId, sessionId });
}
