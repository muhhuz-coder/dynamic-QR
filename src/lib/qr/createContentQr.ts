import type { ContentType, PrismaClient, ProductType, QrCode } from '@/generated/prisma/client';

import { DuplicateQrNamesError } from './batch';
import { buildQrPayload, deriveContentLabel, type ContentPayload } from './contentTypes';
import { generateUniqueShortCode } from './shortCode';

/**
 * Creates a single non-URL-type QR (vCard/Wi-Fi/Text) — a separate path from
 * createQrBatch()/buildBatchEntriesFromBaseName(), since "batch of N vCards"
 * isn't a use case those were designed for, and content-type QRs are always
 * single creations, never a quantity-expanded batch.
 */
export async function createContentQr(
  db: PrismaClient,
  qrName: string,
  contentType: ContentType,
  payload: ContentPayload,
  productType?: ProductType,
): Promise<QrCode> {
  // Validates the payload up front — fail before touching the DB, not on first render.
  buildQrPayload(contentType, payload);

  const existing = await db.qrCode.findUnique({ where: { qrName } });
  if (existing) {
    throw new DuplicateQrNamesError([qrName]);
  }

  const shortCode = await generateUniqueShortCode(
    async (code) => (await db.qrCode.findUnique({ where: { shortCode: code } })) !== null,
  );

  return db.qrCode.create({
    data: {
      qrName,
      shortCode,
      targetUrl: deriveContentLabel(contentType, payload),
      contentType,
      // Prisma's Json input type wants a plain JSON-compatible value, not our
      // named interface types — round-tripping through JSON satisfies that
      // structurally (payload is already validated JSON-safe by buildQrPayload above).
      contentPayload: JSON.parse(JSON.stringify(payload)),
      productType,
    },
  });
}
