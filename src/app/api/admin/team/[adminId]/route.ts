import { NextResponse, type NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { CannotRemoveLastAdminError, removeAdmin } from '@/lib/auth/team';
import { db } from '@/lib/db/client';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ adminId: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { adminId } = await params;
  try {
    await removeAdmin(db, adminId);
    return NextResponse.json({ success: true, message: 'Admin removed' });
  } catch (error) {
    if (error instanceof CannotRemoveLastAdminError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
