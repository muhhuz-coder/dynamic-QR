/**
 * Generates the sequence of QR names for a batch.
 * quantity=1 -> [baseName]
 * quantity=N -> [baseName, `${baseName}-02`, ..., `${baseName}-0N`]
 */
export function generateQRNames(baseName: string, quantity: number): string[] {
  if (quantity < 1) {
    throw new Error('quantity must be at least 1');
  }

  if (quantity === 1) {
    return [baseName];
  }

  const names = [baseName];
  for (let i = 2; i <= quantity; i++) {
    const padded = String(i).padStart(2, '0');
    names.push(`${baseName}-${padded}`);
  }

  return names;
}
