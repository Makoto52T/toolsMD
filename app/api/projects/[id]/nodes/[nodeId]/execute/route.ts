import { store } from '@/lib/store';
import { executeSingleNode } from '@/lib/node-executor';
import { NextRequest, NextResponse } from 'next/server';

// Execute a single node in isolation and return its result (status, output, and
// — for http-request nodes — full HTTP metadata: status code, headers, timing).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
) {
  const { id, nodeId } = await params;
  const userId = request.cookies.get('userId')?.value;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await store.getProject(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const node = project.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 });
  }

  const result = await executeSingleNode(node, project.tags);
  return NextResponse.json({ result });
}
