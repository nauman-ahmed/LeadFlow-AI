import { NextResponse } from 'next/server';
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  adminConfigured,
  checkCredentials,
  createSessionToken,
  safeNext
} from '@/lib/adminSession';

// Form POST from /login. Redirects (303) so the browser lands on a normal GET page.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const user = String(form?.get('username') ?? '');
  const pass = String(form?.get('password') ?? '');
  const next = safeNext(String(form?.get('next') ?? ''));

  if (!adminConfigured() || !checkCredentials(user, pass)) {
    const back = new URL('/login', req.url);
    back.searchParams.set('error', adminConfigured() ? 'invalid' : 'disabled');
    back.searchParams.set('next', next);
    return NextResponse.redirect(back, 303);
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(ADMIN_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_SECONDS
  });
  return res;
}
