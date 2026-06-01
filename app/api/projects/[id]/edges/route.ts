import { store } from '@/lib/store';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = request.cookies.get('userId')?.value;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await store.getProject(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(project.edges);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = request.cookies.get('userId')?.value;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await store.getProject(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { sourceNodeId, targetNodeId, label } = await request.json();
  const edge = await store.addEdge(id, sourceNodeId, targetNodeId, label);
  if (!edge) {
    return NextResponse.json(
      { error: 'Both source and target must be existing nodes in this project' },
      { status: 400 },
    );
  }

  return NextResponse.json(edge, { status: 201 });
}
