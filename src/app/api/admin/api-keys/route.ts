import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { createApiKey, listApiKeys } from '@/lib/auth/apiKey';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const keys = await listApiKeys(db);
  return NextResponse.json({ keys });
}

const bodySchema = z.object({
  label: z.string().min(1).max(255),
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

  const { rawKey } = await createApiKey(db, parsed.data.label);
  return NextResponse.json({ rawKey }, { status: 201 });
}
