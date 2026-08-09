import type { ReactNode } from 'react';

import { AdminGuard } from '@/components/admin/AdminGuard';
import { AdminNav } from '@/components/admin/AdminNav';

export default function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGuard>
      <div className="bg-background min-h-screen">
        <AdminNav />
        <main className="mx-auto max-w-5xl px-8 py-8">{children}</main>
      </div>
    </AdminGuard>
  );
}
