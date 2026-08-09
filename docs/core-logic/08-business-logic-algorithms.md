# Business Logic & Algorithms

> Part of the [TAP & REVIEW Core Logic Requirements](README.md) set. These are the condensed decision rules behind the implementations in [02-qr-management.md](02-qr-management.md) and [04-review-management.md](04-review-management.md) — read this alongside those docs, not as a replacement.

## Review Status Transitions

Referenced in [04-review-management.md](04-review-management.md) (`reviews.status` column, defined in [05-database-schema.md](05-database-schema.md#reviews-table)).

```
new → seen → replied → archived
      ↓
      Do not reply (manual archive)
```

## QR Naming with Sequences

Full implementation: [02-qr-management.md](02-qr-management.md#2-qr-generation-logic).

```
Input: qr_name="order-12345", quantity=10

Output:
1. order-12345 (first one is base)
2. order-12345-02
3. order-12345-03
...
10. order-12345-10

If quantity=1: Just "order-12345"
```

## AI Reply Selection Logic

Full implementation (`buildAIPrompt`, `sanitizeAIReply`): [04-review-management.md](04-review-management.md#5-ai-reply-generation).

```
IF rating >= 4 THEN
  - Mention upsell item
  - Add Instagram handle
ELSE IF rating <= 2 THEN
  - Add complaint email/phone
END IF

- Pick random closing message
- Enforce max length
- Remove "feedback" word
```

---

Next: [09-error-handling-edge-cases.md](09-error-handling-edge-cases.md)
