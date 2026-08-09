import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';

import { GET } from './route';

describe('GET /api/admin/qr/[qrName]/scans/export (integration)', () => {
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
        qrName: `exp-${suffix}`,
        shortCode: `EX${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
      },
    });
    createdQrIds.push(qrCode.id);
    return qrCode;
  }

  function makeRequest(qrName: string, token: string | null = adminToken) {
    return GET(
      new NextRequest(`http://localhost:3000/api/admin/qr/${qrName}/scans/export`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
      { params: Promise.resolve({ qrName }) },
    );
  }

  it('rejects requests without an admin token', async () => {
    const qrCode = await createTestQrCode();
    expect((await makeRequest(qrCode.qrName, null)).status).toBe(401);
  });

  it('returns a CSV with header-only when there are no scans', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv');
    const text = await response.text();
    expect(text.split('\n')).toHaveLength(1);
  });

  it('includes every scan event as a row', async () => {
    const qrCode = await createTestQrCode();
    await db.qrScanEvent.create({
      data: { qrId: qrCode.id, shortCode: qrCode.shortCode, targetUrlAtScan: qrCode.targetUrl },
    });

    const response = await makeRequest(qrCode.qrName);
    const text = await response.text();
    expect(text.split('\n')).toHaveLength(2);
  });

  it('404s for an unknown QR name', async () => {
    expect((await makeRequest('does-not-exist')).status).toBe(404);
  });
});
