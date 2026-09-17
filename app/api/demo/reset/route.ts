import { NextResponse } from 'next/server';
import { reset } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST() {
  reset();
  return NextResponse.json({ ok: true });
}
