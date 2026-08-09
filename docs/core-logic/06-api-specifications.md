# API Specifications

> Part of the [TAP & REVIEW Core Logic Requirements](README.md) set. Implementation detail for each endpoint lives in the matching feature doc: [02-qr-management.md](02-qr-management.md), [03-cms-profile-builder.md](03-cms-profile-builder.md), [04-review-management.md](04-review-management.md). All `/api/admin/*` routes are assumed to be wrapped by `adminAuthMiddleware` — see [07-authentication-security.md](07-authentication-security.md).

## QR Management Endpoints

**As implemented** (v1) — see [02-qr-management.md](02-qr-management.md#6-implementation-notes-as-built-v1) for how these differ from the original sketch below:

```
POST /api/auth/login
  - Public endpoint: admin sign-in
  - Body: email, password
  - Returns: { token } (JWT, 12h expiry)
  - Rate-limited: 5 attempts/min per IP

POST /api/admin/qr/batch
  - Create a batch from a single base name + quantity
  - Body: baseName, quantity (1-100), targetUrl, productType?
  - Returns: { batchId, batchName, totalCreated, qrs }

POST /api/admin/qr/batch/import-csv
  - Body: raw CSV text (columns: name, target_url, quantity?, product_type?)
  - Returns: same shape as batch create
  - Capped at 2MB / 500 resulting QR codes

GET /qr/:shortCode
  - Public endpoint: scan redirect
  - Query: ?via=nfc to tag the scan as an NFC tap (default: qr_scan)
  - Returns: 302 redirect to target_url; 404 if unknown; 429 if rate-limited
  - Logs analytics best-effort — a logging failure never blocks the redirect

GET /api/admin/qr
  - List QR codes, newest first (capped at 200)
  - Query params: batchId?

GET /api/admin/qr/:qrName
  - Fetch a single QR code plus its audit history

PUT /api/admin/qr/:qrName
  - Change where a QR points; writes an audit log entry
  - Body: newTargetUrl
  - Returns: success, old/new targets

GET /api/admin/qr/:qrName/analytics
  - Fetch QR analytics
  - Query params: period (7d, 30d, 90d, all)
  - Returns: scans, location, device, method breakdown

GET /api/admin/qr/:qrName/image
  - Renders the QR on demand from its short code (no object storage)
  - Query params: format (png default, svg)
```

Details: [02-qr-management.md](02-qr-management.md)

## Review Management Endpoints

```
POST /api/admin/client/:clientId/setup-details
  - Complete client onboarding details
  - Body: ownerName, ownerEmail, reportEmails, etc

PUT /api/admin/client/:clientId/ai-config
  - Configure AI reply settings
  - Body: aiEnabled, starRatings, complaintEmail, upsellItems, etc

GET /api/admin/client/:clientId/reviews
  - List all reviews for client
  - Query: status, page, limit
  - Returns: reviews with ai reply suggestions

PUT /api/admin/client/:clientId/review/:reviewId/approve-reply
  - Approve AI reply and post to Google
  - Body: approved, editedText
  - Returns: success message
```

Details: [04-review-management.md](04-review-management.md)

## CMS Profile Endpoints

```
POST /api/admin/profile/:profileId/buttons
  - Add button to profile
  - Body: name, type, url, pdfContent
  - Returns: button object

PUT /api/admin/profile/:profileId/styling
  - Update profile colors, fonts, images
  - Body: colors, logo, backgroundImage
  - Returns: updated profile

GET /profile/:profileSlug
  - Public endpoint: Get profile
  - Returns: profile data, buttons, social links

POST /profile/:profileSlug/track-click/:buttonId
  - Track button click
  - Returns: redirect URL
```

Details: [03-cms-profile-builder.md](03-cms-profile-builder.md)

---

Next: [07-authentication-security.md](07-authentication-security.md)
