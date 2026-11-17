import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthForm } from '@/components/atlas/auth-form';

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), oauth: vi.fn(), getUser: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/integrations/lovable', () => ({ lovable: { auth: { signInWithOAuth: mocks.oauth } } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: mocks.getUser } } }));

describe('Microsoft sign-in', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  });
  afterEach(cleanup);

  it('returns OAuth to public /auth without navigating before the redirect completes', async () => {
    mocks.oauth.mockResolvedValue({ redirected: true });
    render(<AuthForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com Microsoft' }));
    await waitFor(() => expect(mocks.oauth).toHaveBeenCalledWith('microsoft', { redirect_uri: `${window.location.origin}/auth` }));
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('navigates only after the popup yields a verified user', async () => {
    mocks.oauth.mockResolvedValue({ redirected: false });
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } }).mockResolvedValueOnce({ data: { user: { id: 'existing-user' } }, error: null });
    render(<AuthForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com Microsoft' }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: '/ocorrencias', replace: true }));
  });

  it('does not enter protected pages when Microsoft sign-in fails', async () => {
    mocks.oauth.mockResolvedValue({ error: new Error('denied') });
    render(<AuthForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com Microsoft' }));
    await screen.findByRole('alert');
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Entrar com Microsoft' })).toBeEnabled();
  });

  it('rejects an OAuth result without a verified session', async () => {
    mocks.oauth.mockResolvedValue({ redirected: false });
    render(<AuthForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com Microsoft' }));
    await screen.findByRole('alert');
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});