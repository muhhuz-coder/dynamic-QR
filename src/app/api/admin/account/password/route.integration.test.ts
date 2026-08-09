import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { signAdminToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';

import { PUT } from './route';

describe('PUT /api/admin/account/password (integration)', () => {
  const createdAdminIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-do-not-use-in-prod';
  });

  afterAll(async () => {
    await db.admin.deleteMany({ where: { id: { in: createdAdminIds } } });
    await db.$disconnect();
  });

  async function createTestAdminAndToken(password = 'original-password-123') {
    const passwordHash = await hashPassword(password);
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const admin = await db.admin.create({
      data: { email: `pwr-${suffix}@example.com`, passwordHash },
    });
    createdAdminIds.push(admin.id);
    const token = await signAdminToken({ sub: admin.id, email: admin.email, role: 'admin' });
    return { admin, token };
  }

  function makeRequest(body: unknown, token: string | null) {
    return PUT(
      new NextRequest('http://localhost:3000/api/admin/account/password', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  }

  it('rejects requests without an admin token', async () => {
    expect((await makeRequest({}, null)).status).toBe(401);
  });

  it('updates the password when the current one is correct', async () => {
    const { admin, token } = await createTestAdminAndToken('original-password-123');
    const response = await makeRequest(
      { currentPassword: 'original-password-123', newPassword: 'new-password-456' },
      token,
    );
    expect(response.status).toBe(200);

    const updated = await db.admin.findUniqueOrThrow({ where: { id: admin.id } });
    expect(await verifyPassword('new-password-456', updated.passwordHash)).toBe(true);
  });

  it('400s when the current password is wrong', async () => {
    const { token } = await createTestAdminAndToken('original-password-123');
    const response = await makeRequest(
      { currentPassword: 'wrong', newPassword: 'new-password-456' },
      token,
    );
    expect(response.status).toBe(400);
  });

  it('400s for a too-short new password', async () => {
    const { token } = await createTestAdminAndToken('original-password-123');
    const response = await makeRequest(
      { currentPassword: 'original-password-123', newPassword: 'short' },
      token,
    );
    expect(response.status).toBe(400);
  });
});
