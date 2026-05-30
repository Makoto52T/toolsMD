import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import pool from '@/lib/db';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// GET /api/projects — list user's projects
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const [rows] = await pool.query('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC', [userId]);
  return NextResponse.json(rows);
}

// POST /api/projects — create project
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  const id = uid();
  await pool.query('INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)', [id, userId, name.trim()]);
  return NextResponse.json({ id, name: name.trim() });
}
