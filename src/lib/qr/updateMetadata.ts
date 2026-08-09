import { Prisma, type PrismaClient, type QrCode } from '@/generated/prisma/client';

import { QrNotFoundError } from './errors';

export interface UpdateQrMetadataInput {
  displayName?: string | null;
  tags?: string[];
  /** ISO string or null to clear. Unlike displayName/tags this does affect scan
   * behavior (handleScan treats an expired QR as not-found) but isn't audit-logged
   * — audit logging is reserved for target URL changes, per the original spec. */
  expiresAt?: string | null;
  /** Per-QR opt-out of the org-wide default UTM parameters (see src/lib/qr/utm.ts). */
  utmEnabled?: boolean;
  /** { fgColor?, bgColor?, logoUrl? } or null to reset to defaults — see src/lib/qr/image.ts. */
  designOptions?: Record<string, unknown> | null;
}

/**
 * Updates a QR's display name, tags, and expiration — unlike updateQrTarget(),
 * none of these are audit-logged.
 */
export async function updateQrMetadata(
  db: PrismaClient,
  qrName: string,
  input: UpdateQrMetadataInput,
): Promise<QrCode> {
  const qrCode = await db.qrCode.findUnique({ where: { qrName } });
  if (!qrCode) {
    throw new QrNotFoundError(qrName);
  }

  return db.qrCode.update({
    where: { id: qrCode.id },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.expiresAt !== undefined
        ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
        : {}),
      ...(input.utmEnabled !== undefined ? { utmEnabled: input.utmEnabled } : {}),
      ...(input.designOptions !== undefined
        ? {
            designOptions:
              input.designOptions === null
                ? Prisma.JsonNull
                : (input.designOptions as Prisma.InputJsonValue),
          }
        : {}),
    },
  });
}
