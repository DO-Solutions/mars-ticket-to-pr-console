import { NextResponse } from 'next/server';
import { getTicket } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * One ticket, by key.
 *
 * The reviewer agent calls this before it reads any code. Without it the
 * agent's only statement of the problem is the pull request body — written by
 * the agent that wrote the code — so it can check whether a change is good
 * without ever checking whether it solves what was actually reported. Tickets
 * frequently ask for more than their title suggests.
 *
 * Unauthenticated, like the board itself: the demo data is seeded fixtures.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ticket = getTicket(key);
  if (!ticket) return NextResponse.json({ error: 'unknown ticket' }, { status: 404 });
  return NextResponse.json({ ticket });
}
