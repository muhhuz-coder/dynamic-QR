import { NextResponse, type NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';
import { BatchNotFoundError, buildBatchSvgZip } from '@/lib/qr/batchDownload';
import { getPublicBaseUrl } from '@/lib/settings/org';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { batchId } = await params;
  const baseUrl = await getPublicBaseUrl(db);

  try {
    const zip = await buildBatchSvgZip(db, batchId, baseUrl);
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${batchId}.zip"`,
      },
    });
  } catch (error) {
    if (error instanceof BatchNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
