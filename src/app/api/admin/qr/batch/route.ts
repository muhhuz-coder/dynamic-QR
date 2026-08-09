import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';
import {
  BatchValidationError,
  buildBatchEntriesFromBaseName,
  createQrBatch,
  DuplicateQrNamesError,
  InvalidTargetUrlError,
} from '@/lib/qr/batch';

const bodySchema = z.object({
  baseName: z.string().min(1).max(50),
  quantity: z.number().int().min(1).max(100),
  targetUrl: z.string().min(1),
  productType: z.enum(['STAND', 'COIN', 'CARD']).optional(),
});

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { baseName, quantity, targetUrl, productType } = parsed.data;
  const entries = buildBatchEntriesFromBaseName(baseName, quantity, targetUrl, productType);

  try {
    const result = await createQrBatch(db, entries, baseName);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateQrNamesError) {
      return NextResponse.json({ error: error.message, names: error.names }, { status: 409 });
    }
    if (error instanceof InvalidTargetUrlError) {
      return NextResponse.json({ error: error.message, urls: error.urls }, { status: 400 });
    }
    if (error instanceof BatchValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
