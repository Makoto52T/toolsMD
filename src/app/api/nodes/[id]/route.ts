import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// PATCH /api/nodes/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const updates: string[] = [];
  const values: any[] = [];

  if (body.x !== undefined) { updates.push('x = ?'); values.push(body.x); }
  if (body.y !== undefined) { updates.push('y = ?'); values.push(body.y); }
  if (body.w !== undefined) { updates.push('w = ?'); values.push(body.w); }
  if (body.h !== undefined) { updates.push('h = ?'); values.push(body.h); }
  if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
  if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
  if (body.notes !== undefined) { updates.push('notes = ?'); values.push(body.notes); }

  if (!updates.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

  values.push(id);
  await pool.query(`UPDATE nodes SET ${updates.join(', ')} WHERE id = ?`, values);
  return NextResponse.json({ success: true });
}

// DELETE /api/nodes/[id] — cascade delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM edges WHERE from_node_id = ? OR to_node_id = ?', [id, id]);
    await conn.query('DELETE FROM functions WHERE node_id = ?', [id]);
    await conn.query('DELETE FROM nodes WHERE id = ?', [id]);
    await conn.commit();
    conn.release();
    return NextResponse.json({ success: true });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('Delete node failed:', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
