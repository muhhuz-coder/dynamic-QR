'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  BreakdownBarChart,
  LocationRankedList,
  ScanTrendChart,
} from '@/components/admin/AnalyticsCharts';
import { Button } from '@/components/admin/Button';
import { Card } from '@/components/admin/Card';
import { QrImage } from '@/components/admin/QrImage';
import { TextField } from '@/components/admin/TextField';
import { adminFetch, downloadAdminFile, UnauthorizedError } from '@/lib/adminClient';
import { resolveQrSizeMm } from '@/lib/qr/printSizes';

interface AuditLogEntry {
  id: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  timestamp: string;
}

interface QrDetail {
  qrName: string;
  shortCode: string;
  targetUrl: string;
  productType: 'STAND' | 'COIN' | 'CARD' | null;
  displayName: string | null;
  tags: string[];
  expiresAt: string | null;
  utmEnabled: boolean;
  designOptions: { fgColor?: string; bgColor?: string; logoUrl?: string } | null;
  totalScanCount: number;
  lastScannedAt: string | null;
  auditLogs: AuditLogEntry[];
}

interface Analytics {
  totalScans: number;
  byMethod: { nfc: number; qr: number };
  byDevice: { mobile: number; desktop: number; tablet: number };
  byLocation: Record<string, number>;
  dailyTrend: { date: string; scans: number }[];
}

