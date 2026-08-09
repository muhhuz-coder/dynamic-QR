import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';
import { getOrgSettings, updateOrgSettings } from '@/lib/settings/org';

const bodySchema = z.object({
  companyName: z.string().max(255).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  timeZone: z.string().max(100).nullable().optional(),
  defaultUtmSource: z.string().max(255).nullable().optional(),
  defaultUtmMedium: z.string().max(255).nullable().optional(),
  defaultUtmCampaign: z.string().max(255).nullable().optional(),
  defaultUtmTerm: z.string().max(255).nullable().optional(),
  defaultUtmContent: z.string().max(255).nullable().optional(),
  publicBaseUrl: z.string().url().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const settings = await getOrgSettings(db);
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
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

  const settings = await updateOrgSettings(db, parsed.data);
  return NextResponse.json({ settings });
}
