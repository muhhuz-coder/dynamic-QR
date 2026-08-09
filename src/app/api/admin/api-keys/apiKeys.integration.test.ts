import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';

import { DELETE } from './[id]/route';
import { GET, POST } from './route';

describe('/api/admin/api-keys (integration)', () => {
  let adminToken: string;
  const createdKeyIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-do-not-use-in-prod';
    adminToken = await signAdminToken({
      sub: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
    });
  });

  afterAll(async () => {
    await db.apiKey.deleteMany({ where: { id: { in: createdKeyIds } } });
    await db.$disconnect();
  });

  function makeGetRequest(token: string | null = adminToken) {
    return GET(
      new NextRequest('http://localhost:3000/api/admin/api-keys', {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    );
  }

  function makePostRequest(body: unknown, token: string | null = adminToken) {
    return POST(
      new NextRequest('http://localhost:3000/api/admin/api-keys', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  }

  function makeDeleteRequest(id: string, token: string | null = adminToken) {
    return DELETE(
      new NextRequest(`http://localhost:3000/api/admin/api-keys/${id}`, {
        method: 'DELETE',
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
      { params: Promise.resolve({ id }) },
    );
  }

  it('rejects requests without an admin token', async () => {
    expect((await makeGetRequest(null)).status).toBe(401);
    expect((await makePostRequest({}, null)).status).toBe(401);
  });

  it('creates a key and returns the raw value', async () => {
    const response = await makePostRequest({ label: 'Test integration key' });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.rawKey).toMatch(/^tnr_/);

    const keys = await db.apiKey.findMany({ where: { label: 'Test integration key' } });
    createdKeyIds.push(...keys.map((k) => k.id));
  });

  it('lists keys without the raw value or hash', async () => {
    const response = await makeGetRequest();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.keys)).toBe(true);
    if (body.keys.length > 0) {
      expect(body.keys[0]).not.toHaveProperty('hashedKey');
    }
  });

  it('revokes a key', async () => {
    const created = await db.apiKey.create({
      data: { label: 'To revoke', hashedKey: 'fake-hash-for-test' },
    });
    const response = await makeDeleteRequest(created.id);
    expect(response.status).toBe(200);
    expect(await db.apiKey.findUnique({ where: { id: created.id } })).toBeNull();
  });
});
