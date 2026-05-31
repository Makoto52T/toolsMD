import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// DELETE /api/edges/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await pool.execute('DELETE FROM edges WHERE id = ?', [id]);
  return NextResponse.json({ ok: true });
}
