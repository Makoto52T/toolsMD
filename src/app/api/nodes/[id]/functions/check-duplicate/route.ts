import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkDuplicate } from '@/lib/ai';

// POST /api/nodes/[id]/functions/check-duplicate
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: nodeId } = await params;
  const { name } = await req.json();

  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  // Fetch all existing function names in this node
  const [rows] = await pool.query(
    'SELECT name FROM functions WHERE node_id = ?',
    [nodeId]
  );
  const existingNames = (rows as any[]).map((r: any) => r.name);

  if (existingNames.length === 0) {
    return NextResponse.json({ duplicates: [] });
  }

  const results = await checkDuplicate(name.trim(), existingNames);

  // Filter to only duplicates with confidence > 0
  const duplicates = results
    .filter(r => r.duplicate && r.confidence > 0)
    .map(r => ({
      name: r.name,
      confidence: r.confidence,
      reason: r.reason,
    }));

  return NextResponse.json({ duplicates });
}
