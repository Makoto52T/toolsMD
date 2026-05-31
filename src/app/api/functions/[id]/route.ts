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
  if (sets.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  vals.push(id);
  await pool.query(`UPDATE functions SET ${sets.join(', ')} WHERE id = ?`, vals);
  const [rows] = await pool.query('SELECT * FROM functions WHERE id = ?', [id]);
  return NextResponse.json((rows as any[])[0] || null);
}

// DELETE /api/functions/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Delete edges that reference this function
  await pool.query('DELETE FROM edges WHERE from_function_id = ? OR to_function_id = ?', [id, id]);
  await pool.query('DELETE FROM functions WHERE id = ?', [id]);
  return NextResponse.json({ ok: true });
}
