import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkDuplicate, FunctionInfo } from '@/lib/ai';

// POST /api/nodes/[id]/functions/check-duplicate
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: nodeId } = await params;
  const { name, description } = await req.json();

  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  // Fetch all existing functions with their descriptions in this node
  const [rows] = await pool.query(
    'SELECT name, description FROM functions WHERE node_id = ?',
    [nodeId]
  );
  const existingFunctions: FunctionInfo[] = (rows as any[]).map((r: any) => ({
    name: r.name,
    description: r.description || undefined,
  }));

  if (existingFunctions.length === 0) {
    return NextResponse.json({ duplicates: [] });
  }

  const results = await checkDuplicate(name.trim(), description || undefined, existingFunctions);

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
