'use client';

import { useEffect, useState } from 'react';

import { adminFetch } from '@/lib/adminClient';

/**
 * <img> can't send an Authorization header, and the image endpoint is
 * admin-gated like every other /api/admin/* route — so this fetches the PNG
 * as a blob and renders it via an object URL instead of a bare <img src>.
 */
export function QrImage({ qrName, size = 160 }: { qrName: string; size?: number }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let currentUrl: string | null = null;
    let cancelled = false;

    adminFetch(`/api/admin/qr/${qrName}/image`)
      .then((response) => response.blob())
      .then((blob) => {
        if (cancelled) return;
        currentUrl = URL.createObjectURL(blob);
        setObjectUrl(currentUrl);
      })
      .catch(() => {
        /* image is a nice-to-have; leave the placeholder if it fails */
      });

    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [qrName]);

  return (
    <div
      className="border-border flex items-center justify-center rounded-xl border bg-white"
      style={{ width: size, height: size }}
    >
      {objectUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URL, next/image can't optimize this
        <img src={objectUrl} alt={`QR code for ${qrName}`} width={size} height={size} />
      ) : (
        <span className="text-muted text-xs">Loading…</span>
      )}
    </div>
  );
}
