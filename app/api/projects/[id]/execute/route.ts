import { store } from '@/lib/store';
import { executeWorkflow } from '@/lib/node-executor';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = request.cookies.get('userId')?.value;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const project = await store.getProject(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { results, tags, missingBindings, tagsChanged } = await executeWorkflow(
    project.nodes,
    project.edges,
    project.tags,
  );

  // Persist tags written by output bindings during the run.
  let finalTags = tags;
  if (tagsChanged) {
    const updated = await store.updateProjectTags(id, tags);
    if (updated) finalTags = updated.tags;
  }

  return NextResponse.json({ results, tags: finalTags, missingBindings });
}
