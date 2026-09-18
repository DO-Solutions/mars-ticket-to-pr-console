import { NextResponse } from 'next/server';
import { resetDemo } from '@/lib/reset';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  try {
    return NextResponse.json(await resetDemo());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
