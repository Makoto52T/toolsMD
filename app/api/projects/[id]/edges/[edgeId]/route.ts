import { store } from '@/lib/store';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; edgeId: string }> }) {
  const { id, edgeId } = await params;
  const userId = request.cookies.get('userId')?.value;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = store.getProject(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  store.deleteEdge(id, edgeId);
  return NextResponse.json({ success: true });
}
