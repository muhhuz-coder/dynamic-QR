const ALLOWED_REDIRECT_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Validates a URL is safe to store as a QR redirect target.
 * `new URL()` succeeding is not enough on its own — it happily parses
 * `javascript:`/`data:`/`file:` URIs, which would let a stored QR target
 * execute script or exfiltrate local files when "redirected" to. Only
 * http(s) targets are allowed. See docs/GUARDRAILS.md security section.
 */
export function isValidRedirectUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return ALLOWED_REDIRECT_PROTOCOLS.has(parsed.protocol);
}
