import { NextRequest } from 'next/server';
import { afterAll, describe, expect, it } from 'vitest';

import { createApiKey } from '@/lib/auth/apiKey';
import { db } from '@/lib/db/client';

import { GET as getOne, PUT } from './[qrName]/route';
import { GET as list, POST } from './route';

describe('/api/v1/qr (integration)', () => {
  let apiKey: string;
  const createdQrIds: string[] = [];
  const createdKeyIds: string[] = [];

  const setup = (async () => {
    const key = await createApiKey(db, 'test key');
    createdKeyIds.push(key.id);
    apiKey = key.rawKey;
  })();

  afterAll(async () => {
    await setup;
    await db.qrCode.deleteMany({ where: { id: { in: createdQrIds } } });
    await db.apiKey.deleteMany({ where: { id: { in: createdKeyIds } } });
    await db.$disconnect();
  });

  function authHeader(token: string | null): Record<string, string> {
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  it('rejects requests without an API key', async () => {
    await setup;
    const response = await list(new NextRequest('http://localhost:3000/api/v1/qr'));
    expect(response.status).toBe(401);
  });

  it('rejects requests with an invalid API key', async () => {
    await setup;
    const response = await list(
      new NextRequest('http://localhost:3000/api/v1/qr', { headers: authHeader('tnr_invalid') }),
    );
    expect(response.status).toBe(401);
  });

  it('creates a QR code', async () => {
    await setup;
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/qr', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeader(apiKey) },
        body: JSON.stringify({ name: `v1-${suffix}`, targetUrl: 'https://example.com' }),
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    createdQrIds.push(body.qr.id);
    expect(body.qr.qrName).toBe(`v1-${suffix}`);
  });

  it('lists QR codes', async () => {
    await setup;
    const response = await list(
      new NextRequest('http://localhost:3000/api/v1/qr', { headers: authHeader(apiKey) }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.qrCodes)).toBe(true);
  });

  it('fetches a single QR code by name', async () => {
    await setup;
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `v1get-${suffix}`,
        shortCode: `V1G${suffix}`.toUpperCase(),
        targetUrl: 'https://example.com',
      },
    });
    createdQrIds.push(qrCode.id);

    const response = await getOne(
      new NextRequest(`http://localhost:3000/api/v1/qr/${qrCode.qrName}`, {
        headers: authHeader(apiKey),
      }),
      { params: Promise.resolve({ qrName: qrCode.qrName }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.qr.qrName).toBe(qrCode.qrName);
  });

  it('updates a QR code target, audit-logged with a null adminId', async () => {
    await setup;
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `v1put-${suffix}`,
        shortCode: `V1P${suffix}`.toUpperCase(),
        targetUrl: 'https://old.example.com',
      },
    });
    createdQrIds.push(qrCode.id);

    const response = await PUT(
      new NextRequest(`http://localhost:3000/api/v1/qr/${qrCode.qrName}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...authHeader(apiKey) },
        body: JSON.stringify({ targetUrl: 'https://new.example.com' }),
      }),
      { params: Promise.resolve({ qrName: qrCode.qrName }) },
    );
    expect(response.status).toBe(200);

    const auditLog = await db.auditLog.findFirstOrThrow({ where: { resourceId: qrCode.id } });
    expect(auditLog.adminId).toBeNull();
    expect(auditLog.newValue).toBe('https://new.example.com');
  });

  it('404s for an unknown QR name', async () => {
    await setup;
    const response = await getOne(
      new NextRequest('http://localhost:3000/api/v1/qr/does-not-exist', {
        headers: authHeader(apiKey),
      }),
      { params: Promise.resolve({ qrName: 'does-not-exist' }) },
    );
    expect(response.status).toBe(404);
  });
});
