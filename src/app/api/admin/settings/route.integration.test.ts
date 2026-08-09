import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signAdminToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db/client';

import { GET, PUT } from './route';

describe('/api/admin/settings (integration)', () => {
  let adminToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-do-not-use-in-prod';
    adminToken = await signAdminToken({
      sub: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
    });
  });

  afterAll(async () => {
    await db.orgSettings.deleteMany({ where: { id: 'org' } });
    await db.$disconnect();
  });

  function makeGetRequest(token: string | null = adminToken) {
    return GET(
      new NextRequest('http://localhost:3000/api/admin/settings', {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    );
  }

  function makePutRequest(body: unknown, token: string | null = adminToken) {
    return PUT(
      new NextRequest('http://localhost:3000/api/admin/settings', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  }

  it('rejects requests without an admin token', async () => {
    expect((await makeGetRequest(null)).status).toBe(401);
    expect((await makePutRequest({}, null)).status).toBe(401);
  });

  it('returns null settings before anything has been saved', async () => {
    await db.orgSettings.deleteMany({ where: { id: 'org' } });
    const body = await (await makeGetRequest()).json();
    expect(body.settings).toBeNull();
  });

  it('saves and reads back org settings', async () => {
    const putResponse = await makePutRequest({
      companyName: 'Tap & Review',
      defaultUtmSource: 'TapReview',
      defaultUtmCampaign: '{{name}}',
    });
    expect(putResponse.status).toBe(200);

    const body = await (await makeGetRequest()).json();
    expect(body.settings.companyName).toBe('Tap & Review');
    expect(body.settings.defaultUtmSource).toBe('TapReview');
  });

  it('400s for an invalid publicBaseUrl', async () => {
    const response = await makePutRequest({ publicBaseUrl: 'not-a-url' });
    expect(response.status).toBe(400);
  });
});
