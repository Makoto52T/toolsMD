import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// POST /api/projects/[id]/edges
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { from_node_id, to_node_id, from_function_id, to_function_id, label } = await req.json();
  if (!from_node_id || !to_node_id) return NextResponse.json({ error: 'from_node_id and to_node_id required' }, { status: 400 });

  const [dup] = await pool.query(
    'SELECT id FROM edges WHERE project_id = ? AND from_node_id = ? AND to_node_id = ?',
    [params.id, from_node_id, to_node_id]
  );
  if ((dup as any[]).length) return NextResponse.json({ error: 'DUPLICATE' }, { status: 409 });

  const id = uid();
  await pool.query(
    'INSERT INTO edges (id, project_id, from_node_id, to_node_id, from_function_id, to_function_id, label) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, params.id, from_node_id, to_node_id, from_function_id || null, to_function_id || null, label || '']
  );
  return NextResponse.json({ id, from_node_id, to_node_id, from_function_id: from_function_id || null, to_function_id: to_function_id || null, label: label || '' });
}
