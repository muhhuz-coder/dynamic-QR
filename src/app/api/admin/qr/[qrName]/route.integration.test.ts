import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';

import { DELETE, GET, PUT } from './route';

describe('/api/admin/qr/[qrName] (integration)', () => {
  let adminToken: string;
  let adminId: string;
  const createdQrIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-do-not-use-in-prod';
    const admin = await db.admin.create({
      data: { email: `route-admin-${Date.now()}@example.com`, passwordHash: 'irrelevant' },
    });
    adminId = admin.id;
    adminToken = await signAdminToken({ sub: admin.id, email: admin.email, role: 'admin' });
  });

  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { adminId } });
    await db.qrCode.deleteMany({ where: { id: { in: createdQrIds } } });
    await db.admin.delete({ where: { id: adminId } });
    await db.$disconnect();
  });

  async function createTestQrCode() {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `rt-${suffix}`,
        shortCode: `RT${suffix}`.toUpperCase(),
        targetUrl: 'https://old.example.com',
      },
    });
    createdQrIds.push(qrCode.id);
    return qrCode;
  }

  function makeRequest(qrName: string, body: unknown, token: string | null = adminToken) {
    return PUT(
      new NextRequest(`http://localhost:3000/api/admin/qr/${qrName}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ qrName }) },
    );
  }

  function makeGetRequest(qrName: string, token: string | null = adminToken) {
    return GET(
      new NextRequest(`http://localhost:3000/api/admin/qr/${qrName}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
      { params: Promise.resolve({ qrName }) },
    );
  }

  function makeDeleteRequest(qrName: string, token: string | null = adminToken) {
    return DELETE(
      new NextRequest(`http://localhost:3000/api/admin/qr/${qrName}`, {
        method: 'DELETE',
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
      { params: Promise.resolve({ qrName }) },
    );
  }

  describe('GET (detail)', () => {
    it('rejects requests without an admin token', async () => {
      const qrCode = await createTestQrCode();
      expect((await makeGetRequest(qrCode.qrName, null)).status).toBe(401);
    });

    it('returns the QR code with its audit history', async () => {
      const qrCode = await createTestQrCode();
      await makeRequest(qrCode.qrName, { newTargetUrl: 'https://updated.example.com' });

      const response = await makeGetRequest(qrCode.qrName);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.qrCode.qrName).toBe(qrCode.qrName);
      expect(body.qrCode.auditLogs).toHaveLength(1);
    });

    it('404s for an unknown QR name', async () => {
      expect((await makeGetRequest('does-not-exist')).status).toBe(404);
    });
  });

  it('rejects requests without an admin token', async () => {
    const response = await makeRequest('anything', { newTargetUrl: 'https://example.com' }, null);
    expect(response.status).toBe(401);
  });

  it('updates the target for a valid admin request', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName, { newTargetUrl: 'https://new.example.com' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      qrName: qrCode.qrName,
      oldTarget: 'https://old.example.com',
      newTarget: 'https://new.example.com',
    });
  });

  it('404s for an unknown QR name', async () => {
    const response = await makeRequest('does-not-exist', { newTargetUrl: 'https://example.com' });
    expect(response.status).toBe(404);
  });

  it('400s for an unsafe target URL', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName, { newTargetUrl: 'javascript:alert(1)' });
    expect(response.status).toBe(400);
  });

  it('updates displayName and tags without requiring a target change', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName, {
      displayName: 'Front Counter Stand',
      tags: ['restaurant', 'counter'],
    });
    expect(response.status).toBe(200);

    const detail = await (await makeGetRequest(qrCode.qrName)).json();
    expect(detail.qrCode.displayName).toBe('Front Counter Stand');
    expect(detail.qrCode.tags).toEqual(['restaurant', 'counter']);
  });

  it('updates target and metadata together in one call', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName, {
      newTargetUrl: 'https://new.example.com',
      tags: ['combined'],
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.newTarget).toBe('https://new.example.com');

    const detail = await (await makeGetRequest(qrCode.qrName)).json();
    expect(detail.qrCode.tags).toEqual(['combined']);
  });

  it('400s when no updatable field is provided', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName, {});
    expect(response.status).toBe(400);
  });

  it('sets and clears expiresAt via PUT', async () => {
    const qrCode = await createTestQrCode();
    const isoDate = new Date(Date.now() + 86_400_000).toISOString();

    expect((await makeRequest(qrCode.qrName, { expiresAt: isoDate })).status).toBe(200);
    let detail = await (await makeGetRequest(qrCode.qrName)).json();
    expect(detail.qrCode.expiresAt).toBe(isoDate);

    expect((await makeRequest(qrCode.qrName, { expiresAt: null })).status).toBe(200);
    detail = await (await makeGetRequest(qrCode.qrName)).json();
    expect(detail.qrCode.expiresAt).toBeNull();
  });

  it('toggles utmEnabled via PUT', async () => {
    const qrCode = await createTestQrCode();
    expect((await makeRequest(qrCode.qrName, { utmEnabled: false })).status).toBe(200);

    const detail = await (await makeGetRequest(qrCode.qrName)).json();
    expect(detail.qrCode.utmEnabled).toBe(false);
  });

  it('sets and clears designOptions via PUT', async () => {
    const qrCode = await createTestQrCode();
    expect(
      (
        await makeRequest(qrCode.qrName, {
          designOptions: {
            fgColor: '#2563eb',
            bgColor: '#ffffff',
            logoUrl: 'https://example.com/logo.png',
          },
        })
      ).status,
    ).toBe(200);

    let detail = await (await makeGetRequest(qrCode.qrName)).json();
    expect(detail.qrCode.designOptions).toEqual({
      fgColor: '#2563eb',
      bgColor: '#ffffff',
      logoUrl: 'https://example.com/logo.png',
    });

    expect((await makeRequest(qrCode.qrName, { designOptions: null })).status).toBe(200);
    detail = await (await makeGetRequest(qrCode.qrName)).json();
    expect(detail.qrCode.designOptions).toBeNull();
  });

  it('sets shape/frame/text/gradient designOptions via PUT', async () => {
    const qrCode = await createTestQrCode();
    const designOptions = {
      moduleShape: 'dots',
      eyeShape: 'circle',
      gradient: { from: '#2563eb', to: '#f97316', direction: 'horizontal' },
      frame: 'scan-me',
      frameColor: '#111111',
      frameText: 'TAP HERE',
      headerText: 'Order #12345',
      headerColor: '#222222',
      footerText: 'Thank you!',
      footerColor: '#333333',
    };
    expect((await makeRequest(qrCode.qrName, { designOptions })).status).toBe(200);

    const detail = await (await makeGetRequest(qrCode.qrName)).json();
    expect(detail.qrCode.designOptions).toEqual(designOptions);
  });

  it('400s for an invalid designOptions moduleShape', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName, {
      designOptions: { moduleShape: 'triangle' },
    });
    expect(response.status).toBe(400);
  });

  it('400s for an invalid designOptions fgColor', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName, { designOptions: { fgColor: 'not-a-hex' } });
    expect(response.status).toBe(400);
  });

  describe('DELETE', () => {
    it('rejects requests without an admin token', async () => {
      const qrCode = await createTestQrCode();
      expect((await makeDeleteRequest(qrCode.qrName, null)).status).toBe(401);
    });

    it('deletes the QR', async () => {
      const qrCode = await createTestQrCode();
      const response = await makeDeleteRequest(qrCode.qrName);
      expect(response.status).toBe(200);
      expect((await makeGetRequest(qrCode.qrName)).status).toBe(404);
    });

    it('404s for an unknown QR name', async () => {
      expect((await makeDeleteRequest('does-not-exist')).status).toBe(404);
    });
  });
});
