'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { clearAdminToken } from '@/lib/adminClient';

function QrIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="14" y="14" width="3" height="3" fill="currentColor" />
      <rect x="18" y="14" width="3" height="3" fill="currentColor" />
      <rect x="14" y="18" width="3" height="3" fill="currentColor" />
      <rect x="18" y="18" width="3" height="3" fill="currentColor" />
    </svg>
  );
}

export function AdminNav() {
  const router = useRouter();

  function handleLogout() {
    clearAdminToken();
    router.replace('/admin/login');
  }

  return (
    <header className="bg-nav-background text-nav-foreground">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-4">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <QrIcon />
          tap&amp;review
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/admin/settings"
            className="text-sm font-medium transition hover:text-white/80"
          >
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-white/25 px-3 py-1.5 text-sm font-medium transition hover:bg-white/10"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
