import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import pool from '@/lib/db';

// GET /api/projects/[id]/full
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const [projects] = await pool.query('SELECT * FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
  if (!(projects as any[]).length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const project = (projects as any[])[0];
  const [nodes] = await pool.query('SELECT * FROM nodes WHERE project_id = ? ORDER BY created_at ASC', [id]);
  const [funcs] = await pool.query(
    'SELECT f.* FROM functions f JOIN nodes n ON f.node_id = n.id WHERE n.project_id = ? ORDER BY f.sort_order ASC',
    [id]
  );
  const [edges] = await pool.query('SELECT * FROM edges WHERE project_id = ? ORDER BY created_at ASC', [id]);

  return NextResponse.json({ project, nodes, functions: funcs, edges });
}
