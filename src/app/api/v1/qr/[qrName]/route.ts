import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireApiKey } from '@/lib/auth/requireApiKey';
import { db } from '@/lib/db/client';
import { InvalidTargetUrlError } from '@/lib/qr/batch';
import { getQrDetail } from '@/lib/qr/detail';
import { QrNotFoundError } from '@/lib/qr/errors';
import { updateQrTarget } from '@/lib/qr/updateTarget';

/** Public API — fetch a single QR code. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ qrName: string }> },
) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  const { qrName } = await params;
  try {
    const detail = await getQrDetail(db, qrName);
    return NextResponse.json({ qr: detail });
  } catch (error) {
    if (error instanceof QrNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

const bodySchema = z.object({
  targetUrl: z.string().min(1),
});

/** Public API — change where a QR points. Audit-logged with a null adminId (not a dashboard admin). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ qrName: string }> },
) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  const { qrName } = await params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await updateQrTarget(db, qrName, parsed.data.targetUrl, null);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof QrNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidTargetUrlError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
