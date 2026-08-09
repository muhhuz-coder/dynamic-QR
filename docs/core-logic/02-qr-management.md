# QR Management System

> Part of the [TAP & REVIEW Core Logic Requirements](README.md) set. Assumes the stack/architecture in [01-system-overview.md](01-system-overview.md). Tables referenced here (`qr_codes`, `qr_scan_events`) are defined in [05-database-schema.md](05-database-schema.md). Endpoint summary in [06-api-specifications.md](06-api-specifications.md). Edge cases in [09-error-handling-edge-cases.md](09-error-handling-edge-cases.md).

## 1. Core Concepts

### What is a QR Code in This System?

A QR code is a **dynamic redirect pointer** that:

- Has a **static QR image** (printed/hardcoded to NFC)
- Contains a **short code** (e.g., `tap.pk/order-12345`)
- Points to a **dynamic target URL** (changeable anytime)
- Tracks **analytics** (scans, location, device, time)

```
┌─────────────────────────────────────────────────┐
│ Physical Stand with QR Printed                  │
│                                                 │
│  QR Image encodes: tap.pk/order-12345          │
│  (STATIC - never changes after printing)       │
│                                                 │
│  NFC Chip hardcodes: tap.pk/order-12345        │
│  (STATIC - never changes after programming)   │
└──────────────────┬──────────────────────────────┘
                   │
                   │ When scanned
                   │
                   ▼
        ┌──────────────────────┐
        │ System checks DB:    │
        │ short_code =         │
        │ "order-12345"        │
        │ target_url = ?       │
        └──────────────┬───────┘
                       │
                       │ Looks up current target
                       │
                       ▼
        ┌─────────────────────────────┐
        │ Current target in database: │
        │ www.pizzahub.com            │
        │ (DYNAMIC - can change)      │
        └──────────────┬──────────────┘
                       │
                       │ Redirect
                       │
                       ▼
        Customer sees: www.pizzahub.com
```

## 2. QR Generation Logic

### Batch Create QR Codes

**Input Processing:**

