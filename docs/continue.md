# QR Code Generator App — Continuation Notes

## Goal

Build an **original** QR code generator web app (React artifact), inspired by
the general feature set of commercial dynamic-QR SaaS products (NOT a copy of
any specific site's design/branding — that was explicitly ruled out earlier
in this conversation for IP reasons). User confirmed:

- Platform: **Web app (React)**
- Core features: QR generation + style/color/logo customization, **dynamic**
  codes (destination editable after creation), scan analytics dashboard,
  user accounts & login
- Must be a **real working app** (persistent backend), not just a prototype
  — built using the artifact `window.storage` key-value API (get/set/delete/list,
  personal + shared scopes) since this environment has no traditional server.

## Design direction (decided, not yet executed)

Avoid the three "AI-default" looks (cream+terracotta serif, near-black+acid
accent, broadsheet hairline). Working concept:

- **Palette**: paper white `#FAFAF8` background, ink `#14161A` text/ink,
  primary accent **Beacon Blue** `#2B59FF`, secondary accent **Amber**
  `#FFB100`, muted grey `#6B6F76`.
- **Type**: mono display face (JetBrains Mono / Space Mono — fits the
  QR/"code" subject) for headlines & data, clean sans (Inter) for body copy.
- **Signature element**: hero QR grid that assembles from scattered squares
  into a real, working scannable QR code (ties into the actual product
  function, not decorative).
- Name proposed but not finalized: working title "Beacon" (a QR/signal
  generator brand, distinct from any existing product).

## Technical approach (validated, key risk retired)

Real QR encoding requires a proper Reed-Solomon based encoder — hand-writing
one from scratch is error-prone (could produce codes that _look_ right but
don't scan). Instead:

1. Installed the MIT-licensed `qrcode-generator` npm package (Kazuhiko Arase)
   in the sandbox at `/home/claude/qrapp/`.
2. Minified it with `terser` → `/home/claude/qrapp/qrcode.min.js` (~20KB,
   single line, self-contained, no dependencies).
3. **Verified it works**: ran it in Node, generated a matrix for a test URL,
   printed the module grid — valid finder patterns present, module count 29
   (version 3), confirms correct encoding.
4. Plan: embed this library's source verbatim (with MIT license header kept
   intact) as an inline `<script>`/plain JS block inside the React artifact
   file itself — no external runtime fetch needed, so it works inside the
   sandboxed artifact environment. Render the QR by mapping
   `qr.isDark(row, col)` over a `<svg>` grid of `<rect>`s so foreground/
   background colors can be fully customized (this also makes logo overlay
   and style variants easy — draw the logo as a centered `<image>`/shape on
   top of the SVG using low error-correction margin so it still scans).

## Architecture plan (not yet built)

- **Auth**: simple storage-based signup/login. Shared key
  `users:<username>` → hashed-ish credential + profile. NOT production-grade
  security — flag this clearly to the user in the UI/README since there's no
  real backend, sessions live in React state.
- **QR records**: personal key `codes:<userId>:<codeId>` → `{ label, type,
style: {fgColor, bgColor, shape}, destination, createdAt }`.
- **Dynamic redirect mechanism**: each generated QR encodes a URL pointing
  back to the artifact's own public share link with a query param, e.g.
  `?code=abc123`. On load, the app checks for that param; if present, it
  looks up the destination in **shared** storage (`redirects:abc123` →
  `{ destination, ownerId }`), logs a scan event (increment count, push
  timestamp into `scans:abc123` shared list), then does
  `window.location.href = destination`. This makes codes genuinely dynamic
  (owner can edit destination later) and enables real scan analytics,
  without needing an external server.
- **Analytics dashboard**: per-code scan count + timeline, pulled from
  `scans:<codeId>`. Consider `recharts` (available in the React artifact
  library allowlist) for a simple scan-over-time chart.
- **Editing destinations**: update `redirects:<codeId>.destination` in place
  — the physical QR image never needs to change since it always points to
  the same short code.

## Remaining steps

1. Finalize design token pass per `frontend-design` skill (brainstorm →
   critique → build), don't skip the self-critique step.
2. Write the single-file React artifact:
   - Inline the vetted `qrcode-generator` source (copy from
     `/home/claude/qrapp/qrcode.min.js`, verified working above)
   - Auth screens (signup/login) using `window.storage`
   - Dashboard: list/create/edit/delete QR codes
   - QR customization UI (fg/bg color, shape/style, optional logo)
   - SVG QR renderer driven by `qr.isDark(row,col)`
   - Redirect-on-load logic reading `?code=` param
   - Analytics view (count + simple chart)
   - Empty/error states written per the skill's voice guidance
3. Test the full loop: generate a code → confirm SVG renders correctly →
   confirm redirect logic triggers scan logging → confirm dashboard reflects
   updated scan counts.
4. Inform user clearly: auth/security is demo-grade (no real password
   hashing/session security) given the sandboxed environment; recommend a
   real backend (e.g. Supabase/Firebase + a proper QR redirect service) if
   they want to ship this for real users.

## Key context from user

- Original ask was to clone `https://qrcodesunlimited.com/qr/my/portals`
  "exact to exact." That page is a logged-in dashboard blocked by robots.txt
  anyway, and doing a pixel/brand-exact clone of a live commercial product
  was declined for copyright/trade-dress reasons.
- User agreed instead to build an **original** app with similar
  functionality (QR generation/customization, dynamic codes, analytics,
  accounts), as a real working React web app.
