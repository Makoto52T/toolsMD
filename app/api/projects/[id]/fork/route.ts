import { store } from '@/lib/store';
import { NextRequest, NextResponse } from 'next/server';

// Fork a project/template into a fresh project owned by the current user.
// The source must be either a template (usable by its owner) or a project the
// caller owns — forking an arbitrary user's private project is not allowed.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = request.cookies.get('userId')?.value;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const source = await store.getProject(id);
  if (!source) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Authorization: you may fork (a) your own projects/templates, or (b) any
  // public tutorial template (is_public_template=1). A *private* template owned
  // by someone else stays private — a non-owner gets a 404 to avoid leaking
  // existence.
  if (source.userId !== userId && !source.isPublicTemplate) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let name: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (body && typeof body.name === 'string' && body.name.trim()) name = body.name.trim();
  } catch {
    // No body is fine — default name is derived from the source.
  }

  const forked = await store.forkProject(id, userId, name);
  if (!forked) {
    return NextResponse.json({ error: 'Failed to fork project' }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: forked.id,
      name: forked.name,
      description: forked.description,
      nodeCount: forked.nodes.length,
      edgeCount: forked.edges.length,
      tagCount: forked.tags.length,
    },
    { status: 201 },
  );
}
