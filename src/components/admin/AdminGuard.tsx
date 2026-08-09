'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { getAdminToken } from '@/lib/adminClient';

/** Redirects to /admin/login if there's no token in localStorage; renders children once verified. */
export function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (getAdminToken()) {
      // The auth check can only run client-side (no window during SSR), so this
      // necessarily lands after mount — that's what avoids the alternative bug
      // (a hydration mismatch from branching on `typeof window` during render).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthorized(true);
    } else {
      router.replace('/admin/login');
    }
  }, [router]);

  if (!authorized) return null;
  return <>{children}</>;
}
