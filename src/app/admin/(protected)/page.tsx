'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/admin/Button';
import { Card } from '@/components/admin/Card';
import { QrImage } from '@/components/admin/QrImage';
import { TextField } from '@/components/admin/TextField';
import { adminFetch, downloadAdminFile, UnauthorizedError } from '@/lib/adminClient';
import { validateCreateForm } from '@/lib/qr/createFormValidation';

interface QrCodeRow {
  id: string;
  qrName: string;
  shortCode: string;
  targetUrl: string;
  productType: string | null;
  displayName: string | null;
  tags: string[];
  batchId: string | null;
  batchName: string | null;
  totalScanCount: number;
  lastScannedAt: string | null;
  createdAt: string;
}

type SortColumn = 'createdAt' | 'totalScanCount';

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? 'border-accent bg-accent text-accent-foreground'
          : 'border-border text-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function SortIcon({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  return (
    <span
      className={`ml-1 inline-flex flex-col text-[8px] leading-[7px] ${active ? 'text-accent' : 'text-muted/50'}`}
    >
      <span className={active && direction === 'asc' ? 'text-accent' : ''}>▲</span>
      <span className={active && direction === 'desc' ? 'text-accent' : ''}>▼</span>
    </span>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [qrCodes, setQrCodes] = useState<QrCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchFilter, setBatchFilter] = useState<string>('all');

  const [baseName, setBaseName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [targetUrl, setTargetUrl] = useState('');
  const [productType, setProductType] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdNames, setCreatedNames] = useState<string[] | null>(null);

  const [contentType, setContentType] = useState<'URL' | 'TEXT' | 'VCARD' | 'WIFI'>('URL');
  const [contentText, setContentText] = useState('');
  const [vcardName, setVcardName] = useState('');
  const [vcardPhone, setVcardPhone] = useState('');
  const [vcardEmail, setVcardEmail] = useState('');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiSecurity, setWifiSecurity] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');

  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [batchDownloadError, setBatchDownloadError] = useState<string | null>(null);
  const [batchDownloading, setBatchDownloading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday'>('all');
  const [scanFilter, setScanFilter] = useState<'all' | 'none' | '1-100'>('all');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const loadQrCodes = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/qr');
      const body = await response.json();
      setQrCodes(body.qrCodes ?? []);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        router.replace('/admin/login');
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // loadQrCodes only calls setState after its internal awaits resolve — this
    // is the standard fetch-on-mount pattern, not a synchronous setState. The
    // rule can't see across the async boundary of an extracted callback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadQrCodes();
  }, [loadQrCodes]);

  const batches = useMemo(
    () => [...new Set(qrCodes.map((q) => q.batchId).filter((b): b is string => Boolean(b)))],
    [qrCodes],
  );
  const allTags = useMemo(() => [...new Set(qrCodes.flatMap((q) => q.tags))].sort(), [qrCodes]);
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [sortColumn, setSortColumn] = useState<SortColumn>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  }

  const visibleQrCodes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const todayStart = startOfDay(now);
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);

    const filtered = qrCodes
      .filter((q) => batchFilter === 'all' || q.batchId === batchFilter)
      .filter((q) => tagFilter === 'all' || q.tags.includes(tagFilter))
      .filter(
        (q) =>
          !query ||
          q.qrName.toLowerCase().includes(query) ||
          (q.displayName ?? '').toLowerCase().includes(query) ||
          q.targetUrl.toLowerCase().includes(query),
      )
      .filter((q) => {
        if (dateFilter === 'all') return true;
        const created = new Date(q.createdAt);
        if (dateFilter === 'today') return created >= todayStart;
        return created >= yesterdayStart && created < todayStart;
      })
      .filter((q) => {
        if (scanFilter === 'all') return true;
        if (scanFilter === 'none') return q.totalScanCount === 0;
        return q.totalScanCount >= 1 && q.totalScanCount <= 100;
      });

    const sorted = [...filtered].sort((a, b) => {
      const aValue =
        sortColumn === 'createdAt' ? new Date(a.createdAt).getTime() : a.totalScanCount;
      const bValue =
        sortColumn === 'createdAt' ? new Date(b.createdAt).getTime() : b.totalScanCount;
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });

    return sorted;
  }, [
    qrCodes,
    batchFilter,
    tagFilter,
    searchQuery,
    dateFilter,
    scanFilter,
    sortColumn,
    sortDirection,
  ]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setCreatedNames(null);

    if (contentType !== 'URL') {
      await handleCreateContentQr();
      return;
    }

    const validationError = validateCreateForm({ baseName, quantity, targetUrl });
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    setCreating(true);
    try {
      const response = await adminFetch('/api/admin/qr/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baseName: baseName.trim(),
          quantity: Number(quantity),
          targetUrl: targetUrl.trim(),
          ...(productType ? { productType } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setCreateError(body.error ?? 'Failed to create QR code(s)');
        return;
      }
      setCreatedNames(body.qrs.map((q: { qrName: string }) => q.qrName));
      setBaseName('');
      setQuantity('1');
      setTargetUrl('');
      setProductType('');
      await loadQrCodes();
    } catch (error) {
      if (error instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateContentQr() {
    if (!baseName.trim()) {
      setCreateError('Name is required');
      return;
    }

    const payload =
      contentType === 'TEXT'
        ? { text: contentText.trim() }
        : contentType === 'VCARD'
          ? {
              name: vcardName.trim(),
              phone: vcardPhone.trim() || undefined,
              email: vcardEmail.trim() || undefined,
            }
          : {
              ssid: wifiSsid.trim(),
              password: wifiPassword.trim() || undefined,
              security: wifiSecurity,
            };

    setCreating(true);
    try {
      const response = await adminFetch('/api/admin/qr/content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          qrName: baseName.trim(),
          contentType,
          payload,
          ...(productType ? { productType } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setCreateError(body.error ?? 'Failed to create QR code');
        return;
      }
      setCreatedNames([body.qr.qrName]);
      setBaseName('');
      setContentText('');
      setVcardName('');
      setVcardPhone('');
      setVcardEmail('');
      setWifiSsid('');
      setWifiPassword('');
      setProductType('');
      await loadQrCodes();
    } catch (error) {
      if (error instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setCreating(false);
    }
  }

  async function handleCsvImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCsvError(null);
    const file = csvInputRef.current?.files?.[0];
    if (!file) {
      setCsvError('Choose a CSV file first');
      return;
    }

    setCsvImporting(true);
    try {
      const csvText = await file.text();
      const response = await adminFetch('/api/admin/qr/batch/import-csv', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: csvText,
      });
      const body = await response.json();
      if (!response.ok) {
        setCsvError(body.error ?? 'Import failed');
        return;
      }
      if (csvInputRef.current) csvInputRef.current.value = '';
      await loadQrCodes();
    } catch (error) {
      if (error instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setCsvImporting(false);
    }
  }

  async function handleBatchDownload() {
    setBatchDownloadError(null);
    setBatchDownloading(true);
    try {
      await downloadAdminFile(`/api/admin/qr/batch/${batchFilter}/download`, `${batchFilter}.zip`);
    } catch (error) {
      setBatchDownloadError(error instanceof Error ? error.message : 'Download failed');
    } finally {
      setBatchDownloading(false);
    }
  }

  function toggleSelectRow(qrName: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(qrName)) next.delete(qrName);
      else next.add(qrName);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const allSelected = visibleQrCodes.every((q) => prev.has(q.qrName));
      if (allSelected) return new Set();
      return new Set(visibleQrCodes.map((q) => q.qrName));
    });
  }

  async function handleBulkDelete() {
    const names = [...selectedIds];
    if (names.length === 0) return;
    if (
      !window.confirm(
        `Delete ${names.length} QR code${names.length > 1 ? 's' : ''}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBulkError(null);
    setBulkDeleting(true);
    try {
      const response = await adminFetch('/api/admin/qr', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ qrNames: names }),
      });
      const body = await response.json();
      if (!response.ok) {
        setBulkError(body.error ?? 'Failed to delete selected QR codes');
        return;
      }
      setSelectedIds(new Set());
      await loadQrCodes();
    } catch (error) {
      if (error instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleBulkDownload() {
    const names = [...selectedIds];
    if (names.length === 0) return;
    setBulkError(null);
    setBulkDownloading(true);
    try {
      await downloadAdminFile('/api/admin/qr/download', 'qr-codes.zip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ qrNames: names }),
      });
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : 'Download failed');
    } finally {
      setBulkDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-foreground text-2xl font-semibold">QR Codes</h1>
        <p className="text-muted mt-1 text-sm">
          Create, retarget, and track every QR code and NFC tap.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <h2 className="text-foreground mb-4 text-lg font-medium">New QR code</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-4" noValidate>
            <TextField
              label="Name"
              name="baseName"
              placeholder="order-12345"
              value={baseName}
              onChange={(e) => setBaseName(e.target.value)}
              required
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-foreground text-sm font-medium">Content type</span>
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value as typeof contentType)}
                className="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm"
              >
                <option value="URL">URL (redirect, with scan analytics)</option>
                <option value="TEXT">Text</option>
                <option value="VCARD">vCard (contact card)</option>
                <option value="WIFI">Wi-Fi network</option>
              </select>
            </label>

            {contentType === 'URL' && (
              <>
                <TextField
                  label="Quantity"
                  name="quantity"
                  type="number"
                  min={1}
                  max={100}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <TextField
                  label="Target URL"
                  name="targetUrl"
                  type="url"
                  placeholder="https://your-business.com"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  required
                />
              </>
            )}

            {contentType === 'TEXT' && (
              <TextField
                label="Text"
                name="contentText"
                placeholder="Any text to encode"
                value={contentText}
                onChange={(e) => setContentText(e.target.value)}
                required
              />
            )}

            {contentType === 'VCARD' && (
              <>
                <TextField
                  label="Name"
                  name="vcardName"
                  value={vcardName}
                  onChange={(e) => setVcardName(e.target.value)}
                  required
                />
                <TextField
                  label="Phone"
                  name="vcardPhone"
                  value={vcardPhone}
                  onChange={(e) => setVcardPhone(e.target.value)}
                />
                <TextField
                  label="Email"
                  name="vcardEmail"
                  type="email"
                  value={vcardEmail}
                  onChange={(e) => setVcardEmail(e.target.value)}
                />
              </>
            )}

            {contentType === 'WIFI' && (
              <>
                <TextField
                  label="Network name (SSID)"
                  name="wifiSsid"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  required
                />
                <label className="flex flex-col gap-1.5">
                  <span className="text-foreground text-sm font-medium">Security</span>
                  <select
                    value={wifiSecurity}
                    onChange={(e) => setWifiSecurity(e.target.value as typeof wifiSecurity)}
                    className="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="WPA">WPA/WPA2/WPA3</option>
                    <option value="WEP">WEP</option>
                    <option value="nopass">Open (no password)</option>
                  </select>
                </label>
                {wifiSecurity !== 'nopass' && (
                  <TextField
                    label="Password"
                    name="wifiPassword"
                    type="password"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                  />
                )}
              </>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-foreground text-sm font-medium">Product type</span>
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                className="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm"
              >
                <option value="">None (generic size)</option>
                <option value="CARD">Card (30mm QR on an 89x51mm card)</option>
                <option value="COIN">Coin (28mm QR on a 40mm coin)</option>
                <option value="STAND">Stand (80mm QR on a 102x152mm tent card)</option>
              </select>
            </label>
            {createError && (
              <p role="alert" className="text-danger text-sm">
                {createError}
              </p>
            )}
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </form>

          {createdNames && (
            <div className="border-border mt-6 border-t pt-6">
              <p className="text-foreground mb-3 text-sm font-medium">
                Created {createdNames.length} QR code{createdNames.length > 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-3">
                {createdNames.map((name) => (
                  <QrImage key={name} qrName={name} size={96} />
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-foreground mb-4 text-lg font-medium">Bulk import (CSV)</h2>
          <p className="text-muted mb-4 text-sm">
            Columns:{' '}
            <code className="text-foreground">name, target_url, quantity, product_type</code>. Only{' '}
            <code className="text-foreground">name</code> and{' '}
            <code className="text-foreground">target_url</code> are required.
          </p>
          <form onSubmit={handleCsvImport} className="flex flex-col gap-4" noValidate>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm"
            />
            {csvError && (
              <p role="alert" className="text-danger text-sm">
                {csvError}
              </p>
            )}
            <Button type="submit" variant="secondary" disabled={csvImporting}>
              {csvImporting ? 'Importing…' : 'Import CSV'}
            </Button>
          </form>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-foreground text-lg font-medium">All QR codes</h2>
          <div className="flex items-center gap-3">
            {batchFilter !== 'all' && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleBatchDownload}
                disabled={batchDownloading}
              >
                {batchDownloading ? 'Zipping…' : 'Download batch (.zip)'}
              </Button>
            )}
            {batches.length > 0 && (
              <select
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="border-border bg-background text-foreground rounded-md border px-3 py-1.5 text-sm"
              >
                <option value="all">All batches</option>
                {batches.map((batchId) => (
                  <option key={batchId} value={batchId}>
                    {batchId}
                  </option>
                ))}
              </select>
            )}
            {allTags.length > 0 && (
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="border-border bg-background text-foreground rounded-md border px-3 py-1.5 text-sm"
              >
                <option value="all">All tags</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        {batchDownloadError && (
          <p role="alert" className="text-danger mb-4 text-sm">
            {batchDownloadError}
          </p>
        )}

        <input
          type="search"
          placeholder={`Search ${qrCodes.length} QR code${qrCodes.length === 1 ? '' : 's'}`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border-border bg-background text-foreground focus:border-accent mb-3 w-full rounded-md border px-3 py-2 text-sm outline-none"
        />

        <div className="mb-4 flex flex-wrap gap-2">
          <FilterChip active={dateFilter === 'all'} onClick={() => setDateFilter('all')}>
            All Dates
          </FilterChip>
          <FilterChip active={dateFilter === 'today'} onClick={() => setDateFilter('today')}>
            Today
          </FilterChip>
          <FilterChip
            active={dateFilter === 'yesterday'}
            onClick={() => setDateFilter('yesterday')}
          >
            Yesterday
          </FilterChip>
          <FilterChip active={scanFilter === 'all'} onClick={() => setScanFilter('all')}>
            All Scans
          </FilterChip>
          <FilterChip active={scanFilter === '1-100'} onClick={() => setScanFilter('1-100')}>
            1~100
          </FilterChip>
          <FilterChip active={scanFilter === 'none'} onClick={() => setScanFilter('none')}>
            No scan yet
          </FilterChip>
        </div>

        {selectedIds.size > 0 && (
          <div className="border-accent/40 bg-accent/10 mb-4 flex flex-wrap items-center gap-3 rounded-md border px-4 py-2">
            <span className="text-foreground text-sm font-medium">{selectedIds.size} selected</span>
            <Button
              type="button"
              variant="secondary"
              onClick={handleBulkDownload}
              disabled={bulkDownloading}
            >
              {bulkDownloading ? 'Zipping…' : 'Download selected'}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? 'Deleting…' : 'Delete selected'}
            </Button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-muted hover:text-foreground ml-auto text-sm"
            >
              Clear selection
            </button>
          </div>
        )}
        {bulkError && (
          <p role="alert" className="text-danger mb-4 text-sm">
            {bulkError}
          </p>
        )}

        {loading ? (
          <p className="text-muted text-sm">Loading…</p>
        ) : visibleQrCodes.length === 0 ? (
          <p className="text-muted text-sm">No QR codes yet — create one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-border text-muted border-b">
                  <th className="w-8 py-2 pr-2">
                    <input
                      type="checkbox"
                      aria-label="Select all visible"
                      checked={
                        visibleQrCodes.length > 0 &&
                        visibleQrCodes.every((q) => selectedIds.has(q.qrName))
                      }
                      onChange={toggleSelectAllVisible}
                    />
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('createdAt')}
                      className="hover:text-foreground inline-flex items-center"
                    >
                      Date
                      <SortIcon active={sortColumn === 'createdAt'} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="py-2 pr-4 font-medium">Destination</th>
                  <th className="py-2 pr-4 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('totalScanCount')}
                      className="hover:text-foreground inline-flex items-center"
                    >
                      Scans
                      <SortIcon
                        active={sortColumn === 'totalScanCount'}
                        direction={sortDirection}
                      />
                    </button>
                  </th>
                  <th className="py-2 pr-4 font-medium">Last scanned</th>
                </tr>
              </thead>
              <tbody>
                {visibleQrCodes.map((qr) => (
                  <tr key={qr.id} className="border-border border-b last:border-0">
                    <td className="py-3 pr-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${qr.qrName}`}
                        checked={selectedIds.has(qr.qrName)}
                        onChange={() => toggleSelectRow(qr.qrName)}
                      />
                    </td>
                    <td className="text-muted py-3 pr-4">
                      {new Date(qr.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/qr/${qr.qrName}`}
                        className="text-accent font-medium hover:underline"
                      >
                        {qr.displayName || qr.qrName}
                      </Link>
                      {qr.displayName && <p className="text-muted text-xs">{qr.qrName}</p>}
                      <p className="text-muted max-w-xs truncate text-xs">{qr.targetUrl}</p>
                      {qr.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {qr.tags.map((tag) => (
                            <span
                              key={tag}
                              className="border-border text-muted rounded-full border px-2 py-0.5 text-[11px]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4">{qr.totalScanCount}</td>
                    <td className="text-muted py-3 pr-4">
                      {qr.lastScannedAt ? new Date(qr.lastScannedAt).toLocaleString() : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
