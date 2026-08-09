import { NextResponse, type NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';
import { getQrAnalytics, type AnalyticsPeriod } from '@/lib/qr/analytics';
import { QrNotFoundError } from '@/lib/qr/errors';

const VALID_PERIODS: AnalyticsPeriod[] = ['7d', '30d', '90d', 'all'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ qrName: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { qrName } = await params;
  const periodParam = request.nextUrl.searchParams.get('period') ?? '30d';
  const period = (VALID_PERIODS as string[]).includes(periodParam)
    ? (periodParam as AnalyticsPeriod)
    : '30d';

  try {
    const analytics = await getQrAnalytics(db, qrName, period);
    return NextResponse.json({ qrName, period, analytics });
  } catch (error) {
    if (error instanceof QrNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
