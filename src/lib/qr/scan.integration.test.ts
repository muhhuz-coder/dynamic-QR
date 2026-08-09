import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/lib/db/client';
import { updateOrgSettings } from '@/lib/settings/org';

import type { GeoIpProvider } from './geoip';
import { handleScan } from './scan';

// Hits the real local Supabase Postgres (see docs/GUARDRAILS.md — no DB mocking),
// except where noted for isolating a specific failure path.
describe('handleScan (integration)', () => {
  const createdQrIds: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.qrScanEvent.deleteMany({ where: { qrId: { in: createdQrIds } } });
    await db.qrCode.deleteMany({ where: { id: { in: createdQrIds } } });
    await db.$disconnect();
  });

  async function createTestQrCode(targetUrl = 'https://example.com') {
    const qrCode = await db.qrCode.create({
      data: {
        qrName: `scan-test-${Date.now()}-${Math.random()}`,
        shortCode: `S${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`,
        targetUrl,
      },
    });
    createdQrIds.push(qrCode.id);
    return qrCode;
  }

  it('redirects to the target URL and logs a scan event on the happy path', async () => {
    const qrCode = await createTestQrCode('https://pizzahub.com');

    const result = await handleScan(db, {
      shortCode: qrCode.shortCode,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/117.0 Safari/537.36',
      ipAddress: '203.0.113.5',
    });

    expect(result).toEqual({ kind: 'redirect', targetUrl: 'https://pizzahub.com' });

    // Analytics logging is fire-and-forget; wait for it to land.
    await vi.waitFor(async () => {
      const updated = await db.qrCode.findUniqueOrThrow({ where: { id: qrCode.id } });
      expect(updated.totalScanCount).toBe(1);
    });

    const events = await db.qrScanEvent.findMany({ where: { qrId: qrCode.id } });
    expect(events).toHaveLength(1);
    expect(events[0].targetUrlAtScan).toBe('https://pizzahub.com');
  });

  it('treats an expired QR the same as a nonexistent one', async () => {
    const qrCode = await createTestQrCode();
    await db.qrCode.update({
      where: { id: qrCode.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await handleScan(db, {
      shortCode: qrCode.shortCode,
      userAgent: 'test-agent',
      ipAddress: '203.0.113.5',
    });
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('still redirects when expiresAt is set but in the future', async () => {
    const qrCode = await createTestQrCode('https://not-yet-expired.example.com');
    await db.qrCode.update({
      where: { id: qrCode.id },
      data: { expiresAt: new Date(Date.now() + 60_000) },
    });

    const result = await handleScan(db, {
      shortCode: qrCode.shortCode,
      userAgent: 'test-agent',
      ipAddress: '203.0.113.5',
    });
    expect(result).toEqual({ kind: 'redirect', targetUrl: 'https://not-yet-expired.example.com' });
  });

  it('applies org-wide default UTM params to the redirect target', async () => {
    const qrCode = await createTestQrCode('https://pizzahub.com/menu');
    await updateOrgSettings(db, { defaultUtmSource: 'TapReview', defaultUtmCampaign: '{{name}}' });
    try {
      const result = await handleScan(db, {
        shortCode: qrCode.shortCode,
        userAgent: 'test-agent',
        ipAddress: '203.0.113.5',
      });
      expect(result.kind).toBe('redirect');
      const url = new URL((result as { targetUrl: string }).targetUrl);
      expect(url.searchParams.get('utm_source')).toBe('TapReview');
      expect(url.searchParams.get('utm_campaign')).toBe(qrCode.qrName);
    } finally {
      await updateOrgSettings(db, { defaultUtmSource: null, defaultUtmCampaign: null });
    }
  });

  it('skips UTM params for a QR with utmEnabled=false, even with org defaults set', async () => {
    const qrCode = await createTestQrCode('https://pizzahub.com/menu');
    await db.qrCode.update({ where: { id: qrCode.id }, data: { utmEnabled: false } });
    await updateOrgSettings(db, { defaultUtmSource: 'TapReview' });
    try {
      const result = await handleScan(db, {
        shortCode: qrCode.shortCode,
        userAgent: 'test-agent',
        ipAddress: '203.0.113.5',
      });
      expect(result).toEqual({ kind: 'redirect', targetUrl: 'https://pizzahub.com/menu' });
    } finally {
      await updateOrgSettings(db, { defaultUtmSource: null });
    }
  });

  it('returns not_found for an unknown short code (edge case 1)', async () => {
    const result = await handleScan(db, {
      shortCode: 'DOES-NOT-EXIST',
      userAgent: 'test-agent',
      ipAddress: '203.0.113.5',
    });
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('still redirects when the geo service is down (edge case 4)', async () => {
    const qrCode = await createTestQrCode();
    const failingProvider: GeoIpProvider = {
      async lookup() {
        throw new Error('geoip provider unavailable');
      },
    };

    const result = await handleScan(
      db,
      { shortCode: qrCode.shortCode, userAgent: 'test-agent', ipAddress: '203.0.113.5' },
      failingProvider,
    );

    expect(result.kind).toBe('redirect');

    await vi.waitFor(async () => {
      const events = await db.qrScanEvent.findMany({ where: { qrId: qrCode.id } });
      expect(events).toHaveLength(1);
      expect(events[0].locationCity).toBe('Unknown');
    });
  });

  it('still redirects even if writing the scan event fails (edge case 3)', async () => {
    const qrCode = await createTestQrCode();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(db.qrScanEvent, 'create').mockRejectedValueOnce(new Error('db write failed'));

    const result = await handleScan(db, {
      shortCode: qrCode.shortCode,
      userAgent: 'test-agent',
      ipAddress: '203.0.113.5',
    });

    // The customer-facing outcome must not depend on analytics logging succeeding.
    expect(result).toEqual({ kind: 'redirect', targetUrl: qrCode.targetUrl });

    await vi.waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'QR scan analytics logging failed:',
        expect.any(Error),
      );
    });
  });
});