```javascript
// When admin uploads CSV or uses bulk form
const processBatchQRs = (input) => {
  // 1. Validate input
  const validated = validateQRInput(input);

  // 2. Check for duplicates
  const duplicates = await checkDuplicateQRNames(validated);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate QR names found: ${duplicates}`);
  }

  // 3. Generate short codes
  const qrsWithShortCodes = validated.map((qr) => ({
    ...qr,
    shortCode: generateUniqueShortCode(), // e.g., "order-12345"
    // Full redirect URL will be: tap.pk/order-12345
  }));

  // 4. Create QR images
  const qrsWithImages = await Promise.all(
    qrsWithShortCodes.map(async (qr) => ({
      ...qr,
      qrImageUrl: await generateQRImage(qr.shortCode),
      // Generates PNG/SVG of QR code
    }))
  );

  // 5. Batch insert to database
  const created = await db.qrCodes.createMany({
    data: qrsWithImages,
    skipDuplicates: false, // Fail if duplicates exist
  });

  // 6. Return batch info
  return {
    batchId: generateBatchId(),
    totalCreated: created.count,
    qrs: created,
    downloadUrls: {
      png: generatePNGZip(created),
      svg: generateSVGZip(created),
      pdf: generatePrintablePDF(created),
    },
  };
};
```

**Key Logic Points:**

- **Short code generation:** Must be unique, URL-safe, memorable

  ```javascript
  const generateUniqueShortCode = async () => {
    let shortCode;
    let exists = true;

    while (exists) {
      // Generate 8-character alphanumeric code
      shortCode = Math.random().toString(36).substring(2, 10).toUpperCase();

      // Check if already exists
      exists = await db.qrCodes.findUnique({
        where: { shortCode },
      });
    }

    return shortCode;
  };
  ```

- **Naming with sequences:** When quantity > 1 (full rules in [08-business-logic-algorithms.md](08-business-logic-algorithms.md))

  ```javascript
  const generateQRNames = (baseName, quantity) => {
    // If quantity = 1: just baseName
    // If quantity = 2: baseName, baseName-02
    // If quantity = 10: baseName, baseName-02 to baseName-10

    if (quantity === 1) {
      return [baseName];
    }

    const names = [baseName]; // First one is base name

    for (let i = 2; i <= quantity; i++) {
      const padded = String(i).padStart(2, '0');
      names.push(`${baseName}-${padded}`);
    }

    return names;
  };
  ```

- **Batch tracking:** Store batch metadata
  ```javascript
  const batchId = `batch-qr-${Date.now()}-${Math.random()}`;
  // All QRs created in this batch get same batchId
  // Allows admin to view/manage batch as unit
  ```

## 3. QR Scan Handler

**When customer scans QR or taps NFC:**

```javascript
// API Endpoint: GET /qr/:shortCode
export const handleQRScan = async (req, res) => {
  const { shortCode } = req.params;

  try {
    // 1. Find QR in database
    const qrCode = await db.qrCodes.findUnique({
      where: { shortCode },
    });

    if (!qrCode) {
      // QR doesn't exist
      return res.status(404).json({ error: 'QR code not found' });
    }

    // 2. Extract device/location info from request
    const scanInfo = {
      deviceType: parseDeviceType(req.headers['user-agent']),
      deviceOS: parseOS(req.headers['user-agent']),
      browser: parseBrowser(req.headers['user-agent']),
      ipAddress: getClientIP(req),
      timestamp: new Date(),
    };

    // 3. Get geolocation from IP (using GeoIP service)
    const location = await getLocationFromIP(scanInfo.ipAddress);

    // 4. Update QR analytics in database
    await db.qrScanEvents.create({
      data: {
        qrId: qrCode.id,
        shortCode,
        ...scanInfo,
        ...location,
        targetUrlAtScan: qrCode.targetUrl, // Store what it redirected to
      },
    });

    // 5. Update QR code summary (last scan info)
    await db.qrCodes.update({
      where: { id: qrCode.id },
      data: {
        totalScanCount: { increment: 1 },
        lastScannedAt: new Date(),
        lastScannedLocation: location.city,
        lastScannedByDevice: scanInfo.deviceType,
      },
    });

    // 6. Redirect to target URL
    return res.redirect(302, qrCode.targetUrl);
  } catch (error) {
    console.error('QR scan error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
```

**Helper Functions:**

```javascript
// Parse device type from user agent
const parseDeviceType = (userAgent) => {
  if (/mobile|android|iphone|ipod/i.test(userAgent)) return 'mobile';
  if (/ipad|tablet/i.test(userAgent)) return 'tablet';
  return 'desktop';
};

// Parse OS from user agent
const parseOS = (userAgent) => {
  if (/ios|iphone/i.test(userAgent)) return 'iOS';
  if (/android/i.test(userAgent)) return 'Android';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/macintosh|macos/i.test(userAgent)) return 'macOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Unknown';
};

// Parse browser from user agent
const parseBrowser = (userAgent) => {
  if (/chrome/i.test(userAgent)) return 'Chrome';
  if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) return 'Safari';
  if (/firefox/i.test(userAgent)) return 'Firefox';
  if (/edge/i.test(userAgent)) return 'Edge';
  return 'Unknown';
};

// Get geolocation from IP (using MaxMind GeoIP2 or similar)
const getLocationFromIP = async (ipAddress) => {
  try {
    const response = await geoipService.lookup(ipAddress);
    return {
      country: response.country,
      city: response.city,
      latitude: response.latitude,
      longitude: response.longitude,
      timezone: response.timezone,
    };
  } catch (error) {
    return {
      country: 'Unknown',
      city: 'Unknown',
      latitude: null,
      longitude: null,
      timezone: null,
    };
  }
};
```

## 4. QR Update Logic

**Admin can change target URL anytime:**

```javascript
// API Endpoint: PUT /admin/qr/:qrName/update-target
export const updateQRTarget = async (req, res) => {
  const { qrName } = req.params;
  const { newTargetUrl } = req.body;

  try {
    // 1. Validate auth (admin only) — see 07-authentication-security.md
    const admin = await verifyAdminAuth(req);
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });

    // 2. Validate URL format
    if (!isValidURL(newTargetUrl)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // 3. Find QR by name
    const qrCode = await db.qrCodes.findUnique({
      where: { qrName },
    });

    if (!qrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    // 4. Update target URL
    const updated = await db.qrCodes.update({
      where: { id: qrCode.id },
      data: {
        targetUrl: newTargetUrl,
        targetUrlUpdatedAt: new Date(),
      },
    });

    // 5. Log this change (for audit trail)
    await db.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'UPDATE_QR_TARGET',
        resourceType: 'QR_CODE',
        resourceId: qrCode.id,
        oldValue: qrCode.targetUrl,
        newValue: newTargetUrl,
        timestamp: new Date(),
      },
    });

    // 6. Return success
    return res.json({
      success: true,
      qrName,
      oldTarget: qrCode.targetUrl,
      newTarget: newTargetUrl,
      message: 'Target URL updated successfully',
    });
  } catch (error) {
    console.error('Update QR target error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// URL validation
const isValidURL = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};
```

## 5. QR Analytics Query Logic

**Fetch analytics for a specific QR:**

```javascript
// API Endpoint: GET /admin/qr/:qrName/analytics
export const getQRAnalytics = async (req, res) => {
  const { qrName } = req.params;
  const { period = '30d' } = req.query; // 7d, 30d, 90d, all

  try {
    // 1. Find QR
    const qrCode = await db.qrCodes.findUnique({
      where: { qrName },
    });

    if (!qrCode) {
      return res.status(404).json({ error: 'QR not found' });
    }

    // 2. Calculate date range
    const dateRange = calculateDateRange(period);

    // 3. Get scan events within date range
    const scanEvents = await db.qrScanEvents.findMany({
      where: {
        qrId: qrCode.id,
        scanTimestamp: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      orderBy: { scanTimestamp: 'desc' },
    });

    // 4. Calculate analytics
    const analytics = {
      totalScans: scanEvents.length,
      lastScanned: scanEvents[0]?.scanTimestamp || null,

      // By method
      byMethod: {
        nfc: scanEvents.filter((e) => e.scanMethod === 'nfc_tap').length,
        qr: scanEvents.filter((e) => e.scanMethod === 'qr_scan').length,
      },

      // By device
      byDevice: {
        mobile: scanEvents.filter((e) => e.deviceType === 'mobile').length,
        desktop: scanEvents.filter((e) => e.deviceType === 'desktop').length,
        tablet: scanEvents.filter((e) => e.deviceType === 'tablet').length,
      },

      // By location
      byLocation: groupBy(scanEvents, 'location.city'),

      // Hourly distribution (last 24h only)
      hourlyDistribution:
        period === '7d' || period === '30d' ? calculateHourlyDistribution(scanEvents) : null,

      // Daily trend
      dailyTrend: calculateDailyTrend(scanEvents),

      // Recent scans (last 20)
      recentScans: scanEvents.slice(0, 20),
    };

    return res.json({
      qrName,
      period,
      analytics,
    });
  } catch (error) {
    console.error('Get QR analytics error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper: Calculate date range based on period
const calculateDateRange = (period) => {
  const now = new Date();
  let start;

  switch (period) {
    case '7d':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'all':
      start = new Date('2000-01-01'); // Arbitrary old date
      break;
    default:
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return { start, end: now };
};

// Helper: Group by location and count
const groupBy = (array, property) => {
  return array.reduce((acc, obj) => {
    const key = getNestedProperty(obj, property);
    if (!acc[key]) acc[key] = 0;
    acc[key]++;
    return acc;
  }, {});
};

// Helper: Daily trend
const calculateDailyTrend = (scanEvents) => {
  const grouped = {};

  scanEvents.forEach((event) => {
    const date = event.scanTimestamp.toISOString().split('T')[0];
    if (!grouped[date]) grouped[date] = 0;
    grouped[date]++;
  });

  return Object.entries(grouped).map(([date, count]) => ({
    date,
    scans: count,
  }));
};
```

## 6. Implementation Notes (as-built, v1)

The QR Management System has been implemented (Next.js + Prisma + Postgres, `src/lib/qr/*` and `src/app/api/admin/qr/**`, 120 automated tests). It follows this spec with the following deliberate deviations, per [docs/GUARDRAILS.md](../GUARDRAILS.md):

- **URL validation is an allow-list, not just `new URL()`.** `isValidRedirectUrl()` (`src/lib/qr/validation.ts`) only accepts `http:`/`https:` targets — the original `isValidURL()` sketch would have accepted `javascript:`/`data:`/`file:` URIs, a stored open-redirect/XSS gap. Enforced on both create and update.
- **Short code generation is bounded**, not an unbounded `while(exists)` loop — `generateUniqueShortCode()` gives up after 10 attempts and throws, rather than risking an infinite loop against the DB.
- **Rate limiting is actually implemented**, not just documented as an edge case: an in-memory token-bucket (`src/lib/rateLimiter.ts`) guards the public scan endpoint (30/10s per IP) and the admin login endpoint (5/min per IP). Documented as needing to move to Redis/Cloudflare once there's more than one server instance.
- **No object storage is wired up for QR images.** Rather than pre-generating and uploading PNG/SVG/PDF to Cloudinary/S3 at creation time, images are rendered on demand from the short code via `GET /api/admin/qr/:qrName/image` (`?format=svg` for SVG). `qr_codes.qr_image_url` stays unused for now.
- **NFC vs. QR-scan analytics** use a `?via=nfc` query param on the scan URL (physical NFC tags encode this) rather than a separate mechanism — anything else, including no param, is treated as `QR_SCAN`.
- **Two tables exist beyond this doc's original schema**: `admins` and `audit_log` — both referenced by the original spec's code sketches (`adminAuthMiddleware`, `updateQRTarget`'s audit log) but never defined. See [05-database-schema.md](05-database-schema.md) for the actual schema, which is now the source of truth.
- **Additional endpoints beyond the original API list**, needed for the admin dashboard UI: `GET /api/admin/qr` (list, optional `?batchId=`), `GET /api/admin/qr/:qrName` (detail + audit history), `GET /api/admin/qr/:qrName/image`. See [06-api-specifications.md](06-api-specifications.md).
- **Bulk operations are size-capped**: batch-create and CSV import are capped at 500 entries, CSV uploads at 2MB — the original spec's `processBatchQRs` had no bound.
- **Conditional/rule-based redirect routing** (device- or location-based targets, a Bitly-style premium feature) is explicitly out of scope for v1 — not built, not stubbed.

### v2 — Feature parity pass (competitor audit)

Following a logged-in audit of a competitor's actual dashboard, these were added (single-business scope only — no billing/multi-tenant, per an explicit user decision):

- **Delete** (single + bulk cross-batch via multi-select), **duplicate** (`-copy`/`-copy-2` naming), **expiration date** (`QrCode.expiresAt` — `handleScan` treats an expired QR identically to a nonexistent one, no separate status code).
- **Dashboard**: free-text search, quick filter chips (date range, scan-count range), true multi-select (not scoped to one batch) with bulk delete/download.
- `buildBatchSvgZip`/`buildQrCodesSvgZip` (`src/lib/qr/batchDownload.ts`) were split so bulk-download works both per-batch and for an arbitrary cross-batch selection.
- **UTM tracking**: a single-row `OrgSettings` table holds site-wide default `utm_*` params (with a `{{name}}` placeholder substituted per-QR); `QrCode.utmEnabled` is a per-QR opt-out. Applied to the redirect target in `handleScan`, never to the short link itself, and best-effort (a settings-lookup failure falls back to the bare target rather than blocking the redirect).
- **Analytics depth**: the existing `getQrAnalytics()` aggregation already computed `dailyTrend`/`byDevice`/`byMethod`/`byLocation` — only the chart UI (`recharts`) was new. Geographic breakdown is a ranked table, not an actual map (skipped a geo-shapes dependency for marginal value over a sorted list). Added a raw scan-log CSV export (`scanEventsToCsv()`), unbounded unlike the analytics endpoint's `recentScans` cap.
- **Account settings**: self-service password change (reuses `src/lib/auth/password.ts`); 2FA is a **hand-rolled RFC 6238 TOTP** implementation (`src/lib/auth/totp.ts`) using only Node's built-in `crypto` — no new dependency — cross-checked against an independent reference implementation in its own test file; multi-admin "team" (`src/lib/auth/team.ts`) refuses to remove the last remaining admin so the app can never lock everyone out.
- **Custom domain**: single-tenant framing — `OrgSettings.publicBaseUrl`, when set, overrides `NEXT_PUBLIC_BASE_URL` for every short-link/QR-image URL via `getPublicBaseUrl()`, without a redeploy. Not the multi-tenant CNAME-provisioning system a real SaaS would need.
- **Public API**: new `ApiKey` model + `/api/v1/qr` (list/create/get/update-target), authenticated via `Authorization: Bearer <key>` through `requireApiKey` — a separate auth path from the admin JWT session. Required making `AuditLog.adminId` nullable, since API-key-driven changes aren't tied to a dashboard admin.
- **Multiple QR content types**: `QrCode.contentType` (`URL`/`TEXT`/`VCARD`/`WIFI`) + `contentPayload Json?`. Only `URL` redirects through our short link and gets scan analytics — `TEXT`/`VCARD`/`WIFI` encode their payload directly into the QR image (`buildQrPayload()`, `src/lib/qr/contentTypes.ts`), exactly like a standalone vCard/Wi-Fi generator: no redirect, no scan tracking possible, matching how these formats work everywhere. `targetUrl` stays NOT NULL — non-URL types get an auto-derived human-readable label (e.g. `"vCard: Jane Doe"`) instead, to avoid a schema change touching ~13 files for marginal benefit.
- **Visual design customization**: `QrCode.designOptions Json?` (`fgColor`, `bgColor`, `logoUrl`), settable per-QR from the detail page's "Customize design" card and applied by `generateQrSvg`/`generateQrPng` (`src/lib/qr/image.ts`) and the batch-download ZIP path. Logo overlay composites a centered `<image>` in the SVG and bumps `errorCorrectionLevel` to `H` to stay scannable. **Known gap, left undone deliberately**: module _shape_ (rounded/dot modules, as some competitors offer) isn't supported — the `qrcode` library only draws square modules, and hand-rolling a QR renderer to get rounded corners wasn't judged worth the cost versus color + logo, which cover the bulk of the customization ask. Swapping renderers is a follow-on if ever needed.

---

See also: [05-database-schema.md](05-database-schema.md#qr_codes-table) for `qr_codes`/`qr_scan_events` schema, [09-error-handling-edge-cases.md](09-error-handling-edge-cases.md#qr-scan-edge-cases) for scan failure handling, and [06-api-specifications.md](06-api-specifications.md#qr-management-endpoints) for the endpoint list.

Next: [03-cms-profile-builder.md](03-cms-profile-builder.md)
