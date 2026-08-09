import { NextResponse, type NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { buildOtpAuthUri, generateTotpSecret } from '@/lib/auth/totp';
import { db } from '@/lib/db/client';

/** Starts 2FA enrollment: generates a secret (not yet enabled) and returns its otpauth:// URI. */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const secret = generateTotpSecret();
  await db.admin.update({
    where: { id: admin.sub },
    data: { totpSecret: secret, totpEnabled: false },
  });

  return NextResponse.json({ secret, otpAuthUri: buildOtpAuthUri(secret, admin.email) });
}

/** Disables 2FA and clears the stored secret. */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  await db.admin.update({
    where: { id: admin.sub },
    data: { totpSecret: null, totpEnabled: false },
  });
  return NextResponse.json({ success: true, message: '2FA disabled' });
}
