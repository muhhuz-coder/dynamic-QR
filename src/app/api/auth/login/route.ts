import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { signAdminToken } from '@/lib/auth/jwt';
import { verifyPassword } from '@/lib/auth/password';
import { verifyTotpCode } from '@/lib/auth/totp';
import { db } from '@/lib/db/client';
import { RateLimiter } from '@/lib/rateLimiter';

// 5 attempts per key per minute — brute-force guardrail on the login endpoint.
const loginRateLimiter = new RateLimiter(5, 60_000 / 5);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() ?? 'unknown';
}

export async function POST(request: NextRequest) {
  const ipAddress = getClientIp(request);
  if (!loginRateLimiter.tryConsume(ipAddress)) {
    return NextResponse.json({ error: 'Too many login attempts' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { email, password, totpCode } = parsed.data;
  const admin = await db.admin.findUnique({ where: { email } });

  // Same generic error whether the email doesn't exist or the password is wrong,
  // so the response never confirms which admin emails exist.
  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  if (admin.totpEnabled) {
    if (!totpCode) {
      return NextResponse.json({ error: 'totp_required' }, { status: 401 });
    }
    if (!admin.totpSecret || !verifyTotpCode(admin.totpSecret, totpCode)) {
      return NextResponse.json({ error: 'Invalid authentication code' }, { status: 401 });
    }
  }

  const token = await signAdminToken({ sub: admin.id, email: admin.email, role: admin.role });

  return NextResponse.json({ token });
}
