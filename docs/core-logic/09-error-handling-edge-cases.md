# Error Handling & Edge Cases

> Part of the [TAP & REVIEW Core Logic Requirements](README.md) set. These edge cases extend the implementations in [02-qr-management.md](02-qr-management.md) (scan handler) and [04-review-management.md](04-review-management.md) (Google review sync) — apply them when writing or reviewing those handlers.

## QR Scan Edge Cases

Applies to `handleQRScan` in [02-qr-management.md](02-qr-management.md#3-qr-scan-handler).

```
1. QR not found
   → Return 404, log to error tracking

2. Target URL invalid
   → Return 400, notify admin

3. Database error during scan
   → Log error, still redirect (don't block customer)

4. Geolocation service down
   → Log with "Unknown" location, continue

5. Rate limiting exceeded
   → Return 429, add to abuse log
```

## Review Sync Edge Cases

Applies to `syncGoogleReviews` in [04-review-management.md](04-review-management.md#4-google-review-sync).

```
1. Google API returns 401 (token expired)
   → Auto-refresh token, retry

2. Review already exists
   → Update if rating/text changed

3. Batch contains 1000+ reviews
   → Process in chunks to avoid timeout

4. Network error during sync
   → Log error, retry later via queue

5. Client has no Google token
   → Skip silently, log warning
```

---

Next: [10-integration-points.md](10-integration-points.md)
