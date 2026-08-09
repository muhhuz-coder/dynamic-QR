# Engineering Guardrails

This is the standing reference for how code gets written in this repo. It exists so quality doesn't erode as the QR Management, CMS, and Review Management features are built out iteratively. Every PR/slice is expected to follow this; deviations should be called out explicitly and justified, not silent.

See [docs/core-logic/README.md](core-logic/README.md) for the feature specs this code implements.

## 1. Security

- **Every `/api/admin/*` route MUST go through admin auth middleware** (JWT verification + role check). No exceptions. This is checked in review — a route handler with no visible auth call is a bug, not an oversight to wave through.
- **The public scan endpoint (`GET /qr/[shortCode]`) receives untrusted input.** It's a lookup key, never string-interpolated into a query — Prisma parameterizes by default; raw SQL (`$queryRaw`) is only used with explicit parameterization, never string concatenation.
- **Redirect target URLs are validated on write, not just parsed.** `new URL(url)` succeeding is not enough — `javascript:`, `data:`, and `file:` schemes must be explicitly rejected. Only `http:`/`https:` targets are allowed. This closes a stored-XSS/open-redirect gap present in the original spec's `isValidURL`.
- **Rate limit the public scan endpoint and any bulk-import endpoint.** This must be a real, tested implementation (even if it's an in-memory token bucket for v1), not just a line in an error-handling doc.
- **No secrets in code or committed files.** `.env.local` for local dev secrets, gitignored (`.env.example` documents the shape, no real values). Check `git status`/diff before every commit for anything that looks like a credential, even in files with innocuous names.
- **Third-party OAuth tokens (e.g. Google, in the future review-management feature) are encrypted at rest** with `crypto.createCipheriv`/`createDecipheriv` and a random IV stored alongside the ciphertext — never the deprecated `createCipher`/`createDecipher` (no explicit IV, weak key derivation). The original spec sketch used the deprecated API; do not copy that forward.

## 2. Testing

- **Every pure function in `src/lib/**` gets unit tests** (Vitest). This includes short-code generation, batch naming, URL validation, user-agent parsing, and analytics aggregation helpers.
- **Every API route gets an integration test against a real database** (local Supabase Postgres), not mocks. Mock-based DB tests can pass while a real migration or constraint is broken — always exercise the actual schema.
- **Documented edge cases get an explicit test, not just a comment.** The five QR-scan edge cases and five review-sync edge cases in [09-error-handling-edge-cases.md](core-logic/09-error-handling-edge-cases.md) each need a corresponding test once their handler exists.
- **A slice isn't done until `pnpm test`, `pnpm lint`, and `pnpm typecheck` all pass.** Don't move to the next slice with red or skipped tests.

## 3. Code quality

- **TypeScript strict mode is on** (already set in `tsconfig.json`). No `any` without an inline comment justifying why it's unavoidable.
- **ESLint + Prettier run on every commit** via husky + lint-staged (`.husky/pre-commit`, `.lintstagedrc.json`). Don't bypass with `--no-verify`.
- **Prisma is the only database access layer.** No raw SQL unless Prisma genuinely can't express the query — and even then, use `$queryRaw` with tagged-template parameterization, never manual string building.
- **Business logic lives in `src/lib/**` services, separate from route handlers** (`src/app/api/**`), so it's unit-testable without booting the Next.js server. Route handlers should mostly parse input, call a lib function, and shape the response.

## 4. Process

- **Build in small, iterative, independently-verifiable slices**: schema → service logic + tests → API route + tests → UI. Each slice should be runnable and testable before starting the next — see the build plan for the current feature.
- **Database changes go through Prisma migrations** (`pnpm prisma:migrate`), never manual edits against the dev database.
- **Schema changes are reflected in [docs/core-logic/05-database-schema.md](core-logic/05-database-schema.md).** If implementation diverges from that doc (a new column, a renamed field), update the doc in the same slice — it's the source of truth other docs link back to.
- **Don't build ahead of what's asked.** Conditional/rule-based redirect routing (device/location-based, a Bitly premium feature) is explicitly deferred past v1 — don't add it speculatively.
- **Restart the dev server after every Prisma schema change**, not just `prisma generate`. `src/lib/db/client.ts` deliberately caches a single `PrismaClient` on `globalThis` across Next.js hot reloads (to avoid exhausting Postgres connections) — but that means the running server keeps using the client instance built from the _old_ generated code even after `prisma migrate dev`/`prisma generate` finish, silently omitting new columns from queries until the process is restarted.
