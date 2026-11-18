import { NextResponse } from 'next/server';
import { ADMIN_COOKIE } from '@/lib/adminSession';

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
