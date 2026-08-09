import { NextRequest } from 'next/server';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';

import { GET } from './route';

describe('GET /api/admin/qr/batch/[batchId]/download (integration)', () => {
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

  function makeRequest(batchId: string, token: string | null = adminToken) {
    return GET(
      new NextRequest(`http://localhost:3000/api/admin/qr/batch/${batchId}/download`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
      { params: Promise.resolve({ batchId }) },
    );
  }

  it('rejects requests without an admin token', async () => {
    expect((await makeRequest('anything', null)).status).toBe(401);
  });

  it('returns a zip containing one SVG per QR in the batch', async () => {
    const batchId = `route-dl-test-${Date.now()}`;
    const suffix = Date.now().toString(36);
    const qr = await db.qrCode.create({
      data: {
        qrName: `stand-${suffix}`,
        shortCode: `RD${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
        batchId,
      },
    });
    createdQrIds.push(qr.id);

    const response = await makeRequest(batchId);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toContain(`${batchId}.zip`);

    const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
    expect(Object.keys(zip.files)).toEqual([`${qr.qrName}.svg`]);
  });

  it('404s for an unknown batch', async () => {
    expect((await makeRequest('does-not-exist')).status).toBe(404);
  });
});
