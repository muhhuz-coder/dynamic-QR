import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';
import { DuplicateQrNamesError } from '@/lib/qr/batch';
import { InvalidContentPayloadError } from '@/lib/qr/contentTypes';
import { createContentQr } from '@/lib/qr/createContentQr';

const bodySchema = z.discriminatedUnion('contentType', [
  z.object({
    contentType: z.literal('TEXT'),
    qrName: z.string().min(1).max(50),
    productType: z.enum(['STAND', 'COIN', 'CARD']).optional(),
    payload: z.object({ text: z.string().min(1) }),
  }),
  z.object({
    contentType: z.literal('VCARD'),
    qrName: z.string().min(1).max(50),
    productType: z.enum(['STAND', 'COIN', 'CARD']).optional(),
    payload: z.object({
      name: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      org: z.string().optional(),
    }),
  }),
  z.object({
    contentType: z.literal('WIFI'),
    qrName: z.string().min(1).max(50),
    productType: z.enum(['STAND', 'COIN', 'CARD']).optional(),
    payload: z.object({
      ssid: z.string().min(1),
      password: z.string().optional(),
      security: z.enum(['WPA', 'WEP', 'nopass']).optional(),
    }),
  }),
]);

/** Creates a single non-URL-type QR (vCard/Wi-Fi/Text) — see src/lib/qr/createContentQr.ts. */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { qrName, contentType, payload, productType } = parsed.data;

  try {
    const qrCode = await createContentQr(db, qrName, contentType, payload, productType);
    return NextResponse.json({ qr: qrCode }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateQrNamesError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof InvalidContentPayloadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
