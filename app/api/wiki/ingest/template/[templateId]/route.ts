import { store } from '@/lib/store';
import { NextRequest, NextResponse } from 'next/server';

// Delete ONLY the TMD project/template that Wiki Ingest created. The wiki page
// in ai-wiki/ is intentionally left untouched — this endpoint never reads or
// mutates the filesystem / GitHub mirror.
export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await params;
  const userId = request.cookies.get('userId')?.value;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify ownership BEFORE deleting. Mirror the projects DELETE route: a 404
  // (rather than 403) avoids leaking the existence of someone else's project.
  const project = await store.getProject(templateId);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await store.deleteProject(templateId);
  return NextResponse.json({ success: true });
}
