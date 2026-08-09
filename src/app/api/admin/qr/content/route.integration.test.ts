import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';

import { POST } from './route';

describe('POST /api/admin/qr/content (integration)', () => {
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

  function makeRequest(body: unknown, token: string | null = adminToken) {
    return POST(
      new NextRequest('http://localhost:3000/api/admin/qr/content', {
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
    expect((await makeRequest({}, null)).status).toBe(401);
  });

  it('creates a VCARD QR', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const response = await makeRequest({
      contentType: 'VCARD',
      qrName: `vcard-route-${suffix}`,
      payload: { name: 'Jane Doe', email: 'jane@example.com' },
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    createdQrIds.push(body.qr.id);
    expect(body.qr.contentType).toBe('VCARD');
  });

  it('creates a WIFI QR with a productType', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const response = await makeRequest({
      contentType: 'WIFI',
      qrName: `wifi-route-${suffix}`,
      productType: 'COIN',
      payload: { ssid: 'MyNetwork', security: 'nopass' },
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    createdQrIds.push(body.qr.id);
    expect(body.qr.productType).toBe('COIN');
  });

  it('400s for a VCARD payload missing the required name field', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const response = await makeRequest({
      contentType: 'VCARD',
      qrName: `bad-route-${suffix}`,
      payload: { email: 'jane@example.com' },
    });
    expect(response.status).toBe(400);
  });

  it('409s when the qrName already exists', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrName = `dup-route-${suffix}`;
    const first = await makeRequest({ contentType: 'TEXT', qrName, payload: { text: 'hello' } });
    const firstBody = await first.json();
    createdQrIds.push(firstBody.qr.id);

    const response = await makeRequest({ contentType: 'TEXT', qrName, payload: { text: 'again' } });
    expect(response.status).toBe(409);
  });
});
