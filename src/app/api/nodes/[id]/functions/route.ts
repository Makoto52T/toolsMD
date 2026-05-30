import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// POST /api/nodes/[id]/functions
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const [dup] = await pool.query('SELECT id FROM functions WHERE node_id = ? AND LOWER(name) = LOWER(?)', [params.id, name.trim()]);
  if ((dup as any[]).length) return NextResponse.json({ error: 'DUPLICATE', message: `"${name.trim()}" already exists` }, { status: 409 });

  const [mx] = await pool.query('SELECT MAX(sort_order) as mx FROM functions WHERE node_id = ?', [params.id]);
  const sort = ((mx as any[])[0]?.mx || 0) + 1;
  const id = uid();
  await pool.query('INSERT INTO functions (id, node_id, name, sort_order) VALUES (?, ?, ?, ?)', [id, params.id, name.trim(), sort]);
  return NextResponse.json({ id, node_id: params.id, name: name.trim(), icon: '⚙️', category: 'Core', sort_order: sort });
}
