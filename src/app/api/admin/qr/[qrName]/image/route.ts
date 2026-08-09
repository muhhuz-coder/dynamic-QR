import { NextResponse, type NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';
import {
  buildQrPayload,
  InvalidContentPayloadError,
  type ContentPayload,
} from '@/lib/qr/contentTypes';
import {
  buildShortLinkUrl,
  generateQrPng,
  generateQrSvg,
  type QrDesignOptions,
} from '@/lib/qr/image';
import { InvalidPrintSizeError, resolveQrSizeMm } from '@/lib/qr/printSizes';
import { getPublicBaseUrl } from '@/lib/settings/org';

/**
 * Renders a QR code on demand from its short code — see docs/GUARDRAILS.md /
 * batch.ts: no object storage is wired up, so images aren't pre-rendered/stored.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ qrName: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { qrName } = await params;
  const qrCode = await db.qrCode.findUnique({ where: { qrName } });
  if (!qrCode) {
    return NextResponse.json({ error: 'QR code not found' }, { status: 404 });
  }

  // URL type encodes our own short link (redirect + analytics); every other
  // type encodes its payload directly, exactly like a standalone vCard/Wi-Fi
  // QR generator — no redirect, no scan tracking possible for those.
  let encodedContent: string;
  if (qrCode.contentType === 'URL') {
    const baseUrl = await getPublicBaseUrl(db);
    encodedContent = buildShortLinkUrl(baseUrl, qrCode.shortCode);
  } else {
    try {
      encodedContent = buildQrPayload(
        qrCode.contentType,
        qrCode.contentPayload as ContentPayload | null,
      );
    } catch (error) {
      if (error instanceof InvalidContentPayloadError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  }

  const format = request.nextUrl.searchParams.get('format') === 'svg' ? 'svg' : 'png';

  if (format === 'svg') {
    const sizeMmParam = request.nextUrl.searchParams.get('sizeMm');
    let sizeMm: number;
    try {
      sizeMm = resolveQrSizeMm(qrCode.productType, sizeMmParam ? Number(sizeMmParam) : undefined);
    } catch (error) {
      if (error instanceof InvalidPrintSizeError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    const designOptions = qrCode.designOptions as QrDesignOptions | null;
    const svg = await generateQrSvg(encodedContent, { ...designOptions, sizeMm });
    return new NextResponse(svg, { headers: { 'content-type': 'image/svg+xml' } });
  }

  const png = await generateQrPng(
    encodedContent,
    (qrCode.designOptions as QrDesignOptions | null) ?? undefined,
  );
  return new NextResponse(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
}
