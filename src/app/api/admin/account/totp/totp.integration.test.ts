import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/password';
import { db } from '@/lib/db/client';

import { DELETE, POST as enroll } from './route';
import { POST as verify } from './verify/route';

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

describe('TOTP enrollment (integration)', () => {
  const createdAdminIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-do-not-use-in-prod';
  });

  afterAll(async () => {
    await db.admin.deleteMany({ where: { id: { in: createdAdminIds } } });
    await db.$disconnect();
  });

  async function createTestAdminAndToken() {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const admin = await db.admin.create({
      data: {
        email: `totp-${suffix}@example.com`,
        passwordHash: await hashPassword('irrelevant-password'),
      },
    });
    createdAdminIds.push(admin.id);
    const token = await signAdminToken({ sub: admin.id, email: admin.email, role: 'admin' });
    return { admin, token };
  }

  function req(url: string, token: string | null, body?: unknown) {
    return new NextRequest(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  it('rejects requests without an admin token', async () => {
    expect((await enroll(req('http://localhost:3000/api/admin/account/totp', null))).status).toBe(
      401,
    );
  });

  it('enroll returns a secret and otpauth URI, not yet enabled', async () => {
    const { admin, token } = await createTestAdminAndToken();
    const response = await enroll(req('http://localhost:3000/api/admin/account/totp', token));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(body.otpAuthUri).toContain(body.secret);

    const record = await db.admin.findUniqueOrThrow({ where: { id: admin.id } });
    expect(record.totpEnabled).toBe(false);
    expect(record.totpSecret).toBe(body.secret);
  });

  it('verify with the correct code enables 2FA', async () => {
    const { admin, token } = await createTestAdminAndToken();
    const enrollBody = await (
      await enroll(req('http://localhost:3000/api/admin/account/totp', token))
    ).json();

    const code = currentTotpCode(enrollBody.secret);
    const response = await verify(
      req('http://localhost:3000/api/admin/account/totp/verify', token, { code }),
    );
    expect(response.status).toBe(200);

    const record = await db.admin.findUniqueOrThrow({ where: { id: admin.id } });
    expect(record.totpEnabled).toBe(true);
  });

  it('verify with an incorrect code does not enable 2FA', async () => {
    const { admin, token } = await createTestAdminAndToken();
    await enroll(req('http://localhost:3000/api/admin/account/totp', token));

    const response = await verify(
      req('http://localhost:3000/api/admin/account/totp/verify', token, { code: '000000' }),
    );
    expect(response.status).toBe(400);

    const record = await db.admin.findUniqueOrThrow({ where: { id: admin.id } });
    expect(record.totpEnabled).toBe(false);
  });

  it('verify 400s when there is no pending enrollment', async () => {
    const { token } = await createTestAdminAndToken();
    const response = await verify(
      req('http://localhost:3000/api/admin/account/totp/verify', token, { code: '000000' }),
    );
    expect(response.status).toBe(400);
  });

  it('DELETE disables 2FA and clears the secret', async () => {
    const { admin, token } = await createTestAdminAndToken();
    const enrollBody = await (
      await enroll(req('http://localhost:3000/api/admin/account/totp', token))
    ).json();
    await verify(
      req('http://localhost:3000/api/admin/account/totp/verify', token, {
        code: currentTotpCode(enrollBody.secret),
      }),
    );

    const response = await DELETE(
      new NextRequest('http://localhost:3000/api/admin/account/totp', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(response.status).toBe(200);

    const record = await db.admin.findUniqueOrThrow({ where: { id: admin.id } });
    expect(record.totpEnabled).toBe(false);
    expect(record.totpSecret).toBeNull();
  });
});
