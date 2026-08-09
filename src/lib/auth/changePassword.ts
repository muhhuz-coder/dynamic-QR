import type { PrismaClient } from '@/generated/prisma/client';

import { hashPassword, verifyPassword } from './password';

export class AdminNotFoundError extends Error {
  constructor() {
    super('Admin not found');
    this.name = 'AdminNotFoundError';
  }
}

export class IncorrectPasswordError extends Error {
  constructor() {
    super('Current password is incorrect');
    this.name = 'IncorrectPasswordError';
  }
}

/** Self-service password change — verifies the current password before setting a new one. */
export async function changeAdminPassword(
  db: PrismaClient,
  adminId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const admin = await db.admin.findUnique({ where: { id: adminId } });
  if (!admin) {
    throw new AdminNotFoundError();
  }

  const isCorrect = await verifyPassword(currentPassword, admin.passwordHash);
  if (!isCorrect) {
    throw new IncorrectPasswordError();
  }

  const passwordHash = await hashPassword(newPassword);
  await db.admin.update({ where: { id: adminId }, data: { passwordHash } });
}
