import { NextResponse } from 'next/server';
import { getPr } from '@/lib/github';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const pr = await getPr(Number(number));
  if (!pr) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(pr);
}
