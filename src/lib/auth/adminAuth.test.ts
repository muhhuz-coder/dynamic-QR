import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { verifyAdminAuth } from './adminAuth';
import { signAdminToken } from './jwt';

function requestWithAuth(header: string | null) {
  const headers: Record<string, string> = header ? { authorization: header } : {};
  return new NextRequest('http://localhost:3000/api/admin/qr', { headers });
}

describe('verifyAdminAuth', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
  });

  it('returns the payload for a valid admin bearer token', async () => {
    const token = await signAdminToken({
      sub: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
    });
    const payload = await verifyAdminAuth(requestWithAuth(`Bearer ${token}`));
    expect(payload).toMatchObject({ sub: 'admin-1', role: 'admin' });
  });

  it('returns null when there is no Authorization header', async () => {
    expect(await verifyAdminAuth(requestWithAuth(null))).toBeNull();
  });

  it('returns null for a non-Bearer scheme', async () => {
    expect(await verifyAdminAuth(requestWithAuth('Basic dXNlcjpwYXNz'))).toBeNull();
  });

  it('returns null for a valid token with a non-admin role', async () => {
    const token = await signAdminToken({
      sub: 'user-1',
      email: 'user@example.com',
      role: 'viewer',
    });
    expect(await verifyAdminAuth(requestWithAuth(`Bearer ${token}`))).toBeNull();
  });

  it('returns null for a tampered token', async () => {
    const token = await signAdminToken({
      sub: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
    });
    expect(await verifyAdminAuth(requestWithAuth(`Bearer ${token}x`))).toBeNull();
  });
});
