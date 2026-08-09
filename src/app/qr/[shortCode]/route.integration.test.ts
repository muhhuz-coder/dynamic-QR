import { NextRequest } from 'next/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/lib/db/client';

import { GET } from './route';

describe('GET /qr/[shortCode] (integration)', () => {
  const createdQrIds: string[] = [];

  afterAll(async () => {
    // Scan logging is fire-and-forget (see handleScan), so in-flight writes from
    // the tests above may still land after the assertions resolve. Retry the whole
    // delete sequence rather than racing a foreign-key violation against a late write.
    await vi.waitFor(async () => {
      await db.qrScanEvent.deleteMany({ where: { qrId: { in: createdQrIds } } });
      await db.qrCode.deleteMany({ where: { id: { in: createdQrIds } } });
    });
    await db.$disconnect();
  });

  async function createTestQrCode(targetUrl = 'https://example.com') {
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `route-test-${Date.now()}-${Math.random()}`,
        shortCode: `R${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`,
        targetUrl,
      },
    });
    createdQrIds.push(qrCode.id);
    return qrCode;
  }

  it('302-redirects to the target URL for a known short code', async () => {
    const qrCode = await createTestQrCode('https://pizzahub.com/menu');
    const request = new NextRequest(`http://localhost:3000/qr/${qrCode.shortCode}`, {
      headers: { 'x-forwarded-for': '198.51.100.4' },
    });

    const response = await GET(request, {
      params: Promise.resolve({ shortCode: qrCode.shortCode }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://pizzahub.com/menu');
  });

  it('404s for an unknown short code (edge case 1)', async () => {
    const request = new NextRequest('http://localhost:3000/qr/NOPE', {
      headers: { 'x-forwarded-for': '198.51.100.5' },
    });

    const response = await GET(request, { params: Promise.resolve({ shortCode: 'NOPE' }) });

    expect(response.status).toBe(404);
  });

  it('429s once the per-IP rate limit is exhausted (edge case 5)', async () => {
    const qrCode = await createTestQrCode();
    const ip = `198.51.100.${Math.floor(Math.random() * 200)}`;
    const makeRequest = () =>
      GET(
        new NextRequest(`http://localhost:3000/qr/${qrCode.shortCode}`, {
          headers: { 'x-forwarded-for': ip },
        }),
        {
          params: Promise.resolve({ shortCode: qrCode.shortCode }),
        },
      );

    // 50 requests comfortably exceeds the 30-token bucket even accounting for
    // in-test refill from real DB round-trip latency (refills at 3 tokens/sec;
    // 50 requests would need >6s of cumulative latency to out-refill exhaustion).
    const statuses: number[] = [];
    for (let i = 0; i < 50; i++) {
      const response = await makeRequest();
      statuses.push(response.status);
    }

    expect(statuses).toContain(429);
  });
});
