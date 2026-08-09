import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { verifyTotpCode } from '@/lib/auth/totp';
import { db } from '@/lib/db/client';

const bodySchema = z.object({
  code: z.string().min(1),
});

/** Confirms enrollment: verifies a code against the pending secret, then flips totpEnabled on. */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const record = await db.admin.findUniqueOrThrow({ where: { id: admin.sub } });
  if (!record.totpSecret) {
    return NextResponse.json(
      { error: 'No pending 2FA enrollment — call the enroll endpoint first' },
      { status: 400 },
    );
  }

  if (!verifyTotpCode(record.totpSecret, parsed.data.code)) {
    return NextResponse.json({ error: 'Invalid authentication code' }, { status: 400 });
  }

  await db.admin.update({ where: { id: admin.sub }, data: { totpEnabled: true } });
  return NextResponse.json({ success: true, message: '2FA enabled' });
}
