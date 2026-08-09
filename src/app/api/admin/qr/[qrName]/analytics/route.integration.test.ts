import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';

import { GET } from './route';

describe('GET /api/admin/qr/[qrName]/analytics (integration)', () => {
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
    await db.qrScanEvent.deleteMany({ where: { qrId: { in: createdQrIds } } });
    await db.qrCode.deleteMany({ where: { id: { in: createdQrIds } } });
    await db.$disconnect();
  });

  async function createTestQrCode() {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `an-${suffix}`,
        shortCode: `AN${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
      },
    });
    createdQrIds.push(qrCode.id);
    return qrCode;
  }

  function makeRequest(qrName: string, period?: string, token: string | null = adminToken) {
    const url = new URL(`http://localhost:3000/api/admin/qr/${qrName}/analytics`);
    if (period) url.searchParams.set('period', period);
    return GET(
      new NextRequest(url, { headers: token ? { authorization: `Bearer ${token}` } : {} }),
      {
        params: Promise.resolve({ qrName }),
      },
    );
  }

  it('rejects requests without an admin token', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName, undefined, null);
    expect(response.status).toBe(401);
  });

  it('returns analytics for a valid admin request, defaulting to 30d', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.qrName).toBe(qrCode.qrName);
    expect(body.period).toBe('30d');
    expect(body.analytics.totalScans).toBe(0);
  });

  it('falls back to 30d for an invalid period value instead of erroring', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName, 'not-a-real-period');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.period).toBe('30d');
  });

  it('404s for an unknown QR name', async () => {
    const response = await makeRequest('does-not-exist');
    expect(response.status).toBe(404);
  });
});
