import { NextResponse } from 'next/server';
import { listTickets } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    tickets: listTickets(),
    // The Agents tab resolves ${TARGET_REPO} in the manifests so what is shown
    // matches the repo the agents actually worked on.
    targetRepo: process.env.TARGET_REPO ?? 'DO-Solutions/mars-ticket-to-pr-taskflow',
  });
}
