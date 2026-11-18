import { NextResponse, type NextRequest } from 'next/server';

// HTTP Basic Auth in front of the mock CRM. /admin shows lead names, emails and
// phone numbers, so a public deploy must not serve it without credentials.
export const config = { matcher: ['/admin', '/admin/:path*'] };

// Compares every character so the time taken doesn't reveal how much matched.
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function credentialsMatch(header: string, user: string, pass: string): boolean {
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }
  const sep = decoded.indexOf(':');
  if (sep === -1) return false;
  const userOk = safeEqual(decoded.slice(0, sep), user);
  const passOk = safeEqual(decoded.slice(sep + 1), pass);
  return userOk && passOk;
}

export function middleware(req: NextRequest) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;

  if (!user || !pass) {
    // Fail closed outside local development.
    if (process.env.NODE_ENV === 'development') return NextResponse.next();
    return new NextResponse('Admin is disabled: set ADMIN_USER and ADMIN_PASSWORD.', { status: 503 });
  }

  if (credentialsMatch(req.headers.get('authorization') ?? '', user, pass)) {
    return NextResponse.next();
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="LeadFlow admin", charset="UTF-8"' }
  });
}
