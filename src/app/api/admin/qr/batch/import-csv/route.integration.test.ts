import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';

import { POST } from './route';

describe('POST /api/admin/qr/batch/import-csv (integration)', () => {
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

  function makeRequest(csvText: string, token: string | null = adminToken) {
    return POST(
      new NextRequest('http://localhost:3000/api/admin/qr/batch/import-csv', {
        method: 'POST',
        headers: {
          'content-type': 'text/csv',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: csvText,
      }),
    );
  }

  it('rejects requests without an admin token', async () => {
    const response = await makeRequest('name,target_url\nrow-1,https://example.com', null);
    expect(response.status).toBe(401);
  });

  it('imports a valid CSV, expanding per-row quantity', async () => {
    const baseName = `csv-import-${Date.now()}`;
    const csv = `name,target_url,quantity\n${baseName},https://example.com,2`;

    const response = await makeRequest(csv);
    expect(response.status).toBe(201);

    const body = await response.json();
    createdBatchIds.push(body.batchId);
    expect(body.totalCreated).toBe(2);
    expect(body.qrs.map((q: { qrName: string }) => q.qrName)).toEqual([baseName, `${baseName}-02`]);
  });

  it('rejects an empty body with 400', async () => {
    const response = await makeRequest('');
    expect(response.status).toBe(400);
  });

  it('rejects malformed CSV (missing required column) with 400', async () => {
    const response = await makeRequest('name\nrow-1');
    expect(response.status).toBe(400);
  });

  it('rejects a CSV row that duplicates an existing QR name with 409', async () => {
    const baseName = `csv-dup-${Date.now()}`;
    const first = await makeRequest(`name,target_url\n${baseName},https://example.com`);
    const firstBody = await first.json();
    createdBatchIds.push(firstBody.batchId);

    const second = await makeRequest(`name,target_url\n${baseName},https://example.com`);
    expect(second.status).toBe(409);
  });
});
