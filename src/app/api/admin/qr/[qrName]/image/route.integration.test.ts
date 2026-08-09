import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';

import { GET } from './route';

describe('GET /api/admin/qr/[qrName]/image (integration)', () => {
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

  async function createTestQrCode(productType?: 'STAND' | 'COIN' | 'CARD') {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `im-${suffix}`,
        shortCode: `IM${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
        productType,
      },
    });
    createdQrIds.push(qrCode.id);
    return qrCode;
  }

  function makeRequest(
    qrName: string,
    format?: string,
    token: string | null = adminToken,
    extraParams?: Record<string, string>,
  ) {
    const url = new URL(`http://localhost:3000/api/admin/qr/${qrName}/image`);
    if (format) url.searchParams.set('format', format);
    for (const [key, value] of Object.entries(extraParams ?? {})) url.searchParams.set(key, value);
    return GET(
      new NextRequest(url, { headers: token ? { authorization: `Bearer ${token}` } : {} }),
      {
        params: Promise.resolve({ qrName }),
      },
    );
  }

  it('rejects requests without an admin token', async () => {
    const qrCode = await createTestQrCode();
    expect((await makeRequest(qrCode.qrName, undefined, null)).status).toBe(401);
  });

  it('returns a PNG by default', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('returns an SVG when format=svg', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName, 'svg');
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(await response.text()).toContain('<svg');
  });

  it('404s for an unknown QR name', async () => {
    expect((await makeRequest('does-not-exist')).status).toBe(404);
  });

  it("sizes the SVG per the QR's product-type preset when no override is given", async () => {
    const qrCode = await createTestQrCode('COIN');
    const response = await makeRequest(qrCode.qrName, 'svg');
    expect(await response.text()).toContain('width="28mm"');
  });

  it('defaults to the generic size when the QR has no product type', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName, 'svg');
    expect(await response.text()).toContain('width="40mm"');
  });

  it('lets ?sizeMm override the product-type preset', async () => {
    const qrCode = await createTestQrCode('CARD');
    const response = await makeRequest(qrCode.qrName, 'svg', adminToken, { sizeMm: '55' });
    expect(await response.text()).toContain('width="55mm"');
  });

  it('400s for an out-of-range ?sizeMm', async () => {
    const qrCode = await createTestQrCode();
    const response = await makeRequest(qrCode.qrName, 'svg', adminToken, { sizeMm: '9999' });
    expect(response.status).toBe(400);
  });

  it('encodes the vCard payload instead of a short link for a VCARD-type QR', async () => {
    const suffix = Date.now().toString(36);
    const urlType = await createTestQrCode();
    const vcardType = await db.qrCode.create({
      data: {
        qrName: `im-vcard-${suffix}`,
        shortCode: `IMV${suffix}`.toUpperCase(),
        targetUrl: 'vCard: Jane Doe',
        contentType: 'VCARD',
        contentPayload: { name: 'Jane Doe' },
      },
    });
    createdQrIds.push(vcardType.id);

    const urlSvg = await (await makeRequest(urlType.qrName, 'svg')).text();
    const vcardSvg = await (await makeRequest(vcardType.qrName, 'svg')).text();
    // Different encoded content produces a different module pattern (path data).
    expect(vcardSvg).not.toBe(urlSvg);
  });

  it("applies a custom fgColor from the QR's stored designOptions", async () => {
    const suffix = Date.now().toString(36);
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `im-design-${suffix}`,
        shortCode: `IMD${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
        designOptions: { fgColor: '#2563eb' },
      },
    });
    createdQrIds.push(qrCode.id);

    const response = await makeRequest(qrCode.qrName, 'svg');
    expect(await response.text()).toContain('stroke="#2563eb"');
  });

  it('400s when a non-URL QR has no payload stored', async () => {
    const suffix = Date.now().toString(36);
    const brokenVcard = await db.qrCode.create({
      data: {
        qrName: `im-broken-${suffix}`,
        shortCode: `IMB${suffix}`.toUpperCase(),
        targetUrl: 'vCard: (missing)',
        contentType: 'VCARD',
        contentPayload: undefined,
      },
    });
    createdQrIds.push(brokenVcard.id);

    const response = await makeRequest(brokenVcard.qrName, 'svg');
    expect(response.status).toBe(400);
  });
});
