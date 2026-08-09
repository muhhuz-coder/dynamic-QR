import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/lib/db/client';

import { getOrgSettings, getPublicBaseUrl, updateOrgSettings } from './org';

describe('org settings (integration)', () => {
  afterAll(async () => {
    // This is a genuine single-row singleton in production, so any test that
    // leaves it dirty pollutes every other file that reads org settings
    // (e.g. scan.integration.test.ts's UTM tests) — always reset to empty.
    await db.orgSettings.deleteMany({ where: { id: 'org' } });
    await db.$disconnect();
  });

  it('returns null before any settings have been saved', async () => {
    await db.orgSettings.deleteMany({ where: { id: 'org' } });
    expect(await getOrgSettings(db)).toBeNull();
  });

  it('creates the row on first update', async () => {
    const updated = await updateOrgSettings(db, {
      companyName: 'Tap & Review',
      defaultUtmSource: 'TapReview',
    });
    expect(updated.companyName).toBe('Tap & Review');
    expect(updated.defaultUtmSource).toBe('TapReview');
  });

  it('merges subsequent updates rather than overwriting the whole row', async () => {
    await updateOrgSettings(db, { companyName: 'Tap & Review', country: 'Pakistan' });
    const updated = await updateOrgSettings(db, { defaultUtmMedium: 'qr_code' });

    expect(updated.companyName).toBe('Tap & Review');
    expect(updated.country).toBe('Pakistan');
    expect(updated.defaultUtmMedium).toBe('qr_code');
  });

  it('reads back what was saved via getOrgSettings', async () => {
    await updateOrgSettings(db, { companyName: 'Read Back Co' });
    const settings = await getOrgSettings(db);
    expect(settings?.companyName).toBe('Read Back Co');
  });
});

describe('getPublicBaseUrl (integration)', () => {
  const originalEnv = process.env.NEXT_PUBLIC_BASE_URL;

  afterAll(async () => {
    process.env.NEXT_PUBLIC_BASE_URL = originalEnv;
    await db.orgSettings.deleteMany({ where: { id: 'org' } });
    await db.$disconnect();
  });

  it('falls back to NEXT_PUBLIC_BASE_URL when no override is set', async () => {
    await db.orgSettings.deleteMany({ where: { id: 'org' } });
    process.env.NEXT_PUBLIC_BASE_URL = 'https://env-default.example.com';
    expect(await getPublicBaseUrl(db)).toBe('https://env-default.example.com');
  });

  it('prefers the settings-page override when set', async () => {
    await updateOrgSettings(db, { publicBaseUrl: 'https://custom.example.com' });
    expect(await getPublicBaseUrl(db)).toBe('https://custom.example.com');
  });
});
