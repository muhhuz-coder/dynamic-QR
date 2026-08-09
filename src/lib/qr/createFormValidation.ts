export interface CreateFormValues {
  baseName: string;
  quantity: string;
  targetUrl: string;
}

/**
 * Client-side validation for the dashboard's "New QR code" wizard, mirroring
 * the server-side rules in the batch API (name 1-50 chars, quantity 1-100) so
 * the user sees the same error before submitting, not just after a 400.
 */
export function validateCreateForm(values: CreateFormValues): string | null {
  const baseName = values.baseName.trim();
  if (!baseName) {
    return 'Name is required';
  }
  if (baseName.length > 50) {
    return 'Name must be 50 characters or fewer';
  }

  const quantity = Number(values.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    return 'Quantity must be a whole number between 1 and 100';
  }

  if (!values.targetUrl.trim()) {
    return 'Target URL is required';
  }

  return null;
}
