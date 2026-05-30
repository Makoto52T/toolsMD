import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// POST /api/projects/[id]/nodes
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { name, x, y, w, h, description, notes } = await req.json();
  const id = uid();
  await pool.query(
    'INSERT INTO nodes (id, project_id, name, description, notes, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, projectId, name || 'New Node', description || null, notes || null, x || 0, y || 0, w || 200, h || 80]
  );
  return NextResponse.json({ id, project_id: projectId, name: name || 'New Node', description: description || null, notes: notes || null, x: x || 0, y: y || 0, w: w || 200, h: h || 80 });
}
