# TAP & REVIEW - CORE LOGIC REQUIREMENTS

**Document Version:** 1.0
**Date:** January 2024
**Target Audience:** Mid-level Backend/Full-stack Developer
**Detail Level:** Deep Dive
**Apps Covered:** QR Management, CMS Profile Builder, Review Management Admin Dashboard

This document has been split into focused files so each feature area can be read, referenced, and extended independently without losing surrounding context. Every file below recaps the shared tech stack and links back here plus sideways to related files it depends on.

## Reading Order / Index

1. [01-system-overview.md](01-system-overview.md) — Architecture diagram, tech stack. Read this first; every other doc assumes this context.
2. [02-qr-management.md](02-qr-management.md) — QR generation, scan handling, target updates, analytics queries.
3. [03-cms-profile-builder.md](03-cms-profile-builder.md) — Link-tree profile creation, buttons, styling, public view & click tracking.
4. [04-review-management.md](04-review-management.md) — Client onboarding via Google, AI reply config/generation, review sync, admin approval flow.
5. [05-database-schema.md](05-database-schema.md) — All SQL table definitions (clients, reviews, qr_codes, qr_scan_events, profiles, profile_visits, profile_clicks).
6. [06-api-specifications.md](06-api-specifications.md) — REST endpoint summary across all three apps.
7. [07-authentication-security.md](07-authentication-security.md) — Admin JWT middleware, Google token encryption.
8. [08-business-logic-algorithms.md](08-business-logic-algorithms.md) — Review status transitions, QR naming sequences, AI reply selection rules.
9. [09-error-handling-edge-cases.md](09-error-handling-edge-cases.md) — Known edge cases for QR scans and review sync.
10. [10-integration-points.md](10-integration-points.md) — Google Business Profile API and OpenAI API integration notes.
11. [11-monitoring-logging.md](11-monitoring-logging.md) — Operation logging pattern.
12. [12-deployment-checklist.md](12-deployment-checklist.md) — Pre-launch checklist.

## Cross-Cutting Notes

- **Database schema is the single source of truth** for field names/types referenced in the feature docs (02-04). If a feature doc's code sample and the schema doc disagree, the schema doc wins and the feature doc's sample should be updated.
- **Security rules in [07-authentication-security.md](07-authentication-security.md)** apply to every admin-only endpoint listed in [06-api-specifications.md](06-api-specifications.md) — assume `adminAuthMiddleware` wraps all `/api/admin/*` routes even where a feature doc's snippet omits it for brevity.
- **Error handling patterns in [09-error-handling-edge-cases.md](09-error-handling-edge-cases.md)** extend the QR and Review docs (02, 04) — read those together when implementing scan or sync logic.

---

**END OF INDEX**

Last Updated: January 2024
Version: 1.0 (split into per-feature files)
Ready for Development: YES
