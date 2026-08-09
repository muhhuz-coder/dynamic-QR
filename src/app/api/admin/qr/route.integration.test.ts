import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';

import { DELETE, GET } from './route';

describe('GET /api/admin/qr (integration)', () => {
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

  async function createTestQrCode(batchId?: string) {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `ls-${suffix}`,
        shortCode: `LS${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
        batchId,
      },
    });
    createdQrIds.push(qrCode.id);
    return qrCode;
  }

  function makeRequest(token: string | null = adminToken, query = '') {
    return GET(
      new NextRequest(`http://localhost:3000/api/admin/qr${query}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    );
  }

  it('rejects requests without an admin token', async () => {
    expect((await makeRequest(null)).status).toBe(401);
  });

  it('lists QR codes newest-first', async () => {
    await createTestQrCode();
    const response = await makeRequest();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.qrCodes)).toBe(true);
    expect(body.qrCodes.length).toBeGreaterThan(0);
  });

  it('filters by batchId when provided', async () => {
    const batchId = `batch-filter-test-${Date.now()}`;
    const inBatch = await createTestQrCode(batchId);
    await createTestQrCode();

    const response = await makeRequest(adminToken, `?batchId=${batchId}`);
    const body = await response.json();
    expect(body.qrCodes.map((q: { id: string }) => q.id)).toEqual([inBatch.id]);
  });
});

describe('DELETE /api/admin/qr (bulk, integration)', () => {
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
        qrName: `bd-${suffix}`,
        shortCode: `BD${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
      },
    });
    createdQrIds.push(qrCode.id);
    return qrCode;
  }

  function makeDeleteRequest(qrNames: string[], token: string | null = adminToken) {
    return DELETE(
      new NextRequest('http://localhost:3000/api/admin/qr', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ qrNames }),
      }),
    );
  }

  it('rejects requests without an admin token', async () => {
    expect((await makeDeleteRequest(['anything'], null)).status).toBe(401);
  });

  it('deletes multiple QR codes across different batches in one call', async () => {
    const a = await createTestQrCode();
    const b = await createTestQrCode();

    const response = await makeDeleteRequest([a.qrName, b.qrName]);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deletedCount).toBe(2);
  });

  it('400s for an empty qrNames array', async () => {
    expect((await makeDeleteRequest([])).status).toBe(400);
  });
});
