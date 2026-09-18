import { NextResponse } from 'next/server';
import { fireTrigger, latestSeq } from '@/lib/mars';
import { consumeSession } from '@/lib/consume';
import { watchReviewer } from '@/lib/watch-reviewer';
import { createRun, getTicket, moveTicket, addComment } from '@/lib/store';

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
  const sessionId = conf('MARS_FIXER_SESSION_ID');
  if (!triggerId || !secret || !sessionId) {
    return NextResponse.json(
      {
        error:
          'MARS is not configured on this app. Set MARS_FIXER_TRIGGER_ID, ' +
          'MARS_FIXER_TRIGGER_SECRET and MARS_FIXER_SESSION_ID from the output of ' +
          'scripts/setup-mars.sh.',
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

  // Read the session's position first: the fixer reuses a warm session, so
  // everything already in its transcript belongs to previous runs.
  const watermark = await latestSeq(sessionId);

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

  void consumeSession(executionId, sessionId, { afterSeq: watermark });
  watchReviewer(ticket.key);

  moveTicket(ticket.key, 'in_progress');
  addComment(ticket.key, {
    author: 'system',
    body: `Dispatched to the MARS fixer agent (execution ${executionId.slice(0, 8)}).`,
    at: Date.now(),
  });

  return NextResponse.json({ ok: true, runId: executionId, sessionId });
}
