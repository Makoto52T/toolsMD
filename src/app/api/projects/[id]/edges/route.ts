import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// POST /api/projects/[id]/edges
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { from_node_id, to_node_id, from_function_id, to_function_id, label } = await req.json();
  if (!from_node_id || !to_node_id) return NextResponse.json({ error: 'from_node_id and to_node_id required' }, { status: 400 });

  // Prevent connecting a function to itself (same-node connections are allowed)
  if (from_function_id && to_function_id && from_function_id === to_function_id) {
    return NextResponse.json({ error: 'SELF_REFERENCE', message: 'Cannot connect function to itself' }, { status: 400 });
  }

  // Duplicate check: function-level edges are unique per (from_function_id, to_node_id, to_function_id)
  // Node-level edges are unique per (from_node_id, to_node_id) when no function IDs
  let dupQuery: string;
  let dupParams: any[];
  if (from_function_id) {
    dupQuery = 'SELECT id FROM edges WHERE project_id = ? AND from_node_id = ? AND to_node_id = ? AND from_function_id = ? AND to_function_id <=> ?';
    dupParams = [projectId, from_node_id, to_node_id, from_function_id, to_function_id || null];
  } else {
    dupQuery = 'SELECT id FROM edges WHERE project_id = ? AND from_node_id = ? AND to_node_id = ? AND from_function_id IS NULL AND to_function_id IS NULL';
    dupParams = [projectId, from_node_id, to_node_id];
  }

  const [dup] = await pool.query(dupQuery, dupParams);
  if ((dup as any[]).length) return NextResponse.json({ error: 'DUPLICATE' }, { status: 409 });

  const id = uid();
  await pool.query(
    'INSERT INTO edges (id, project_id, from_node_id, to_node_id, from_function_id, to_function_id, label) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, projectId, from_node_id, to_node_id, from_function_id || null, to_function_id || null, label || '']
  );
  return NextResponse.json({ id, from_node_id, to_node_id, from_function_id: from_function_id || null, to_function_id: to_function_id || null, label: label || '' });
}
