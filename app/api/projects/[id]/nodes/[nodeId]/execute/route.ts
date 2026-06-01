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

  const { result, tags, missingBindings, tagsChanged } = await executeSingleNode(
    node,
    project.tags,
  );

  // Persist tags written by output bindings (success/2xx only — executeSingleNode
  // already guards that). updateProjectTags returns the server-canonical tags.
  let finalTags = tags;
  if (tagsChanged) {
    const updated = await store.updateProjectTags(id, tags);
    if (updated) finalTags = updated.tags;
  }

  return NextResponse.json({ result, tags: finalTags, missingBindings });
}
