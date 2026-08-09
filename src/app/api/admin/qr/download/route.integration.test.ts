import { NextRequest } from 'next/server';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';

import { POST } from './route';

describe('POST /api/admin/qr/download (integration)', () => {
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

  function makeRequest(qrNames: string[], token: string | null = adminToken) {
    return POST(
      new NextRequest('http://localhost:3000/api/admin/qr/download', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ qrNames }),
      }),
    );
  }

  it('rejects requests without an admin token', async () => {
    expect((await makeRequest(['anything'], null)).status).toBe(401);
  });

  it('zips the selected QR codes regardless of batch', async () => {
    const suffix = Date.now().toString(36);
    const a = await db.qrCode.create({
      data: {
        qrName: `dlr-a-${suffix}`,
        shortCode: `DA${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
      },
    });
    const b = await db.qrCode.create({
      data: {
        qrName: `dlr-b-${suffix}`,
        shortCode: `DB${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
      },
    });
    createdQrIds.push(a.id, b.id);

    const response = await makeRequest([a.qrName, b.qrName]);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');

    const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
    expect(Object.keys(zip.files).sort()).toEqual([`${a.qrName}.svg`, `${b.qrName}.svg`].sort());
  });

  it('404s when none of the names match', async () => {
    expect((await makeRequest(['does-not-exist'])).status).toBe(404);
  });

  it('400s for an empty qrNames array', async () => {
    expect((await makeRequest([])).status).toBe(400);
  });
});
