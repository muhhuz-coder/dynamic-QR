import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/lib/db/client';

import { AdminNotFoundError, changeAdminPassword, IncorrectPasswordError } from './changePassword';
import { hashPassword, verifyPassword } from './password';

describe('changeAdminPassword (integration)', () => {
  const createdAdminIds: string[] = [];

  afterAll(async () => {
    await db.admin.deleteMany({ where: { id: { in: createdAdminIds } } });
    await db.$disconnect();
  });

  async function createTestAdmin(password = 'original-password-123') {
    const passwordHash = await hashPassword(password);
    const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const admin = await db.admin.create({
      data: { email: `pw-${suffix}@example.com`, passwordHash },
    });
    createdAdminIds.push(admin.id);
    return admin;
  }

  it('changes the password when the current one is correct', async () => {
    const admin = await createTestAdmin('original-password-123');
    await changeAdminPassword(db, admin.id, 'original-password-123', 'new-password-456');

    const updated = await db.admin.findUniqueOrThrow({ where: { id: admin.id } });
    expect(await verifyPassword('new-password-456', updated.passwordHash)).toBe(true);
    expect(await verifyPassword('original-password-123', updated.passwordHash)).toBe(false);
  });

  it('throws IncorrectPasswordError when the current password is wrong', async () => {
    const admin = await createTestAdmin('original-password-123');
    await expect(
      changeAdminPassword(db, admin.id, 'wrong-password', 'new-password-456'),
    ).rejects.toThrow(IncorrectPasswordError);
  });

  it('throws AdminNotFoundError for an unknown admin id', async () => {
    await expect(
      changeAdminPassword(db, '00000000-0000-0000-0000-000000000000', 'x', 'y'),
    ).rejects.toThrow(AdminNotFoundError);
  });
});
