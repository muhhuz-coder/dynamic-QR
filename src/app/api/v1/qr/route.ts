import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireApiKey } from '@/lib/auth/requireApiKey';
import { db } from '@/lib/db/client';
import {
  buildBatchEntriesFromBaseName,
  createQrBatch,
  DuplicateQrNamesError,
  InvalidTargetUrlError,
} from '@/lib/qr/batch';
import { listQrCodes } from '@/lib/qr/list';

/** Public API — list QR codes. See docs/core-logic/02-qr-management.md. */
export async function GET(request: NextRequest) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  const qrCodes = await listQrCodes(db, {});
  return NextResponse.json({ qrCodes });
}

const createSchema = z.object({
  name: z.string().min(1).max(50),
  targetUrl: z.string().min(1),
  productType: z.enum(['STAND', 'COIN', 'CARD']).optional(),
});

/** Public API — create a single QR code. */
export async function POST(request: NextRequest) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { name, targetUrl, productType } = parsed.data;
  const entries = buildBatchEntriesFromBaseName(name, 1, targetUrl, productType);

  try {
    const result = await createQrBatch(db, entries, name);
    return NextResponse.json({ qr: result.qrs[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateQrNamesError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof InvalidTargetUrlError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
