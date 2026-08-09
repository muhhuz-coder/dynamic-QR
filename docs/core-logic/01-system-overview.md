# System Overview

> Part of the [TAP & REVIEW Core Logic Requirements](README.md) set. Read this file first — every other doc in this set assumes this architecture and stack.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    ADMIN INTERFACE                      │
│  (QR Management + CMS Builder + Review Dashboard)      │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐    ┌────▼────┐   ┌────▼────┐
   │ QR Mgmt │    │ CMS     │   │ Review  │
   │ Service │    │ Service │   │ Service │
   └────┬────┘    └────┬────┘   └────┬────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
   ┌────▼─────────┐         ┌────────▼────┐
   │ PostgreSQL   │         │ External    │
   │ Database     │         │ Services    │
   └──────────────┘         │ (Google,    │
                            │  OpenAI)    │
                            └─────────────┘
```

The three services (QR Management, CMS, Review) are covered in their own docs:

- [02-qr-management.md](02-qr-management.md)
- [03-cms-profile-builder.md](03-cms-profile-builder.md)
- [04-review-management.md](04-review-management.md)

They share one PostgreSQL database (schema in [05-database-schema.md](05-database-schema.md)) and call out to Google APIs and OpenAI (details in [10-integration-points.md](10-integration-points.md)).

## Core Technology Stack

**Frontend:**

- Next.js 14+ (App Router)
- React 18+
- Tailwind CSS 3+
- TypeScript
- SWR/React Query (data fetching)
- Zustand (state management)

**Backend:**

- Next.js API Routes (Serverless)
- Node.js 18+
- TypeScript
- Middleware (authentication, logging) — see [07-authentication-security.md](07-authentication-security.md)

**Database:**

- PostgreSQL 14+
- Prisma ORM (recommended) or Raw SQL
- Redis (caching, sessions)

**Hosting:**

- Vercel (Frontend + Backend)
- Supabase or AWS RDS (Database)
- Cloudflare (CDN, Workers for edge)

---

Next: [02-qr-management.md](02-qr-management.md)
