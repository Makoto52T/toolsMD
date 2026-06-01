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

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  // Derive redirect_uri from the incoming request origin so it matches what
  // the browser used to start the flow (works for both localhost and prod).
  const redirectUri = `${request.nextUrl.origin}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/?error=oauth_not_configured', request.url));
  }

  try {
    // 1. Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error('Google token exchange failed:', tokenRes.status, detail);
      return NextResponse.redirect(new URL('/?error=token_exchange', request.url));
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token as string | undefined;
    if (!accessToken) {
      return NextResponse.redirect(new URL('/?error=no_access_token', request.url));
    }

    // 2. Fetch real user info with the access token
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      const detail = await userRes.text();
      console.error('Google userinfo failed:', userRes.status, detail);
      return NextResponse.redirect(new URL('/?error=userinfo', request.url));
    }

    const profile = await userRes.json();
    const email = profile.email as string | undefined;
    if (!email) {
      return NextResponse.redirect(new URL('/?error=no_email', request.url));
    }
    const name = (profile.name as string | undefined) || email.split('@')[0];

    // 3. Create or fetch the user in the store
    let user = await store.getUserByEmail(email);
    if (!user) {
      user = await store.createUser(email, name);
    }

    // 4. Set session cookie (userId) and redirect to dashboard.
    //    Mirrors the demo login at app/api/login/route.ts.
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.cookies.set('userId', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 604800,
      path: '/',
    });
    return response;
  } catch (e) {
    console.error('Google OAuth callback error:', e);
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }
}
