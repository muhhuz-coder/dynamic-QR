import { NextResponse, type NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';
import { scanEventsToCsv } from '@/lib/qr/csv';
import { QrNotFoundError } from '@/lib/qr/errors';

/** Raw scan-log CSV export for a single QR — unbounded, unlike the analytics endpoint's recentScans cap. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ qrName: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { qrName } = await params;
  const qrCode = await db.qrCode.findUnique({ where: { qrName } });
  if (!qrCode) {
    return NextResponse.json({ error: new QrNotFoundError(qrName).message }, { status: 404 });
  }

  const events = await db.qrScanEvent.findMany({
    where: { qrId: qrCode.id },
    orderBy: { scanTimestamp: 'desc' },
  });

  const csv = scanEventsToCsv(events);
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv',
      'content-disposition': `attachment; filename="${qrName}-scans.csv"`,
    },
  });
}
