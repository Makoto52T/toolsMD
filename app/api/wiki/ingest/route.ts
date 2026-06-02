import { store } from '@/lib/store';
import { deepseekChat, hasDeepSeekKey } from '@/lib/deepseek';
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Wiki Ingest: takes raw text, asks DeepSeek to turn it into an Obsidian-style
// wiki page, writes the page to /root/ai-wiki/wiki/<slug>.md, appends a log
// line, and saves a private TMD template owned by the current user that holds
// the raw input (Wiki Source node) and generated output (Wiki Output node).

// File ops touch the local filesystem, so this must run on Node, never Edge.
export const runtime = 'nodejs';

// Base dir is overridable for non-VPS/dev environments; defaults to the live
// ai-wiki repo path on the server.
const WIKI_ROOT = process.env.AI_WIKI_DIR || '/root/ai-wiki';
const WIKI_DIR = path.join(WIKI_ROOT, 'wiki');
const LOG_FILE = path.join(WIKI_ROOT, 'log.md');

// Slugify a title into a safe filename: lowercase, ascii word chars + dashes.
// Falls back to a timestamp slug when the title has no usable ascii (e.g. an
// all-Thai title) so we never write an empty/colliding filename.
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `wiki-${Date.now()}`;
}

const SYSTEM_PROMPT = `คุณคือ AI Wiki writer. แปลง raw content ที่ได้รับเป็น Obsidian wiki page.
กฎ:
- ใช้ภาษาตาม content (ไทยถ้า content เป็นไทย, อังกฤษถ้าเป็นอังกฤษ)
- ขึ้นต้นด้วย YAML frontmatter (--- ... ---) ที่มี tags, date, type
- ใส่บรรทัด backlink: [[../index.md]] | [[../cross.md]] ใต้ heading หลัก
- จัดเนื้อหาเป็น ## sections ที่อ่านง่าย ใช้ table/bullet ตามเหมาะสม
- รักษาข้อมูลสำคัญทั้งหมดจาก raw content ไว้ ห้ามแต่งเติมข้อมูลที่ไม่มี
- ตอบกลับเป็น markdown ของ wiki page เท่านั้น ห้ามมีคำอธิบายอื่นหรือ code fence ครอบ`;

export async function POST(request: NextRequest) {
  const userId = request.cookies.get('userId')?.value;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!hasDeepSeekKey()) {
    return NextResponse.json(
      { error: 'DeepSeek API key not configured on the server' },
      { status: 500 }
    );
  }

  let body: { title?: unknown; rawContent?: unknown; tags?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const rawContent =
    typeof body.rawContent === 'string' ? body.rawContent.trim() : '';
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    : [];

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!rawContent) {
    return NextResponse.json({ error: 'rawContent is required' }, { status: 400 });
  }

  // 1) Transform raw content -> wiki markdown via DeepSeek.
  let wikiContent: string;
  try {
    const tagHint = tags.length
      ? `\n\nหมายเหตุ: topic tags ที่ผู้ใช้กำหนด: ${tags.join(', ')}`
      : '';
    wikiContent = await deepseekChat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Title: ${title}${tagHint}\n\n=== RAW CONTENT ===\n${rawContent}`,
        },
      ],
      { temperature: 0.3, maxTokens: 4096 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: `AI transform failed: ${e?.message || 'unknown error'}` },
      { status: 502 }
    );
  }

  // Strip an accidental ```markdown ... ``` fence if the model wrapped output.
  wikiContent = wikiContent
    .replace(/^\s*```(?:markdown|md)?\s*\n/i, '')
    .replace(/\n```\s*$/i, '')
    .trim();

  // 2) Write wiki page to /root/ai-wiki/wiki/<slug>.md (de-dupe on collision).
  let wikiPath: string;
  try {
    await fs.mkdir(WIKI_DIR, { recursive: true });
    const slug = slugify(title);
    let filename = `${slug}.md`;
    let target = path.join(WIKI_DIR, filename);
    // Avoid clobbering an existing page with the same slug.
    let n = 2;
    // eslint-disable-next-line no-await-in-loop
    while (await fileExists(target)) {
      filename = `${slug}-${n}.md`;
      target = path.join(WIKI_DIR, filename);
      n += 1;
    }
    await fs.writeFile(target, wikiContent + '\n', 'utf8');
    wikiPath = target;

    // 3) Append a log line.
    const date = new Date().toISOString().slice(0, 10);
    const tagSuffix = tags.length ? ` [${tags.join(', ')}]` : '';
    await fs.appendFile(
      LOG_FILE,
      `${date} — Wiki Ingest: wiki/${filename} — ${title}${tagSuffix}\n`,
      'utf8'
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: `Failed to write wiki file: ${e?.message || 'unknown error'}` },
      { status: 500 }
    );
  }

  // 4) Save a private TMD template for this user holding raw input + output.
  let templateId: string | null = null;
  try {
    const project = await store.createProject(
      userId,
      title,
      `Wiki Ingest template — ${tags.join(', ') || 'no tags'}`,
      true // is_template
    );
    templateId = project.id;

    // Wiki Source: a server node whose description carries the raw content.
    await store.addNode(project.id, {
      type: 'server',
      name: 'Wiki Source',
      description: rawContent,
      positionX: 120,
      positionY: 120,
      config: { serverRole: 'frontend' },
    });

    // Wiki Output: a function node whose code returns the generated wiki page.
    // Stored as a string literal so the node is a self-contained record of the
    // transformed output (and trivially "executes" to return it).
    await store.addNode(project.id, {
      type: 'function',
      name: 'Wiki Output',
      description: `Generated wiki page (saved to wiki/${path.basename(wikiPath)})`,
      positionX: 460,
      positionY: 120,
      config: { code: `return ${JSON.stringify(wikiContent)};` },
    });
  } catch (e: any) {
    // The wiki page already persisted; report partial success rather than 500
    // so the user still gets their wiki output.
    return NextResponse.json(
      {
        wikiPath,
        wikiContent,
        templateId: null,
        warning: `Wiki saved but template creation failed: ${e?.message || 'unknown'}`,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({ wikiPath, wikiContent, templateId }, { status: 200 });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
