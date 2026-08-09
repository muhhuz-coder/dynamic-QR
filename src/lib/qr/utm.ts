export interface OrgUtmDefaults {
  defaultUtmSource: string | null;
  defaultUtmMedium: string | null;
  defaultUtmCampaign: string | null;
  defaultUtmTerm: string | null;
  defaultUtmContent: string | null;
}

/**
 * Appends the org's default UTM parameters to a redirect target, unless the
 * QR has opted out (utmEnabled=false) or no org defaults are configured.
 * `utm_campaign` supports a `{{name}}` placeholder, substituted with the QR's
 * own name — mirrors a competitor's site-wide UTM settings.
 */
export function applyUtmParams(
  targetUrl: string,
  orgDefaults: OrgUtmDefaults | null,
  qrName: string,
  utmEnabled: boolean,
): string {
  if (!utmEnabled || !orgDefaults) {
    return targetUrl;
  }

  const params: Record<string, string | null> = {
    utm_source: orgDefaults.defaultUtmSource,
    utm_medium: orgDefaults.defaultUtmMedium,
    utm_campaign: orgDefaults.defaultUtmCampaign?.replaceAll('{{name}}', qrName) ?? null,
    utm_term: orgDefaults.defaultUtmTerm,
    utm_content: orgDefaults.defaultUtmContent,
  };

  const entries = Object.entries(params).filter((entry): entry is [string, string] =>
    Boolean(entry[1]),
  );
  if (entries.length === 0) {
    return targetUrl;
  }

  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    // Not a parseable absolute URL — leave it untouched rather than throwing
    // mid-redirect (the target was already validated as http(s) at write time,
    // but stay defensive here since this runs on the hot scan path).
    return targetUrl;
  }

  for (const [key, value] of entries) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
