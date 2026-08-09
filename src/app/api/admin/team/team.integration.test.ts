import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/password';
import { db } from '@/lib/db/client';

import { DELETE } from './[adminId]/route';
import { GET, POST } from './route';

describe('/api/admin/team (integration)', () => {
  let adminToken: string;
  const createdAdminIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-do-not-use-in-prod';
    adminToken = await signAdminToken({
      sub: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.admin.deleteMany({ where: { id: { in: createdAdminIds } } });
    await db.$disconnect();
  });

  function makeGetRequest(token: string | null = adminToken) {
    return GET(
      new NextRequest('http://localhost:3000/api/admin/team', {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    );
  }

  function makePostRequest(body: unknown, token: string | null = adminToken) {
    return POST(
      new NextRequest('http://localhost:3000/api/admin/team', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  }

  function makeDeleteRequest(adminId: string, token: string | null = adminToken) {
    return DELETE(
      new NextRequest(`http://localhost:3000/api/admin/team/${adminId}`, {
        method: 'DELETE',
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
      { params: Promise.resolve({ adminId }) },
    );
  }

  it('rejects requests without an admin token', async () => {
    expect((await makeGetRequest(null)).status).toBe(401);
    expect((await makePostRequest({}, null)).status).toBe(401);
  });

  it('lists admins', async () => {
    const response = await makeGetRequest();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.admins)).toBe(true);
  });

  it('invites a new admin', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const email = `team-route-${suffix}@example.com`;
    const response = await makePostRequest({ email, temporaryPassword: 'temp-password-123' });
    expect(response.status).toBe(201);
    const body = await response.json();
    createdAdminIds.push(body.admin.id);
    expect(body.admin.email).toBe(email);
  });

  it('409s when inviting a duplicate email', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const email = `team-dup-${suffix}@example.com`;
    const first = await makePostRequest({ email, temporaryPassword: 'temp-password-123' });
    const firstBody = await first.json();
    createdAdminIds.push(firstBody.admin.id);

    const response = await makePostRequest({ email, temporaryPassword: 'another-password' });
    expect(response.status).toBe(409);
  });

  it('removes an admin when others remain', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const toRemove = await db.admin.create({
      data: { email: `remove-route-${suffix}@example.com`, passwordHash: await hashPassword('x') },
    });

    const response = await makeDeleteRequest(toRemove.id);
    expect(response.status).toBe(200);
    expect(await db.admin.findUnique({ where: { id: toRemove.id } })).toBeNull();
  });

  it('400s when trying to remove the last admin', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const onlyAdmin = await db.admin.create({
      data: { email: `last-route-${suffix}@example.com`, passwordHash: await hashPassword('x') },
    });
    createdAdminIds.push(onlyAdmin.id);
    vi.spyOn(db.admin, 'count').mockResolvedValueOnce(1);

    const response = await makeDeleteRequest(onlyAdmin.id);
    expect(response.status).toBe(400);
    expect(await db.admin.findUnique({ where: { id: onlyAdmin.id } })).not.toBeNull();
  });
});
