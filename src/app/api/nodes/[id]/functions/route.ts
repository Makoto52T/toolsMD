import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkDuplicate, DuplicateResult } from '@/lib/ai';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// POST /api/nodes/[id]/functions
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: nodeId } = await params;
  const { name, force } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  // Exact duplicate check (case-insensitive)
  const [dup] = await pool.query(
    'SELECT id FROM functions WHERE node_id = ? AND LOWER(name) = LOWER(?)',
    [nodeId, name.trim()]
  );
  if ((dup as any[]).length) {
    return NextResponse.json({ error: 'DUPLICATE', message: `"${name.trim()}" already exists` }, { status: 409 });
  }

  // Semantic duplicate check (if not forced)
  if (!force) {
    const [rows] = await pool.query('SELECT name FROM functions WHERE node_id = ?', [nodeId]);
    const existingNames = (rows as any[]).map((r: any) => r.name);

    if (existingNames.length > 0) {
      const results = await checkDuplicate(name.trim(), existingNames);
      const highConfidenceDups = results.filter(r => r.duplicate && r.confidence > 0.7);

      if (highConfidenceDups.length > 0) {
        return NextResponse.json(
          {
            error: 'SEMANTIC_DUPLICATE',
            message: `"${name.trim()}" may duplicate: ${highConfidenceDups.map(d => `"${d.name}"`).join(', ')}`,
            duplicates: highConfidenceDups.map(d => ({ name: d.name, confidence: d.confidence, reason: d.reason })),
          },
          { status: 409 }
        );
      }
    }
  }

  // Insert
  const [mx] = await pool.query('SELECT MAX(sort_order) as mx FROM functions WHERE node_id = ?', [nodeId]);
  const sort = ((mx as any[])[0]?.mx || 0) + 1;
  const id = uid();
  await pool.query('INSERT INTO functions (id, node_id, name, sort_order) VALUES (?, ?, ?, ?)', [id, nodeId, name.trim(), sort]);
  return NextResponse.json({ id, node_id: nodeId, name: name.trim(), icon: '⚙️', category: 'Core', sort_order: sort });
}
