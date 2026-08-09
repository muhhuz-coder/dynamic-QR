import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { EmailAlreadyExistsError, inviteAdmin, listAdmins } from '@/lib/auth/team';
import { db } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const admins = await listAdmins(db);
  return NextResponse.json({ admins });
}

const bodySchema = z.object({
  email: z.string().email(),
  temporaryPassword: z.string().min(8),
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

  try {
    const newAdmin = await inviteAdmin(db, parsed.data.email, parsed.data.temporaryPassword);
    return NextResponse.json(
      { admin: { id: newAdmin.id, email: newAdmin.email } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof EmailAlreadyExistsError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
