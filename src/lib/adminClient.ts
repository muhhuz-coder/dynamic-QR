'use client';

const TOKEN_KEY = 'tapnreview_admin_token';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Not authenticated');
    this.name = 'UnauthorizedError';
  }
}

/**
 * fetch() wrapper that attaches the admin bearer token and normalizes a 401
 * into a typed error the caller can redirect on, instead of leaking raw
 * Response handling into every page.
 */
export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAdminToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, { ...init, headers });
  if (response.status === 401) {
    clearAdminToken();
    throw new UnauthorizedError();
  }
  return response;
}

/**
 * Downloads an admin-gated file to the user's machine. `<a download>` can't
 * carry an Authorization header, so this fetches the bytes itself and
 * triggers the save via a throwaway object URL + synthetic click, same
 * technique as QrImage but for a real download instead of an inline preview.
 */
export async function downloadAdminFile(
  path: string,
  filename: string,
  init: RequestInit = {},
): Promise<void> {
  const response = await adminFetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Download failed (${response.status})`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
