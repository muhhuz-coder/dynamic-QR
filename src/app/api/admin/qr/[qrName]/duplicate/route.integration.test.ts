import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';

import { POST } from './route';

describe('POST /api/admin/qr/[qrName]/duplicate (integration)', () => {
  let adminToken: string;
  const createdQrIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-do-not-use-in-prod';
    adminToken = await signAdminToken({
      sub: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
    });
  });

  afterAll(async () => {
    await db.qrCode.deleteMany({ where: { id: { in: createdQrIds } } });
    await db.$disconnect();
  });

  async function createTestQrCode() {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `dr-${suffix}`,
        shortCode: `DR${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
      },
    });
    createdQrIds.push(qrCode.id);
    return qrCode;
  }

  function makeRequest(qrName: string, token: string | null = adminToken) {
    return POST(
      new NextRequest(`http://localhost:3000/api/admin/qr/${qrName}/duplicate`, {
        method: 'POST',
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
      { params: Promise.resolve({ qrName }) },
    );
  }

  it('rejects requests without an admin token', async () => {
    const qrCode = await createTestQrCode();
    expect((await makeRequest(qrCode.qrName, null)).status).toBe(401);
  });

  it('creates a copy with a new name and short code', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName);
    expect(response.status).toBe(201);

    const body = await response.json();
    createdQrIds.push(body.qrCode.id);
    expect(body.qrCode.qrName).toBe(`${qrCode.qrName}-copy`);
    expect(body.qrCode.shortCode).not.toBe(qrCode.shortCode);
  });

  it('404s for an unknown QR name', async () => {
    expect((await makeRequest('does-not-exist')).status).toBe(404);
  });
});
