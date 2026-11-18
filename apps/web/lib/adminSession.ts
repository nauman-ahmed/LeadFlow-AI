// Admin login session: a signed, expiring cookie checked by middleware.
// Uses Web Crypto so the same code runs in middleware (edge) and route handlers (node).

export const ADMIN_COOKIE = 'lf_admin';
export const ADMIN_SESSION_SECONDS = 60 * 60 * 24 * 7; // 7 days

function credentials(): { user: string; pass: string } | null {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  return user && pass ? { user, pass } : null;
}

export function adminConfigured(): boolean {
  return credentials() !== null;
}

/** Compares every character so the time taken doesn't reveal how much matched. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function checkCredentials(user: string, pass: string): boolean {
  const c = credentials();
  if (!c) return false;
  const userOk = safeEqual(user, c.user);
  const passOk = safeEqual(pass, c.pass);
  return userOk && passOk;
}

async function sign(payload: string): Promise<string> {
  const c = credentials();
  if (!c) throw new Error('admin credentials not configured');
  // Keyed by the password, so changing ADMIN_PASSWORD logs everyone out.
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`leadflow-admin:${c.user}:${c.pass}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cookie value: `<expiry unix seconds>.<hmac>`. */
export async function createSessionToken(nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const expires = String(nowSeconds + ADMIN_SESSION_SECONDS);
  return `${expires}.${await sign(expires)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  if (!token || !adminConfigured()) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const expires = token.slice(0, dot);
  if (!/^\d+$/.test(expires) || Number(expires) < nowSeconds) return false;
  return safeEqual(token.slice(dot + 1), await sign(expires));
}

/** Only allow redirects back into the admin area. */
export function safeNext(next: string | null | undefined): string {
  return next && /^\/admin(\/|$|\?)/.test(next) ? next : '/admin';
}
