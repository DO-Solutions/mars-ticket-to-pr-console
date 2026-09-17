import { NextResponse } from 'next/server';
import { listTickets } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ tickets: listTickets() });
}
