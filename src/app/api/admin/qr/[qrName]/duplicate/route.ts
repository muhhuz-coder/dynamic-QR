import { NextResponse, type NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';
import { duplicateQrCode } from '@/lib/qr/duplicate';
import { QrNotFoundError } from '@/lib/qr/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ qrName: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { qrName } = await params;
  try {
    const copy = await duplicateQrCode(db, qrName);
    return NextResponse.json({ success: true, qrCode: copy }, { status: 201 });
  } catch (error) {
    if (error instanceof QrNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
