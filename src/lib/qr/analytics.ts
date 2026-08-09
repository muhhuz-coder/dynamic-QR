import type { PrismaClient, QrScanEvent } from '@/generated/prisma/client';

import { QrNotFoundError } from './errors';

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all';

export function calculateDateRange(
  period: AnalyticsPeriod,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const days = { '7d': 7, '30d': 30, '90d': 90 } as const;

  if (period === 'all') {
    return { start: new Date(0), end: now };
  }

  const start = new Date(now.getTime() - days[period] * 24 * 60 * 60 * 1000);
  return { start, end: now };
}

function groupCountBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

export interface QrAnalytics {
  totalScans: number;
  lastScanned: Date | null;
  byMethod: { nfc: number; qr: number };
  byDevice: { mobile: number; desktop: number; tablet: number };
  byLocation: Record<string, number>;
  hourlyDistribution: Record<string, number> | null;
  dailyTrend: { date: string; scans: number }[];
  recentScans: QrScanEvent[];
}

/**
 * Mirrors getQRAnalytics() from docs/core-logic/02-qr-management.md.
 * hourlyDistribution is only computed for the 7d/30d windows, matching the
 * original spec (it's not meaningful summarized over 90d/all).
 */
export async function getQrAnalytics(
  db: PrismaClient,
  qrName: string,
  period: AnalyticsPeriod,
): Promise<QrAnalytics> {
  const qrCode = await db.qrCode.findUnique({ where: { qrName } });
  if (!qrCode) {
    throw new QrNotFoundError(qrName);
  }

  const { start, end } = calculateDateRange(period);
  const scanEvents = await db.qrScanEvent.findMany({
    where: { qrId: qrCode.id, scanTimestamp: { gte: start, lte: end } },
    orderBy: { scanTimestamp: 'desc' },
  });

  const byMethodCounts = groupCountBy(scanEvents, (e) => e.scanMethod ?? 'UNKNOWN');
  const byDeviceCounts = groupCountBy(scanEvents, (e) => e.deviceType ?? 'UNKNOWN');

  return {
    totalScans: scanEvents.length,
    lastScanned: scanEvents[0]?.scanTimestamp ?? null,
    byMethod: { nfc: byMethodCounts.NFC_TAP ?? 0, qr: byMethodCounts.QR_SCAN ?? 0 },
    byDevice: {
      mobile: byDeviceCounts.MOBILE ?? 0,
      desktop: byDeviceCounts.DESKTOP ?? 0,
      tablet: byDeviceCounts.TABLET ?? 0,
    },
    byLocation: groupCountBy(scanEvents, (e) => e.locationCity ?? 'Unknown'),
    hourlyDistribution:
      period === '7d' || period === '30d'
        ? groupCountBy(scanEvents, (e) => String(e.scanTimestamp.getHours()))
        : null,
    dailyTrend: Object.entries(
      groupCountBy(scanEvents, (e) => e.scanTimestamp.toISOString().split('T')[0]),
    ).map(([date, scans]) => ({ date, scans })),
    recentScans: scanEvents.slice(0, 20),
  };
}
