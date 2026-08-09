import type { Admin, PrismaClient } from '@/generated/prisma/client';

import { hashPassword } from './password';

export class EmailAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`An admin with email ${email} already exists`);
    this.name = 'EmailAlreadyExistsError';
  }
}

export class CannotRemoveLastAdminError extends Error {
  constructor() {
    super('Cannot remove the last remaining admin');
    this.name = 'CannotRemoveLastAdminError';
  }
}

export function listAdmins(db: PrismaClient) {
  return db.admin.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, createdAt: true },
  });
}

/** Invites a new admin with a temporary password they should change on first login. */
export async function inviteAdmin(
  db: PrismaClient,
  email: string,
  temporaryPassword: string,
): Promise<Admin> {
  const existing = await db.admin.findUnique({ where: { email } });
  if (existing) {
    throw new EmailAlreadyExistsError(email);
  }

  const passwordHash = await hashPassword(temporaryPassword);
  return db.admin.create({ data: { email, passwordHash } });
}

/** Removes an admin — refuses to remove the last one, so the app never locks everyone out. */
export async function removeAdmin(db: PrismaClient, adminId: string): Promise<void> {
  const count = await db.admin.count();
  if (count <= 1) {
    throw new CannotRemoveLastAdminError();
  }
  await db.admin.delete({ where: { id: adminId } });
}
