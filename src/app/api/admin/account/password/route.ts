import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import {
  AdminNotFoundError,
  changeAdminPassword,
  IncorrectPasswordError,
} from '@/lib/auth/changePassword';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function PUT(request: NextRequest) {
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

  try {
    await changeAdminPassword(db, admin.sub, parsed.data.currentPassword, parsed.data.newPassword);
    return NextResponse.json({ success: true, message: 'Password updated' });
  } catch (error) {
    if (error instanceof IncorrectPasswordError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AdminNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
