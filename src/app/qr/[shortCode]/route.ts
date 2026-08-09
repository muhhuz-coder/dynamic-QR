import { NextResponse, type NextRequest } from 'next/server';

import { db } from '@/lib/db/client';
import { RateLimiter } from '@/lib/rateLimiter';
import { handleScan } from '@/lib/qr/scan';

// 30 scans per key per 10s window.
const scanRateLimiter = new RateLimiter(30, 10_000 / 30);

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() ?? 'unknown';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shortCode: string }> },
) {
  const { shortCode } = await params;
  const ipAddress = getClientIp(request);

  if (!scanRateLimiter.tryConsume(ipAddress)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // NFC tags/physical stands can encode ?via=nfc to distinguish tap from QR-scan
  // analytics (docs/core-logic/02-qr-management.md's byMethod breakdown). Anything
  // else, including no param at all, is treated as a plain QR scan.
  const scanMethod = request.nextUrl.searchParams.get('via') === 'nfc' ? 'NFC_TAP' : 'QR_SCAN';

  const result = await handleScan(db, {
    shortCode,
    userAgent: request.headers.get('user-agent') ?? '',
    ipAddress,
    scanMethod,
  });

  if (result.kind === 'not_found') {
    return NextResponse.json({ error: 'QR code not found' }, { status: 404 });
  }

  return NextResponse.redirect(result.targetUrl, 302);
}
