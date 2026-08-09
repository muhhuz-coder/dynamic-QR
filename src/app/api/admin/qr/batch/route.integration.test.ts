import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';

import { POST } from './route';

describe('POST /api/admin/qr/batch (integration)', () => {
  let adminToken: string;
  const createdBatchIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-do-not-use-in-prod';
    adminToken = await signAdminToken({
      sub: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
    });
  });

  afterAll(async () => {
    await db.qrCode.deleteMany({ where: { batchId: { in: createdBatchIds } } });
    await db.$disconnect();
  });

  function makeRequest(body: unknown, token: string | null = adminToken) {
    return POST(
      new NextRequest('http://localhost:3000/api/admin/qr/batch', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  }

  it('rejects requests without an admin token', async () => {
    const response = await makeRequest(
      { baseName: 'x', quantity: 1, targetUrl: 'https://example.com' },
      null,
    );
    expect(response.status).toBe(401);
  });

  it('creates a batch for a valid admin request', async () => {
    const baseName = `api-batch-${Date.now()}`;
    const response = await makeRequest({ baseName, quantity: 3, targetUrl: 'https://example.com' });
    expect(response.status).toBe(201);

    const body = await response.json();
    createdBatchIds.push(body.batchId);
    expect(body.totalCreated).toBe(3);
    expect(body.qrs).toHaveLength(3);
  });

  it('rejects an invalid body with 400', async () => {
    const response = await makeRequest({
      baseName: '',
      quantity: 1,
      targetUrl: 'https://example.com',
    });
    expect(response.status).toBe(400);
  });

  it('rejects an unsafe target URL with 400', async () => {
    const response = await makeRequest({
      baseName: `api-badurl-${Date.now()}`,
      quantity: 1,
      targetUrl: 'javascript:alert(1)',
    });
    expect(response.status).toBe(400);
  });

  it('rejects a duplicate baseName with 409', async () => {
    const baseName = `api-dup-${Date.now()}`;
    const first = await makeRequest({ baseName, quantity: 1, targetUrl: 'https://example.com' });
    const firstBody = await first.json();
    createdBatchIds.push(firstBody.batchId);

    const second = await makeRequest({ baseName, quantity: 1, targetUrl: 'https://example.com' });
    expect(second.status).toBe(409);
  });
});
