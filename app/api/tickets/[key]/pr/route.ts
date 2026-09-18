import { NextResponse } from 'next/server';
import { findAgentPr } from '@/lib/github';
import { getTicket, setTicketPr } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * Resolve (and remember) the agent's pull request for a ticket.
 *
 * Polled by the Outcome pane while it has no PR yet, so the board reflects
 * reality even if the agent never posts its callback.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ticket = getTicket(key);
  if (!ticket) return NextResponse.json({ error: 'unknown ticket' }, { status: 404 });
  if (ticket.prUrl) return NextResponse.json({ prUrl: ticket.prUrl, source: 'known' });

  const found = await findAgentPr(key);
  if (found) setTicketPr(key, found);
  return NextResponse.json({ prUrl: found, source: found ? 'discovered' : null });
}
