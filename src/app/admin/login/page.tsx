'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/admin/Button';
import { Card } from '@/components/admin/Card';
import { TextField } from '@/components/admin/TextField';
import { getAdminToken, setAdminToken } from '@/lib/adminClient';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, ...(needsTotp ? { totpCode } : {}) }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (body.error === 'totp_required') {
          setNeedsTotp(true);
          return;
        }
        setError(body.error ?? 'Login failed');
        return;
      }

      const { token } = await response.json();
      setAdminToken(token);
      router.replace('/admin');
    } finally {
      setSubmitting(false);
    }
  }

  // Already logged in — skip straight to the dashboard. Navigation is a side
  // effect and must not run during render (React will throw "Cannot update a
  // component while rendering a different component" otherwise).
  useEffect(() => {
    if (getAdminToken()) {
      router.replace('/admin');
    }
  }, [router]);

  return (
    <main className="bg-background flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-foreground mb-1 text-xl font-semibold">Admin sign in</h1>
        <p className="text-muted mb-6 text-sm">Tap &amp; Review QR management</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={needsTotp}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {needsTotp && (
            <TextField
              label="Authentication code"
              name="totpCode"
              placeholder="6-digit code"
              autoComplete="one-time-code"
              required
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
            />
          )}

          {error && (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          )}

          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? 'Signing in…' : needsTotp ? 'Verify code' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
