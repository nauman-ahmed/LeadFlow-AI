import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, adminConfigured, checkCredentials, verifySessionToken } from './lib/adminSession';

// /admin lists lead names, emails and phone numbers. It needs a login session
// (cookie set by /login). HTTP Basic Auth still works for scripts and curl.
export const config = { matcher: ['/admin', '/admin/:path*'] };

function basicAuthOk(header: string): boolean {
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }
  const sep = decoded.indexOf(':');
  return sep !== -1 && checkCredentials(decoded.slice(0, sep), decoded.slice(sep + 1));
}

export async function middleware(req: NextRequest) {
  if (!adminConfigured()) {
    // Fail closed outside local development.
    if (process.env.NODE_ENV === 'development') return NextResponse.next();
    return new NextResponse('Admin is disabled: set ADMIN_USER and ADMIN_PASSWORD.', { status: 503 });
  }

  if (await verifySessionToken(req.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();
  if (basicAuthOk(req.headers.get('authorization') ?? '')) return NextResponse.next();

  const login = new URL('/login', req.url);
  login.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}
