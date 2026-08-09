# Integration Points

> Part of the [TAP & REVIEW Core Logic Requirements](README.md) set. Backs the Google/OpenAI calls made throughout [04-review-management.md](04-review-management.md) (`exchangeGoogleAuthCode`, `fetchGoogleBusinessProfile`, `fetchGoogleReviews`, `postReplyToGoogle`, `generateAIReply`).

## Google Business Profile API

```javascript
// Required scopes
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/userinfo.email',
];

// Endpoints used
- GET /accounts/*/locations: Get business info
- GET /locations/*/reviews: Fetch reviews
- POST /reviews/*/reply: Post replies
```

Token storage/refresh is described in [04-review-management.md](04-review-management.md#1-client-onboarding-flow); encryption at rest is described in [07-authentication-security.md](07-authentication-security.md#google-token-encryption).

## OpenAI API

```javascript
// Model: gpt-4o-mini
// Usage: Generate review replies
// Rate: Monitor token usage for cost
// Fallback: Use template replies if API down
```

Used by `generateAIReply` in [04-review-management.md](04-review-management.md#5-ai-reply-generation).

---

Next: [11-monitoring-logging.md](11-monitoring-logging.md)
