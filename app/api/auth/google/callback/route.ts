import { store } from '@/lib/store';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }

  try {
    // Exchange code for token (simplified - in production use proper OAuth library)
    // For now, use demo account with Google ID
    const email = `google-${code.substring(0, 8)}@google.local`;

    let user = store.getUserByEmail(email);
    if (!user) {
      user = store.createUser(email, 'Google User');
    }

    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.cookies.set('userId', user.id, { httpOnly: true, maxAge: 604800 });

    return response;
  } catch (error) {
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }
}
