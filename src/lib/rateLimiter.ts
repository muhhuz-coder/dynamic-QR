/**
 * In-memory token bucket, scoped per key (typically client IP).
 * v1 only — a single Next.js server instance. Documented in docs/GUARDRAILS.md
 * that this needs to move to Redis/Cloudflare once there's more than one instance,
 * since state here doesn't share across processes.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; lastRefill: number }>();

  constructor(
    private readonly maxTokens: number,
    private readonly refillIntervalMs: number,
  ) {}

  /** Returns true if the request is allowed, false if it should be rejected (429). */
  tryConsume(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.maxTokens, lastRefill: now };

    const elapsed = now - bucket.lastRefill;
    const refillCount = Math.floor(elapsed / this.refillIntervalMs);
    if (refillCount > 0) {
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refillCount);
      bucket.lastRefill = now;
    }

    if (bucket.tokens <= 0) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }
}
