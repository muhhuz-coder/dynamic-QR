import { afterAll, describe, expect, it } from 'vitest';

import { db } from './client';

// Hits the real local Supabase Postgres (see docs/GUARDRAILS.md — no DB mocking).
// Requires `pnpm exec supabase start` and `pnpm prisma:migrate` to have been run first.
describe('db client (integration)', () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it('connects and can round-trip a QrCode row', async () => {
    const created = await db.qrCode.create({
      data: {
        qrName: `smoke-test-${Date.now()}`,
        shortCode: `T${Date.now().toString(36).toUpperCase()}`,
        targetUrl: 'https://example.com',
      },
    });

    const found = await db.qrCode.findUniqueOrThrow({ where: { id: created.id } });
    expect(found.targetUrl).toBe('https://example.com');

    await db.qrCode.delete({ where: { id: created.id } });
  });
});
