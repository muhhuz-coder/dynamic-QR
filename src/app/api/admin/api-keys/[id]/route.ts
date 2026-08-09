import { NextResponse, type NextRequest } from 'next/server';

import { revokeApiKey } from '@/lib/auth/apiKey';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  await revokeApiKey(db, id);
  return NextResponse.json({ success: true, message: 'API key revoked' });
}
