import { NextResponse, type NextRequest } from 'next/server';

import { verifyAdminAuth } from './adminAuth';
import type { AdminTokenPayload } from './jwt';

/**
 * One-liner guard for /api/admin/* route handlers (see docs/GUARDRAILS.md —
 * every admin route must call this, no exceptions). Usage:
 *
 *   const admin = await requireAdmin(request);
 *   if (admin instanceof NextResponse) return admin;
 */
export async function requireAdmin(
  request: NextRequest,
): Promise<AdminTokenPayload | NextResponse> {
  const admin = await verifyAdminAuth(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return admin;
}
