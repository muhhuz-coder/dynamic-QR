import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/lib/db/client';

import { hashPassword } from './password';
import {
  CannotRemoveLastAdminError,
  EmailAlreadyExistsError,
  inviteAdmin,
  listAdmins,
  removeAdmin,
} from './team';

describe('team management (integration)', () => {
  const createdAdminIds: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.admin.deleteMany({ where: { id: { in: createdAdminIds } } });
    await db.$disconnect();
  });

  it('invites a new admin with a hashed temporary password', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const email = `invite-${suffix}@example.com`;
    const admin = await inviteAdmin(db, email, 'temp-password-123');
    createdAdminIds.push(admin.id);

    expect(admin.email).toBe(email);
    expect(admin.passwordHash).not.toBe('temp-password-123');
  });

  it('throws EmailAlreadyExistsError for a duplicate email', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const email = `dup-${suffix}@example.com`;
    const first = await inviteAdmin(db, email, 'temp-password-123');
    createdAdminIds.push(first.id);

    await expect(inviteAdmin(db, email, 'another-password')).rejects.toThrow(
      EmailAlreadyExistsError,
    );
  });

  it('lists admins without exposing password hashes', async () => {
    const admins = await listAdmins(db);
    expect(admins.length).toBeGreaterThan(0);
    expect(admins[0]).not.toHaveProperty('passwordHash');
  });

  it('removes an admin when others remain', async () => {
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const keep = await db.admin.create({
      data: { email: `keep-${suffix}@example.com`, passwordHash: await hashPassword('x') },
    });
    const toRemove = await db.admin.create({
      data: { email: `remove-${suffix}@example.com`, passwordHash: await hashPassword('x') },
    });
    createdAdminIds.push(keep.id);

    await removeAdmin(db, toRemove.id);
    expect(await db.admin.findUnique({ where: { id: toRemove.id } })).toBeNull();
  });

  it('refuses to remove the last remaining admin', async () => {
    // Simulates a single-admin state via a mocked count rather than actually
    // deleting every other admin row in this shared dev database (which would
    // wipe out unrelated seed/test data) — same technique scan.integration.test.ts
    // uses to isolate a specific failure path without mutating shared state.
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const onlyAdmin = await db.admin.create({
      data: { email: `only-${suffix}@example.com`, passwordHash: await hashPassword('x') },
    });
    createdAdminIds.push(onlyAdmin.id);
    vi.spyOn(db.admin, 'count').mockResolvedValueOnce(1);

    await expect(removeAdmin(db, onlyAdmin.id)).rejects.toThrow(CannotRemoveLastAdminError);
    expect(await db.admin.findUnique({ where: { id: onlyAdmin.id } })).not.toBeNull();
  });
});
