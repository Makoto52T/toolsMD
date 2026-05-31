import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/get-auth-session';
import pool from '@/lib/db';

// GET /api/projects/[id]/full
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAuthSession();
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

// DELETE /api/projects/[id] — cascade delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Verify ownership
    const [projects] = await conn.query('SELECT id FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
    if (!(projects as any[]).length) {
      await conn.rollback();
      conn.release();
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cascade: edges → functions → nodes → project
    await conn.query('DELETE FROM edges WHERE project_id = ?', [id]);
    await conn.query('DELETE f FROM functions f JOIN nodes n ON f.node_id = n.id WHERE n.project_id = ?', [id]);
    await conn.query('DELETE FROM nodes WHERE project_id = ?', [id]);
    await conn.query('DELETE FROM projects WHERE id = ?', [id]);

    await conn.commit();
    conn.release();
    return NextResponse.json({ success: true });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('Delete project failed:', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
