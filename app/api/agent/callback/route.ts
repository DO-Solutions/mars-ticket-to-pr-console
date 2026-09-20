import { NextResponse } from 'next/server';
import { addComment, getTicket, moveTicket, updateRun, listRuns } from '@/lib/store';
import { prNumberFromUrl } from '@/lib/github';

export const dynamic = 'force-dynamic';

type Payload = {
  ticket?: string;
  author?: 'fixer' | 'reviewer';
  status?: string;
  pr_url?: string;
  body?: string;
};

/** Agents post here from inside their sandbox to write back to the board. */
export async function POST(req: Request) {
  const expected = process.env.AGENT_CALLBACK_TOKEN;
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let p: Payload;
  try {
    p = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const key = (p.ticket ?? '').trim().toUpperCase();
  const ticket = key ? getTicket(key) : undefined;
  if (!ticket) return NextResponse.json({ error: `unknown ticket ${key}` }, { status: 404 });

  const author = p.author === 'reviewer' ? 'reviewer' : 'fixer';
  addComment(key, {
    author,
    body: (p.body ?? '').slice(0, 4000) || '(no summary provided)',
    at: Date.now(),
    prUrl: p.pr_url,
  });

  if (p.pr_url) {
    const latest = listRuns().find((r) => r.ticket === key && r.role === author);
    if (latest) updateRun(latest.id, { prUrl: p.pr_url });
  }

  // The board reflects where the work actually is: a fix in review, a review
  // verdict either back with the author or ready for a human to merge.
  if (author === 'fixer' && p.status === 'pr_opened') moveTicket(key, 'in_review');
  if (author === 'reviewer') {
    moveTicket(key, p.status === 'changes_requested' ? 'in_progress' : 'in_review');
  }

  return NextResponse.json({ ok: true, pr: p.pr_url ? prNumberFromUrl(p.pr_url) : null });
}
