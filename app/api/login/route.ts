import { store } from '@/lib/store';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { email, name } = await request.json();

  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  let user = await store.getUserByEmail(email);
  if (!user) {
    user = await store.createUser(email, name || email.split('@')[0]);
  }

  const response = NextResponse.json({ user });
  response.cookies.set('userId', user.id, { httpOnly: true, maxAge: 604800 });
  return response;
}

export async function GET(request: NextRequest) {
  const userId = request.cookies.get('userId')?.value;
  if (!userId) {
    return NextResponse.json({ user: null });
  }

  const user = await store.getUser(userId);
  return NextResponse.json({ user });
}
