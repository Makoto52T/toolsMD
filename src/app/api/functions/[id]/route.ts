import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// PATCH /api/functions/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const sets: string[] = [];
  const vals: any[] = [];
  if (body.name !== undefined) { sets.push('name = ?'); vals.push(body.name); }
  if (body.description !== undefined) { sets.push('description = ?'); vals.push(body.description); }
  if (body.fn_type !== undefined) { sets.push('fn_type = ?'); vals.push(body.fn_type); }
  if (body.schema !== undefined) { sets.push('`schema` = ?'); vals.push(JSON.stringify(body.schema)); }
  if (sets.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  vals.push(id);
  await pool.query(`UPDATE functions SET ${sets.join(', ')} WHERE id = ?`, vals);
  const [rows] = await pool.query('SELECT * FROM functions WHERE id = ?', [id]);
  return NextResponse.json((rows as any[])[0] || null);
}

// DELETE /api/functions/[id] — cascade delete edges
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM edges WHERE from_function_id = ? OR to_function_id = ?', [id, id]);
    await conn.query('DELETE FROM functions WHERE id = ?', [id]);
    await conn.commit();
    conn.release();
    return NextResponse.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('Delete function failed:', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
