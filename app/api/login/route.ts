import { store } from '@/lib/store';
import { NextRequest, NextResponse } from 'next/server';

// Demo/email login is disabled. Authentication is Google OAuth only.
// See app/api/auth/google/callback/route.ts for the active login flow.
export async function POST() {
  return NextResponse.json(
    { error: 'Demo login is disabled. Please sign in with Google.' },
    { status: 403 },
  );
}

export async function GET(request: NextRequest) {
  const userId = request.cookies.get('userId')?.value;
  if (!userId) {
    return NextResponse.json({ user: null });
  }

  const user = await store.getUser(userId);
  return NextResponse.json({ user });
}
