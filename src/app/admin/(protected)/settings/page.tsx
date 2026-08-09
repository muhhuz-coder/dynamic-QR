'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/admin/Button';
import { Card } from '@/components/admin/Card';
import { TextField } from '@/components/admin/TextField';
import { adminFetch, UnauthorizedError } from '@/lib/adminClient';

interface OrgSettings {
  companyName: string | null;
  country: string | null;
  timeZone: string | null;
  defaultUtmSource: string | null;
  defaultUtmMedium: string | null;
  defaultUtmCampaign: string | null;
  defaultUtmTerm: string | null;
  defaultUtmContent: string | null;
  publicBaseUrl: string | null;
}

const EMPTY: OrgSettings = {
  companyName: '',
  country: '',
  timeZone: '',
  defaultUtmSource: '',
  defaultUtmMedium: '',
  defaultUtmCampaign: '',
  defaultUtmTerm: '',
  defaultUtmContent: '',
  publicBaseUrl: '',
};

export default function SettingsPage() {
  const router = useRouter();
  const [form, setForm] = useState<OrgSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/settings');
      const body = await response.json();
      if (body.settings) {
        setForm({ ...EMPTY, ...body.settings });
      }
    } catch (err) {
      if (err instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function field(name: keyof OrgSettings) {
    return {
      value: form[name] ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [name]: e.target.value })),
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    const payload = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value?.trim() ? value.trim() : null]),
    );

    try {
      const response = await adminFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? 'Failed to save settings');
        return;
      }
      setSuccess('Saved');
    } catch (err) {
      if (err instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-muted text-sm">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-foreground text-2xl font-semibold">Settings</h1>
        <p className="text-muted mt-1 text-sm">
          Organization info and default tracking parameters.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Card>
          <h2 className="text-foreground mb-4 text-lg font-medium">Account info</h2>
          <div className="flex flex-col gap-4">
            <TextField label="Company name" name="companyName" {...field('companyName')} />
            <TextField label="Country" name="country" {...field('country')} />
            <TextField
              label="Time zone"
              name="timeZone"
              placeholder="e.g. Asia/Karachi"
              {...field('timeZone')}
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-foreground mb-1 text-lg font-medium">Default UTM parameters</h2>
          <p className="text-muted mb-4 text-sm">
            Applied to every QR&apos;s redirect target, unless that QR has UTM tracking turned off.
            Use <code className="text-foreground">{'{{name}}'}</code> in the campaign field to
            insert each QR&apos;s own name.
          </p>
          <div className="flex flex-col gap-4">
            <TextField
              label="Campaign Source (utm_source)"
              name="defaultUtmSource"
              placeholder="TapReview"
              {...field('defaultUtmSource')}
            />
            <TextField
              label="Campaign Medium (utm_medium)"
              name="defaultUtmMedium"
              placeholder="qr_code"
              {...field('defaultUtmMedium')}
            />
            <TextField
              label="Campaign Name (utm_campaign)"
              name="defaultUtmCampaign"
              placeholder="{{name}}"
              {...field('defaultUtmCampaign')}
            />
            <TextField label="Term (utm_term)" name="defaultUtmTerm" {...field('defaultUtmTerm')} />
            <TextField
              label="Content (utm_content)"
              name="defaultUtmContent"
              {...field('defaultUtmContent')}
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-foreground mb-1 text-lg font-medium">Custom domain</h2>
          <p className="text-muted mb-4 text-sm">
            Overrides the domain used to build short-link URLs, without redeploying. Point a CNAME
            record at this app&apos;s host, then enter the full domain here (e.g.{' '}
            <code className="text-foreground">qr.yourdomain.com</code>).
          </p>
          <TextField
            label="Public base URL"
            name="publicBaseUrl"
            type="url"
            placeholder="https://qr.yourdomain.com"
            {...field('publicBaseUrl')}
          />
        </Card>

        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
        {success && <p className="text-accent text-sm">{success}</p>}
        <Button type="submit" disabled={saving} className="self-start">
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
      </form>

      <PasswordCard />
      <TwoFactorCard />
      <TeamCard />
      <ApiKeysCard />
    </div>
  );
}

