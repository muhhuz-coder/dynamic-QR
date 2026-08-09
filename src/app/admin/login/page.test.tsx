// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

import AdminLoginPage from './page';

describe('AdminLoginPage', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the server error message on invalid credentials', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid email or password' }),
    });

    render(<AdminLoginPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(replaceMock).not.toHaveBeenCalled();
  }, 15_000); // userEvent.type() can exceed the 5s default under heavy parallel load from the DB integration test files

  it('stores the token and redirects to the dashboard on success', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'test-jwt-token' }),
    });

    render(<AdminLoginPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(window.localStorage.getItem('tapnreview_admin_token')).toBe('test-jwt-token');
    });
    expect(replaceMock).toHaveBeenCalledWith('/admin');
  }, 15_000);
});