export default function QrDetailPage({ params }: { params: Promise<{ qrName: string }> }) {
  const router = useRouter();
  const [qrName, setQrName] = useState<string | null>(null);
  const [detail, setDetail] = useState<QrDetail | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [newTargetUrl, setNewTargetUrl] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [customSizeMm, setCustomSizeMm] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [expiresAtInput, setExpiresAtInput] = useState('');
  const [utmEnabled, setUtmEnabled] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaSuccess, setMetaSuccess] = useState<string | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [logoUrl, setLogoUrl] = useState('');
  const [designError, setDesignError] = useState<string | null>(null);
  const [designSuccess, setDesignSuccess] = useState<string | null>(null);
  const [savingDesign, setSavingDesign] = useState(false);
  const [designKey, setDesignKey] = useState(0);

  const load = useCallback(
    async (name: string) => {
      try {
        const [detailRes, analyticsRes] = await Promise.all([
          adminFetch(`/api/admin/qr/${name}`),
          adminFetch(`/api/admin/qr/${name}/analytics`),
        ]);

        if (detailRes.status === 404) {
          setNotFound(true);
          return;
        }

        const detailBody = await detailRes.json();
        const analyticsBody = await analyticsRes.json();
        setDetail(detailBody.qrCode);
        setNewTargetUrl(detailBody.qrCode.targetUrl);
        setDisplayName(detailBody.qrCode.displayName ?? '');
        setTagsInput((detailBody.qrCode.tags ?? []).join(', '));
        setExpiresAtInput(
          detailBody.qrCode.expiresAt ? detailBody.qrCode.expiresAt.slice(0, 10) : '',
        );
        setUtmEnabled(detailBody.qrCode.utmEnabled);
        setFgColor(detailBody.qrCode.designOptions?.fgColor ?? '#000000');
        setBgColor(detailBody.qrCode.designOptions?.bgColor ?? '#ffffff');
        setLogoUrl(detailBody.qrCode.designOptions?.logoUrl ?? '');
        setAnalytics(analyticsBody.analytics);
      } catch (error) {
        if (error instanceof UnauthorizedError) router.replace('/admin/login');
      }
    },
    [router],
  );

  useEffect(() => {
    params.then(({ qrName: name }) => {
      setQrName(name);
      load(name);
    });
  }, [params, load]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!qrName) return;
    setEditError(null);
    setEditSuccess(null);
    setSaving(true);

    try {
      const response = await adminFetch(`/api/admin/qr/${qrName}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newTargetUrl }),
      });
      const body = await response.json();
      if (!response.ok) {
        setEditError(body.error ?? 'Failed to update target');
        return;
      }
      setEditSuccess('Target URL updated');
      await load(qrName);
    } catch (error) {
      if (error instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMeta(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!qrName) return;
    setMetaError(null);
    setMetaSuccess(null);
    setSavingMeta(true);

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const expiresAt = expiresAtInput
        ? new Date(`${expiresAtInput}T00:00:00.000Z`).toISOString()
        : null;

      const response = await adminFetch(`/api/admin/qr/${qrName}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          tags,
          expiresAt,
          utmEnabled,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMetaError(body.error ?? 'Failed to update name/tags/expiration');
        return;
      }
      setMetaSuccess('Saved');
      await load(qrName);
    } catch (error) {
      if (error instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleSaveDesign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!qrName) return;
    setDesignError(null);
    setDesignSuccess(null);
    setSavingDesign(true);

    try {
      const response = await adminFetch(`/api/admin/qr/${qrName}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          designOptions: {
            fgColor,
            bgColor,
            ...(logoUrl.trim() ? { logoUrl: logoUrl.trim() } : {}),
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setDesignError(body.error ?? 'Failed to update design');
        return;
      }
      setDesignSuccess('Saved');
      setDesignKey((k) => k + 1);
      await load(qrName);
    } catch (error) {
      if (error instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setSavingDesign(false);
    }
  }

  async function handleResetDesign() {
    if (!qrName) return;
    setDesignError(null);
    setDesignSuccess(null);
    setSavingDesign(true);

    try {
      const response = await adminFetch(`/api/admin/qr/${qrName}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ designOptions: null }),
      });
      const body = await response.json();
      if (!response.ok) {
        setDesignError(body.error ?? 'Failed to reset design');
        return;
      }
      setFgColor('#000000');
      setBgColor('#ffffff');
      setLogoUrl('');
      setDesignSuccess('Reset to defaults');
      setDesignKey((k) => k + 1);
      await load(qrName);
    } catch (error) {
      if (error instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setSavingDesign(false);
    }
  }

  async function handleDelete() {
    if (!qrName) return;
    if (!window.confirm(`Delete ${qrName}? This cannot be undone.`)) return;
    setActionError(null);
    setDeleting(true);
    try {
      const response = await adminFetch(`/api/admin/qr/${qrName}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json();
        setActionError(body.error ?? 'Failed to delete');
        return;
      }
      router.push('/admin');
    } catch (error) {
      if (error instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setDeleting(false);
    }
  }

  async function handleDuplicate() {
    if (!qrName) return;
    setActionError(null);
    setDuplicating(true);
    try {
      const response = await adminFetch(`/api/admin/qr/${qrName}/duplicate`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) {
        setActionError(body.error ?? 'Failed to duplicate');
        return;
      }
      router.push(`/admin/qr/${body.qrCode.qrName}`);
    } catch (error) {
      if (error instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setDuplicating(false);
    }
  }

  async function handleExportScans() {
    if (!qrName) return;
    setExportError(null);
    try {
      await downloadAdminFile(`/api/admin/qr/${qrName}/scans/export`, `${qrName}-scans.csv`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed');
    }
  }

  async function handleDownload() {
    if (!qrName) return;
    setDownloadError(null);
    const sizeParam = customSizeMm.trim()
      ? `&sizeMm=${encodeURIComponent(customSizeMm.trim())}`
      : '';
    try {
      await downloadAdminFile(
        `/api/admin/qr/${qrName}/image?format=svg${sizeParam}`,
        `${qrName}.svg`,
      );
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Download failed');
    }
  }

  if (notFound) {
    return <p className="text-danger text-sm">QR code not found.</p>;
  }

  if (!detail || !qrName) {
    return <p className="text-muted text-sm">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-semibold">
            {detail.displayName || detail.qrName}
          </h1>
          <p className="text-muted mt-1 text-sm">
            {detail.displayName && <span className="text-foreground/70 mr-2">{detail.qrName}</span>}
            Short link code: {detail.shortCode}
          </p>
          {detail.expiresAt && (
            <p className="text-muted mt-1 text-xs">
              {new Date(detail.expiresAt) <= new Date() ? 'Expired' : 'Expires'} on{' '}
              {new Date(detail.expiresAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleDuplicate}
            disabled={duplicating}
          >
            {duplicating ? 'Duplicating…' : 'Duplicate'}
          </Button>
          <Button type="button" variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
      {actionError && (
        <p role="alert" className="text-danger text-sm">
          {actionError}
        </p>
      )}

      <div>
        {detail.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {detail.tags.map((tag) => (
              <span
                key={tag}
                className="border-border text-muted rounded-full border px-2.5 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_1fr]">
        <Card className="flex flex-col items-center gap-4">
          <QrImage key={designKey} qrName={detail.qrName} size={180} />

          <div className="w-full">
            <label className="flex flex-col gap-1.5">
              <span className="text-foreground text-sm font-medium">Print size (mm)</span>
              <input
                type="number"
                min={5}
                max={500}
                placeholder={String(resolveQrSizeMm(detail.productType))}
                value={customSizeMm}
                onChange={(e) => setCustomSizeMm(e.target.value)}
                className="border-border bg-background text-foreground focus:border-accent rounded-md border px-3 py-2 text-sm outline-none"
              />
            </label>
            <p className="text-muted mt-1 text-xs">
              {detail.productType
                ? `Default for ${detail.productType.toLowerCase()}: ${resolveQrSizeMm(detail.productType)}mm. Leave blank to use it, or set your own.`
                : `No product type set — defaults to ${resolveQrSizeMm(null)}mm. Leave blank to use it, or set your own.`}
            </p>
          </div>

          <Button type="button" variant="secondary" onClick={handleDownload} className="w-full">
            Download SVG
          </Button>
          {downloadError && (
            <p role="alert" className="text-danger text-sm">
              {downloadError}
            </p>
          )}
          <p className="text-muted text-center text-xs">
            Black on transparent background — print-ready for coins, stands, or cards.
          </p>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-foreground mb-4 text-lg font-medium">Redirect target</h2>
            <form onSubmit={handleSave} className="flex flex-col gap-4" noValidate>
              <TextField
                label="Target URL"
                name="newTargetUrl"
                type="url"
                value={newTargetUrl}
                onChange={(e) => setNewTargetUrl(e.target.value)}
                required
              />
              {editError && (
                <p role="alert" className="text-danger text-sm">
                  {editError}
                </p>
              )}
              {editSuccess && <p className="text-accent text-sm">{editSuccess}</p>}
              <Button type="submit" disabled={saving} className="self-start">
                {saving ? 'Saving…' : 'Save target'}
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="text-foreground mb-4 text-lg font-medium">Name &amp; tags</h2>
            <form onSubmit={handleSaveMeta} className="flex flex-col gap-4" noValidate>
              <TextField
                label="QR Code Name"
                name="displayName"
                placeholder={detail.qrName}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <TextField
                label="Tags"
                name="tags"
                placeholder="restaurant, counter"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
              <label className="flex flex-col gap-1.5">
                <span className="text-foreground text-sm font-medium">Expires on</span>
                <input
                  type="date"
                  value={expiresAtInput}
                  onChange={(e) => setExpiresAtInput(e.target.value)}
                  className="border-border bg-background text-foreground focus:border-accent rounded-md border px-3 py-2 text-sm outline-none"
                />
                <span className="text-muted text-xs">Leave blank to never expire.</span>
              </label>
              <label className="text-foreground flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={utmEnabled}
                  onChange={(e) => setUtmEnabled(e.target.checked)}
                />
                Enable UTM tracking (uses the site-wide defaults in Settings)
              </label>
              {metaError && (
                <p role="alert" className="text-danger text-sm">
                  {metaError}
                </p>
              )}
              {metaSuccess && <p className="text-accent text-sm">{metaSuccess}</p>}
              <Button
                type="submit"
                variant="secondary"
                disabled={savingMeta}
                className="self-start"
              >
                {savingMeta ? 'Saving…' : 'Save name & tags'}
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="text-foreground mb-4 text-lg font-medium">Customize design</h2>
            <form onSubmit={handleSaveDesign} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-wrap gap-6">
                <label className="flex flex-col gap-1.5">
                  <span className="text-foreground text-sm font-medium">Foreground color</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={fgColor}
                      onChange={(e) => setFgColor(e.target.value)}
                      className="border-border h-9 w-9 cursor-pointer rounded border"
                    />
                    <span className="text-muted text-sm">{fgColor}</span>
                  </div>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-foreground text-sm font-medium">Background color</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="border-border h-9 w-9 cursor-pointer rounded border"
                    />
                    <span className="text-muted text-sm">{bgColor}</span>
                  </div>
                </label>
              </div>
              <TextField
                label="Logo URL (optional)"
                name="logoUrl"
                type="url"
                placeholder="https://your-business.com/logo.png"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
              />
              <p className="text-muted text-xs">
                A logo is overlaid at the center; error correction is bumped automatically to keep
                the code scannable.
              </p>
              {designError && (
                <p role="alert" className="text-danger text-sm">
                  {designError}
                </p>
              )}
              {designSuccess && <p className="text-accent text-sm">{designSuccess}</p>}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={savingDesign}
                  className="self-start"
                >
                  {savingDesign ? 'Saving…' : 'Save design'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={savingDesign}
                  onClick={handleResetDesign}
                  className="self-start"
                >
                  Reset to default
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>

      {analytics && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-foreground text-lg font-medium">Analytics (last 30 days)</h2>
            <Button type="button" variant="secondary" onClick={handleExportScans}>
              Download scan data
            </Button>
          </div>
          {exportError && (
            <p role="alert" className="text-danger mb-4 text-sm">
              {exportError}
            </p>
          )}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Total scans" value={analytics.totalScans} />
            <Stat label="QR scans" value={analytics.byMethod.qr} />
            <Stat label="NFC taps" value={analytics.byMethod.nfc} />
            <Stat label="Mobile" value={analytics.byDevice.mobile} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-foreground mb-2 text-sm font-medium">Scans over time</h3>
              <ScanTrendChart dailyTrend={analytics.dailyTrend} />
            </div>
            <div>
              <h3 className="text-foreground mb-2 text-sm font-medium">By device</h3>
              <BreakdownBarChart
                counts={{
                  Mobile: analytics.byDevice.mobile,
                  Desktop: analytics.byDevice.desktop,
                  Tablet: analytics.byDevice.tablet,
                }}
              />
            </div>
            <div>
              <h3 className="text-foreground mb-2 text-sm font-medium">By method</h3>
              <BreakdownBarChart
                counts={{ 'QR scan': analytics.byMethod.qr, 'NFC tap': analytics.byMethod.nfc }}
              />
            </div>
            <div>
              <h3 className="text-foreground mb-2 text-sm font-medium">Top locations</h3>
              <LocationRankedList byLocation={analytics.byLocation} />
            </div>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="text-foreground mb-4 text-lg font-medium">History</h2>
        {detail.auditLogs.length === 0 ? (
          <p className="text-muted text-sm">No changes yet.</p>
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {detail.auditLogs.map((log) => (
              <li key={log.id} className="border-border border-b pb-3 last:border-0">
                <p className="text-foreground">
                  {log.oldValue} <span className="text-muted">&rarr;</span> {log.newValue}
                </p>
                <p className="text-muted">{new Date(log.timestamp).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border rounded-md border p-4">
      <p className="text-foreground text-2xl font-semibold">{value}</p>
      <p className="text-muted text-sm">{label}</p>
    </div>
  );
}