interface ApiKeyRow {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

function ApiKeysCard() {
  const router = useRouter();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [label, setLabel] = useState('');
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/api-keys');
      const body = await response.json();
      setKeys(body.keys ?? []);
    } catch (err) {
      if (err instanceof UnauthorizedError) router.replace('/admin/login');
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNewRawKey(null);
    setCreating(true);
    try {
      const response = await adminFetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? 'Failed to create key');
        return;
      }
      setNewRawKey(body.rawKey);
      setLabel('');
      await load();
    } catch (err) {
      if (err instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setError(null);
    try {
      const response = await adminFetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json();
        setError(body.error ?? 'Failed to revoke key');
        return;
      }
      await load();
    } catch (err) {
      if (err instanceof UnauthorizedError) router.replace('/admin/login');
    }
  }

  return (
    <Card>
      <h2 className="text-foreground mb-1 text-lg font-medium">API keys</h2>
      <p className="text-muted mb-4 text-sm">
        Your secret keys are listed below. They&apos;re shown in full only once, right after
        creation.
      </p>

      {newRawKey && (
        <div className="border-accent/40 bg-accent/10 mb-4 rounded-md border p-3">
          <p className="text-foreground text-sm">
            New key (copy it now — it won&apos;t be shown again):
          </p>
          <code className="text-foreground text-sm break-all">{newRawKey}</code>
        </div>
      )}

      <ul className="mb-4 flex flex-col gap-2 text-sm">
        {keys.map((key) => (
          <li
            key={key.id}
            className="border-border flex items-center justify-between border-b pb-2 last:border-0"
          >
            <div>
              <p className="text-foreground">{key.label}</p>
              <p className="text-muted text-xs">
                Created {new Date(key.createdAt).toLocaleDateString()}
                {key.lastUsedAt
                  ? ` · Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                  : ' · Never used'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleRevoke(key.id)}
              className="text-danger text-xs hover:underline"
            >
              Revoke
            </button>
          </li>
        ))}
        {keys.length === 0 && <p className="text-muted text-sm">No keys yet.</p>}
      </ul>

      <form onSubmit={handleCreate} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Label"
          name="label"
          placeholder="e.g. Zapier integration"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
        <Button type="submit" variant="secondary" disabled={creating} className="self-start">
          {creating ? 'Creating…' : 'Create new secret key'}
        </Button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const response = await adminFetch('/api/admin/account/password', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? 'Failed to update password');
        return;
      }
      setSuccess('Password updated');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      if (err instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="text-foreground mb-4 text-lg font-medium">Password</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Current password"
          name="currentPassword"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
        <TextField
          label="New password"
          name="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
        />
        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
        {success && <p className="text-accent text-sm">{success}</p>}
        <Button type="submit" disabled={saving} className="self-start">
          {saving ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </Card>
  );
}

function TwoFactorCard() {
  const router = useRouter();
  const [enrolling, setEnrolling] = useState(false);
  const [otpAuthUri, setOtpAuthUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleEnroll() {
    setError(null);
    setEnrolling(true);
    try {
      const response = await adminFetch('/api/admin/account/totp', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? 'Failed to start enrollment');
        return;
      }
      setOtpAuthUri(body.otpAuthUri);
      setSecret(body.secret);
    } catch (err) {
      if (err instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setEnrolling(false);
    }
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const response = await adminFetch('/api/admin/account/totp/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? 'Invalid code');
        return;
      }
      setSuccess('2FA enabled');
      setOtpAuthUri(null);
      setSecret(null);
      setCode('');
    } catch (err) {
      if (err instanceof UnauthorizedError) router.replace('/admin/login');
    }
  }

  async function handleDisable() {
    setError(null);
    setSuccess(null);
    try {
      const response = await adminFetch('/api/admin/account/totp', { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json();
        setError(body.error ?? 'Failed to disable 2FA');
        return;
      }
      setSuccess('2FA disabled');
    } catch (err) {
      if (err instanceof UnauthorizedError) router.replace('/admin/login');
    }
  }

  return (
    <Card>
      <h2 className="text-foreground mb-1 text-lg font-medium">Two-factor authentication</h2>
      <p className="text-muted mb-4 text-sm">
        When enabled, you&apos;ll be prompted for a 6-digit code from your authenticator app to log
        in.
      </p>

      {!otpAuthUri && (
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={handleEnroll} disabled={enrolling}>
            {enrolling ? 'Starting…' : 'Enable 2FA'}
          </Button>
          <Button type="button" variant="danger" onClick={handleDisable}>
            Disable 2FA
          </Button>
        </div>
      )}

      {otpAuthUri && (
        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <p className="text-muted text-sm">
            Scan this in your authenticator app, or enter the secret manually:{' '}
            <code className="text-foreground">{secret}</code>
          </p>
          <p className="text-muted text-xs break-all">{otpAuthUri}</p>
          <TextField
            label="Enter the 6-digit code to confirm"
            name="code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <Button type="submit" className="self-start">
            Confirm
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-danger mt-3 text-sm">
          {error}
        </p>
      )}
      {success && <p className="text-accent mt-3 text-sm">{success}</p>}
    </Card>
  );
}

interface AdminRow {
  id: string;
  email: string;
  createdAt: string;
}

function TeamCard() {
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/team');
      const body = await response.json();
      setAdmins(body.admins ?? []);
    } catch (err) {
      if (err instanceof UnauthorizedError) router.replace('/admin/login');
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInviting(true);
    try {
      const response = await adminFetch('/api/admin/team', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, temporaryPassword }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? 'Failed to invite admin');
        return;
      }
      setEmail('');
      setTemporaryPassword('');
      await load();
    } catch (err) {
      if (err instanceof UnauthorizedError) router.replace('/admin/login');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(adminId: string) {
    setError(null);
    try {
      const response = await adminFetch(`/api/admin/team/${adminId}`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? 'Failed to remove admin');
        return;
      }
      await load();
    } catch (err) {
      if (err instanceof UnauthorizedError) router.replace('/admin/login');
    }
  }

  return (
    <Card>
      <h2 className="text-foreground mb-4 text-lg font-medium">Team</h2>
      <ul className="mb-4 flex flex-col gap-2 text-sm">
        {admins.map((a) => (
          <li
            key={a.id}
            className="border-border flex items-center justify-between border-b pb-2 last:border-0"
          >
            <span className="text-foreground">{a.email}</span>
            <button
              type="button"
              onClick={() => handleRemove(a.id)}
              className="text-danger text-xs hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleInvite} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Temporary password"
          name="temporaryPassword"
          type="text"
          value={temporaryPassword}
          onChange={(e) => setTemporaryPassword(e.target.value)}
          required
          minLength={8}
        />
        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
        <Button type="submit" variant="secondary" disabled={inviting} className="self-start">
          {inviting ? 'Inviting…' : 'Invite admin'}
        </Button>
      </form>
    </Card>
  );
}
