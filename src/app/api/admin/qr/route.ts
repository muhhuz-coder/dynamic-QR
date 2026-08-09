import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';
import { deleteQrCodes } from '@/lib/qr/delete';
import { listQrCodes } from '@/lib/qr/list';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const batchId = request.nextUrl.searchParams.get('batchId') ?? undefined;
  const qrCodes = await listQrCodes(db, { batchId });

  return NextResponse.json({ qrCodes });
}

const bulkDeleteSchema = z.object({
  qrNames: z.array(z.string().min(1)).min(1).max(500),
});

/** Bulk delete for the dashboard's multi-select action — arbitrary cross-batch selection. */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => null);
  const parsed = bulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await deleteQrCodes(db, parsed.data.qrNames);
  return NextResponse.json({ success: true, ...result });
}
