const SHORT_CODE_LENGTH = 8;
const MAX_ATTEMPTS = 10;

/** Pure random generator, isolated so the collision-retry loop is testable without mocking Math.random. */
export function randomShortCode(): string {
  return Math.random()
    .toString(36)
    .slice(2, 2 + SHORT_CODE_LENGTH)
    .toUpperCase();
}

/**
 * Generates a short code guaranteed unique against `exists`.
 * `exists` is injected so this is unit-testable without a database.
 */
export async function generateUniqueShortCode(
  exists: (shortCode: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = randomShortCode();
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
  throw new Error(`Failed to generate a unique short code after ${MAX_ATTEMPTS} attempts`);
}
