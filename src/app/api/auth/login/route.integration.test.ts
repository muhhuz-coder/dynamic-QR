import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createHmac } from 'node:crypto';
import { verifyAdminToken } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/password';
import { generateTotpSecret } from '@/lib/auth/totp';
import { db } from '@/lib/db/client';

import { POST } from './route';

// Independent RFC 6238 reference (same approach as totp.test.ts) to derive a
// genuinely valid code for "now" in O(1), rather than brute-forcing 10^6
// possibilities through verifyTotpCode (too slow — HMAC-SHA1 that many times
// blew past the test timeout).
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function referenceDecodeBase32(secret: string): Buffer {
  let bits = '';
  for (const char of secret.toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function currentTotpCode(secret: string): string {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const key = referenceDecodeBase32(secret);
  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binaryCode % 1_000_000).padStart(6, '0');
}

describe('POST /api/auth/login (integration)', () => {
  const email = `login-test-${Date.now()}@example.com`;
  const password = 'correct-horse-battery-staple';
  let adminId: string;

  beforeAll(async () => {
    const admin = await db.admin.create({
      data: { email, passwordHash: await hashPassword(password), role: 'admin' },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await db.admin.delete({ where: { id: adminId } });
    await db.$disconnect();
  });

  function makeRequest(body: unknown, ip = '203.0.113.9') {
    return POST(
      new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify(body),
      }),
    );
  }

  it('issues a valid admin JWT for correct credentials', async () => {
    const response = await makeRequest({ email, password });
    expect(response.status).toBe(200);

    const { token } = await response.json();
    const payload = await verifyAdminToken(token);
    expect(payload).toMatchObject({ sub: adminId, email, role: 'admin' });
  });

  it('rejects an incorrect password with 401', async () => {
    const response = await makeRequest({ email, password: 'wrong-password' }, '203.0.113.10');
    expect(response.status).toBe(401);
  });

  it('rejects an unknown email with the same 401 (no user enumeration)', async () => {
    const response = await makeRequest(
      { email: 'nobody@example.com', password: 'whatever' },
      '203.0.113.11',
    );
    expect(response.status).toBe(401);
  });

  it('rejects a malformed body with 400', async () => {
    const response = await makeRequest({ email: 'not-an-email' }, '203.0.113.12');
    expect(response.status).toBe(400);
  });

  it('rate-limits repeated attempts from the same IP', async () => {
    const ip = '203.0.113.13';
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const response = await makeRequest({ email, password: 'wrong-password' }, ip);
      statuses.push(response.status);
    }
    expect(statuses).toContain(429);
  });
});

describe('POST /api/auth/login with 2FA enabled (integration)', () => {
  const email = `login-2fa-test-${Date.now()}@example.com`;
  const password = 'correct-horse-battery-staple';
  const secret = generateTotpSecret();
  let adminId: string;

  beforeAll(async () => {
    const admin = await db.admin.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: 'admin',
        totpEnabled: true,
        totpSecret: secret,
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await db.admin.delete({ where: { id: adminId } });
    await db.$disconnect();
  });

  function makeRequest(body: unknown, ip: string) {
    return POST(
      new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify(body),
      }),
    );
  }

  it('returns totp_required when the password is correct but no code is given', async () => {
    const response = await makeRequest({ email, password }, '203.0.113.20');
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('totp_required');
  });

  it('rejects an incorrect TOTP code', async () => {
    const response = await makeRequest({ email, password, totpCode: '000000' }, '203.0.113.21');
    expect(response.status).toBe(401);
  });

  it('issues a token when the TOTP code is correct', async () => {
    const code = currentTotpCode(secret);
    const response = await makeRequest({ email, password, totpCode: code }, '203.0.113.22');
    expect(response.status).toBe(200);
    const { token } = await response.json();
    expect(await verifyAdminToken(token)).toMatchObject({ sub: adminId, email });
  });
});
