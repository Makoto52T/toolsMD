import { store } from '@/lib/store';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const userId = request.cookies.get('userId')?.value;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projects = (await store.getUserProjects(userId)).map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get('userId')?.value;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, description, isTemplate } = await request.json();
  const project = await store.createProject(userId, name, description || '', Boolean(isTemplate));

  return NextResponse.json(
    {
      id: project.id,
      name: project.name,
      description: project.description,
      isTemplate: project.isTemplate,
    },
    { status: 201 },
  );
}
