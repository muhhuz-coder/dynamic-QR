import type { PrismaClient, ScanMethod } from '@/generated/prisma/client';

import { getOrgSettings } from '../settings/org';
import { getLocationFromIP, type GeoIpProvider } from './geoip';
import { applyUtmParams } from './utm';
import { parseBrowser, parseDeviceType, parseOS } from './userAgent';

export interface ScanRequestInfo {
  shortCode: string;
  userAgent: string;
  ipAddress: string;
  /** How the customer reached this URL. Defaults to QR_SCAN — see the `via` query param on the route. */
  scanMethod?: ScanMethod;
}

export type ScanResult = { kind: 'redirect'; targetUrl: string } | { kind: 'not_found' };

/**
 * Core scan handling: look up the QR, best-effort log the scan + bump counters,
 * and report where to redirect. Logging failures never surface to the caller —
 * a customer scanning a QR must always get redirected. See
 * docs/core-logic/09-error-handling-edge-cases.md (QR scan edge cases).
 */
export async function handleScan(
  db: PrismaClient,
  info: ScanRequestInfo,
  geoIpProvider?: GeoIpProvider,
): Promise<ScanResult> {
  const qrCode = await db.qrCode.findUnique({ where: { shortCode: info.shortCode } });

  // An expired QR is treated the same as a nonexistent one — no separate status
  // code, matching how a physically printed code with no live record behaves.
  if (!qrCode || (qrCode.expiresAt && qrCode.expiresAt <= new Date())) {
    return { kind: 'not_found' };
  }

  // Best-effort analytics: never let a DB failure here block the redirect.
  void logScan(db, qrCode.id, qrCode.targetUrl, info, geoIpProvider).catch((error) => {
    console.error('QR scan analytics logging failed:', error);
  });

  // UTM application is also best-effort — a settings-lookup failure must never
  // block the redirect, so fall back to the bare target URL on error.
  let redirectUrl = qrCode.targetUrl;
  try {
    const orgSettings = await getOrgSettings(db);
    redirectUrl = applyUtmParams(qrCode.targetUrl, orgSettings, qrCode.qrName, qrCode.utmEnabled);
  } catch (error) {
    console.error('Failed to apply UTM params, redirecting to the bare target URL:', error);
  }

  return { kind: 'redirect', targetUrl: redirectUrl };
}

async function logScan(
  db: PrismaClient,
  qrId: string,
  targetUrlAtScan: string,
  info: ScanRequestInfo,
  geoIpProvider?: GeoIpProvider,
): Promise<void> {
  const deviceType = parseDeviceType(info.userAgent);
  const deviceOs = parseOS(info.userAgent);
  const browser = parseBrowser(info.userAgent);
  const location = await getLocationFromIP(info.ipAddress, geoIpProvider);

  await db.qrScanEvent.create({
    data: {
      qrId,
      shortCode: info.shortCode,
      scanMethod: info.scanMethod ?? 'QR_SCAN',
      deviceType: deviceType.toUpperCase() as 'MOBILE' | 'DESKTOP' | 'TABLET',
      deviceOs,
      browser,
      userAgent: info.userAgent,
      ipAddress: info.ipAddress,
      locationCity: location.city,
      locationCountry: location.country,
      locationLatitude: location.latitude,
      locationLongitude: location.longitude,
      targetUrlAtScan,
    },
  });

  await db.qrCode.update({
    where: { id: qrId },
    data: {
      totalScanCount: { increment: 1 },
      lastScannedAt: new Date(),
      lastScannedLocation: location.city,
      lastScannedByDevice: deviceType.toUpperCase() as 'MOBILE' | 'DESKTOP' | 'TABLET',
    },
  });
}
