import type { NextRequest } from 'next/server';

import { verifyAdminToken, type AdminTokenPayload } from './jwt';

/**
 * Verifies the Authorization: Bearer <token> header on an admin request.
 * Returns the token payload if valid and role === 'admin', otherwise null.
 * Every /api/admin/* route handler must call this — see docs/GUARDRAILS.md.
 */
export async function verifyAdminAuth(request: NextRequest): Promise<AdminTokenPayload | null> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!token) return null;

  const payload = await verifyAdminToken(token);
  if (!payload || payload.role !== 'admin') return null;

  return payload;
}
