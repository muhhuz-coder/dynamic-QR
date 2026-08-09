import { NextResponse, type NextRequest } from 'next/server';

import { db } from '@/lib/db/client';

import { verifyApiKey } from './apiKey';

/**
 * Guard for /api/v1/* public API routes — separate auth path from admin JWT
 * sessions, checked via `Authorization: Bearer <apiKey>`. Usage:
 *
 *   const authError = await requireApiKey(request);
 *   if (authError) return authError;
 */
export async function requireApiKey(request: NextRequest): Promise<NextResponse | null> {
  const header = request.headers.get('authorization');
  const rawKey = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!rawKey) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
  }

  const isValid = await verifyApiKey(db, rawKey);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  return null;
}
