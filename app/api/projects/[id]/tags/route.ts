import { store, type Tag } from '@/lib/store';
import { detectTagType, isTagType } from '@/lib/path-utils';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = request.cookies.get('userId')?.value;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await store.getProject(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(project.tags);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = request.cookies.get('userId')?.value;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify ownership BEFORE mutating (see IDOR fix in PUT /projects/[id]).
  const existing = await store.getProject(id);
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawTags = (payload as { tags?: unknown })?.tags;
  if (!Array.isArray(rawTags)) {
    return NextResponse.json({ error: 'tags must be an array' }, { status: 400 });
  }

  const seenKeys = new Set<string>();
  const tags: Tag[] = [];
  for (const raw of rawTags) {
    if (raw == null || typeof raw !== 'object') {
      return NextResponse.json({ error: 'Each tag must be an object' }, { status: 400 });
    }
    const key = typeof (raw as any).key === 'string' ? (raw as any).key.trim() : '';
    if (!key) {
      return NextResponse.json({ error: 'Tag key cannot be empty' }, { status: 400 });
    }
    if (seenKeys.has(key)) {
      return NextResponse.json({ error: `Duplicate tag key: ${key}` }, { status: 400 });
    }
    seenKeys.add(key);
    const value = (raw as any).value == null ? '' : String((raw as any).value);
    const tagId = typeof (raw as any).id === 'string' && (raw as any).id ? (raw as any).id : randomUUID();
    // Validate type if present; reject unknown values rather than silently
    // coercing. Absent type → auto-detect from the value (lazy migrate path).
    const rawType = (raw as any).type;
    if (rawType != null && !isTagType(rawType)) {
      return NextResponse.json({ error: `Invalid tag type: ${rawType}` }, { status: 400 });
    }
    const type = isTagType(rawType) ? rawType : detectTagType(value);
    tags.push({ id: tagId, key, value, type });
  }

  const project = await store.updateProjectTags(id, tags);
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(project.tags);
}
