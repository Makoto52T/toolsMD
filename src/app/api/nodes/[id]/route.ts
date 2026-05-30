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

  if (!updates.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

  values.push(id);
  await pool.query(`UPDATE nodes SET ${updates.join(', ')} WHERE id = ?`, values);
  return NextResponse.json({ success: true });
}
