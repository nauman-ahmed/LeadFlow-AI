import type { Metadata } from 'next';
import { adminConfigured, safeNext } from '@/lib/adminSession';

export const metadata: Metadata = { title: 'Log in · LeadFlow' };
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  invalid: 'Wrong username or password.',
  disabled: 'Admin is disabled: ADMIN_USER and ADMIN_PASSWORD are not set on the server.'
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams;
  const message = ERRORS[error ?? ''] ?? (adminConfigured() ? null : ERRORS.disabled);

  return (
    <main className="login-wrap">
      <form className="card login-card" method="post" action="/api/admin/login">
        <a className="landing-brand" href="/">
          LeadFlow
        </a>
        <h1 className="login-title">Log in to the leads view</h1>
        <p className="muted small" style={{ margin: '0 0 16px' }}>
          Lead names, emails and phone numbers are behind this login.
        </p>
        {message && (
          <p className="login-error" role="alert">
            {message}
          </p>
        )}
        <input type="hidden" name="next" value={safeNext(next)} />
        <label className="login-label" htmlFor="username">
          Username
        </label>
        <input
          className="login-input"
          id="username"
          name="username"
          autoComplete="username"
          required
          autoFocus
        />
        <label className="login-label" htmlFor="password">
          Password
        </label>
        <input
          className="login-input"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <button className="button primary login-button" type="submit">
          Log in
        </button>
      </form>
    </main>
  );
}
