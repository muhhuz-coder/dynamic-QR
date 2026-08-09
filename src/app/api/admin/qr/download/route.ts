import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';
import { buildQrCodesSvgZip, NoQrCodesFoundError } from '@/lib/qr/batchDownload';
import { getPublicBaseUrl } from '@/lib/settings/org';

const bodySchema = z.object({
  qrNames: z.array(z.string().min(1)).min(1).max(500),
});

/** Bulk SVG download for the dashboard's multi-select action — arbitrary cross-batch selection. */
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

  const baseUrl = await getPublicBaseUrl(db);

  try {
    const zip = await buildQrCodesSvgZip(db, parsed.data.qrNames, baseUrl);
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': 'attachment; filename="qr-codes.zip"',
      },
    });
  } catch (error) {
    if (error instanceof NoQrCodesFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
