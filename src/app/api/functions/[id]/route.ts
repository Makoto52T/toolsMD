import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// DELETE /api/functions/[id]
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await pool.query('DELETE FROM functions WHERE id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}
