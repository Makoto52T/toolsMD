import { store } from '@/lib/store';
import { NextRequest, NextResponse } from 'next/server';

// Templates owned by the current user. These are projects with is_template=1 and
// are intentionally not returned by GET /api/projects (the dashboard list).
export async function GET(request: NextRequest) {
  const userId = request.cookies.get('userId')?.value;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const templates = (await store.getUserTemplates(userId)).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    isPublicTemplate: p.isPublicTemplate,
    nodeCount: p.nodes.length,
    edgeCount: p.edges.length,
    tagCount: p.tags.length,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  return NextResponse.json(templates);
}

// Create a new template project. Mirrors POST /api/projects but forces
// is_template=1 so the new project lands in the Templates section.
export async function POST(request: NextRequest) {
  const userId = request.cookies.get('userId')?.value;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, description } = await request.json();
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
  }

  const project = await store.createProject(userId, name.trim(), description || '', true);
  return NextResponse.json(
    { id: project.id, name: project.name, description: project.description, isTemplate: true },
    { status: 201 },
  );
}
