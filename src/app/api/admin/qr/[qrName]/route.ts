import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';
import { InvalidTargetUrlError } from '@/lib/qr/batch';
import { deleteQrCode } from '@/lib/qr/delete';
import { getQrDetail } from '@/lib/qr/detail';
import { QrNotFoundError } from '@/lib/qr/errors';
import { updateQrMetadata } from '@/lib/qr/updateMetadata';
import { updateQrTarget } from '@/lib/qr/updateTarget';

const bodySchema = z
  .object({
    newTargetUrl: z.string().min(1).optional(),
    displayName: z.string().max(255).nullable().optional(),
    tags: z.array(z.string().min(1).max(50)).max(20).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    utmEnabled: z.boolean().optional(),
    designOptions: z
      .object({
        fgColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        bgColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        logoUrl: z.string().url().optional(),
        moduleShape: z.enum(['square', 'rounded', 'dots', 'diamond']).optional(),
        eyeShape: z.enum(['square', 'rounded', 'circle']).optional(),
        gradient: z
          .object({
            from: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            to: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            direction: z.enum(['horizontal', 'vertical', 'diagonal']).optional(),
          })
          .optional(),
        bgImageUrl: z.string().url().optional(),
        frame: z.enum(['none', 'square', 'rounded', 'scan-me']).optional(),
        frameColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        frameText: z.string().max(40).optional(),
        headerText: z.string().max(60).optional(),
        headerColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        footerText: z.string().max(60).optional(),
        footerColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
      })
      .nullable()
      .optional(),
  })
  .refine(
    (data) =>
      data.newTargetUrl !== undefined ||
      data.displayName !== undefined ||
      data.tags !== undefined ||
      data.expiresAt !== undefined ||
      data.utmEnabled !== undefined ||
      data.designOptions !== undefined,
    {
      message:
        'At least one of newTargetUrl, displayName, tags, expiresAt, utmEnabled, or designOptions must be provided',
    },
  );

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ qrName: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { qrName } = await params;
  try {
    const detail = await getQrDetail(db, qrName);
    return NextResponse.json({ qrCode: detail });
  } catch (error) {
    if (error instanceof QrNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ qrName: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { qrName } = await params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { newTargetUrl, displayName, tags, expiresAt, utmEnabled, designOptions } = parsed.data;

  try {
    let targetResult: { oldTarget: string; newTarget: string } | null = null;
    if (newTargetUrl !== undefined) {
      targetResult = await updateQrTarget(db, qrName, newTargetUrl, admin.sub);
    }
    if (
      displayName !== undefined ||
      tags !== undefined ||
      expiresAt !== undefined ||
      utmEnabled !== undefined ||
      designOptions !== undefined
    ) {
      await updateQrMetadata(db, qrName, {
        displayName,
        tags,
        expiresAt,
        utmEnabled,
        designOptions,
      });
    }

    return NextResponse.json({
      success: true,
      qrName,
      ...(targetResult ?? {}),
      message: 'QR code updated successfully',
    });
  } catch (error) {
    if (error instanceof QrNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidTargetUrlError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ qrName: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { qrName } = await params;
  try {
    await deleteQrCode(db, qrName);
    return NextResponse.json({ success: true, qrName, message: 'QR code deleted' });
  } catch (error) {
    if (error instanceof QrNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
