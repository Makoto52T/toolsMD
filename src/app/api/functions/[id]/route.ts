import { NextResponse } from 'next/server';
import pool from '@/lib/db';

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
