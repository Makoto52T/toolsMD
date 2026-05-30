import { NextRequest, NextResponse } from 'next/server';

// This endpoint uses NextAuth's built-in credentials sign-in flow.
// Call it with { secret: "ADMIN_SECRET_KEY" } — it returns session cookie + token.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { secret } = body;

    const adminKey = process.env.ADMIN_SECRET_KEY;
    if (!adminKey) {
      return NextResponse.json({ error: 'ADMIN_SECRET_KEY not configured' }, { status: 500 });
    }
    if (!secret || secret !== adminKey) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }

    // Get CSRF token (required by NextAuth for credentials sign-in)
    const csrfRes = await fetch(`${req.nextUrl.origin}/api/auth/csrf`);
    const csrfData = await csrfRes.json();
    const csrfToken = csrfData.csrfToken;
    if (!csrfToken) {
      return NextResponse.json({ error: 'Failed to get CSRF token' }, { status: 500 });
    }

    // Call NextAuth credentials sign-in
    const signInRes = await fetch(`${req.nextUrl.origin}/api/auth/callback/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': csrfRes.headers.get('set-cookie') || '',
      },
      body: new URLSearchParams({
        csrfToken,
        secret: adminKey,
        json: 'true',
      }),
      redirect: 'manual',
    });

    // Get session cookie from sign-in response
    const setCookieHeader = signInRes.headers.get('set-cookie');
    if (!setCookieHeader) {
      return NextResponse.json({ error: 'No session cookie returned', debug: await signInRes.text() }, { status: 500 });
    }

    // Extract token from cookie for reference
    const cookieMatch = setCookieHeader.match(/session-token=([^;]+)/);
    const token = cookieMatch ? cookieMatch[1] : '';

    const response = NextResponse.json({ ok: true, token });
    response.headers.set('Set-Cookie', setCookieHeader);

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
