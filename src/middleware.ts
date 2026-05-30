import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const adminHeader = req.headers.get('x-admin-key');
  const adminKey = process.env.ADMIN_SECRET_KEY;

  // Admin bypass: if x-admin-key header matches, allow access without session
  if (adminHeader && adminKey && adminHeader === adminKey) {
    // Pass through — API routes and pages will check session
    // We'll handle the bypass in the auth check itself
    const response = NextResponse.next();
    response.headers.set('x-admin-authenticated', '1');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
