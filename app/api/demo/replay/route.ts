import { NextResponse } from 'next/server';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFixture, startReplay } from '@/lib/replay';
import { getTicket, moveTicket, addComment } from '@/lib/store';

export const dynamic = 'force-dynamic';

const DIR = join(process.cwd(), 'fixtures');

export async function GET() {
  try {
    const files = (await readdir(DIR)).filter((f) => f.endsWith('.sse'));
    return NextResponse.json({ fixtures: files });
  } catch {
    return NextResponse.json({ fixtures: [] });
  }
}

/** Replay a captured transcript. Body: { fixture, ticket?, role?, speed? } */
export async function POST(req: Request) {
  let body: { fixture?: string; ticket?: string; role?: 'fixer' | 'reviewer'; speed?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* defaults below */
  }

  const fixture = body.fixture ?? 'fixer-TF-101.sse';
  const ticket = body.ticket ?? 'TF-101';
  if (!getTicket(ticket)) return NextResponse.json({ error: `unknown ticket ${ticket}` }, { status: 404 });

  // Keep the path inside fixtures/ regardless of what was asked for.
  const safe = fixture.replace(/[^A-Za-z0-9._-]/g, '');
  let text: string;
  try {
    text = await readFile(join(DIR, safe), 'utf8');
  } catch {
    return NextResponse.json({ error: `fixture not found: ${safe}` }, { status: 404 });
  }

  const events = parseFixture(text);
  if (!events.length) return NextResponse.json({ error: 'fixture had no events' }, { status: 400 });

  const runId = `replay-${safe}-${Date.now()}`;
  startReplay(events, { runId, role: body.role ?? 'fixer', ticket, speed: body.speed ?? 1 });

  moveTicket(ticket, 'in_progress');
  addComment(ticket, {
    author: 'system',
    body: `Replaying a captured run from ${safe} (offline mode — no live sandbox).`,
    at: Date.now(),
  });

  return NextResponse.json({ ok: true, runId, events: events.length });
}
