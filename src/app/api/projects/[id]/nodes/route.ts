import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// POST /api/projects/[id]/nodes
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { name, x, y, w, h } = await req.json();
  const id = uid();
  await pool.query(
    'INSERT INTO nodes (id, project_id, name, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, params.id, name || 'New Node', x || 0, y || 0, w || 200, h || 80]
  );
  return NextResponse.json({ id, project_id: params.id, name: name || 'New Node', x: x || 0, y: y || 0, w: w || 200, h: h || 80 });
}
