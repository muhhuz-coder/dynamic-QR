import type { OrgSettings, PrismaClient } from '@/generated/prisma/client';

const ORG_SETTINGS_ID = 'org';

/** Reads the single org-wide settings row, or null if it's never been saved. */
export async function getOrgSettings(db: PrismaClient): Promise<OrgSettings | null> {
  return db.orgSettings.findUnique({ where: { id: ORG_SETTINGS_ID } });
}

export interface UpdateOrgSettingsInput {
  companyName?: string | null;
  country?: string | null;
  timeZone?: string | null;
  defaultUtmSource?: string | null;
  defaultUtmMedium?: string | null;
  defaultUtmCampaign?: string | null;
  defaultUtmTerm?: string | null;
  defaultUtmContent?: string | null;
  publicBaseUrl?: string | null;
}

/** Upserts the single org-wide settings row. */
export async function updateOrgSettings(
  db: PrismaClient,
  input: UpdateOrgSettingsInput,
): Promise<OrgSettings> {
  return db.orgSettings.upsert({
    where: { id: ORG_SETTINGS_ID },
    create: { id: ORG_SETTINGS_ID, ...input },
    update: input,
  });
}

/**
 * Resolves the base URL used to build short-link URLs: the settings-page
 * "custom domain" override if set, otherwise NEXT_PUBLIC_BASE_URL — this is
 * what lets a single-tenant custom domain take effect without a redeploy.
 */
export async function getPublicBaseUrl(db: PrismaClient): Promise<string> {
  const settings = await getOrgSettings(db);
  return settings?.publicBaseUrl ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
}
