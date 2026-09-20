import { NextResponse } from 'next/server';
import { listRuns } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ runs: listRuns() });
}
