import { store } from '@/lib/store';
import { deepseekChat, hasDeepSeekKey } from '@/lib/deepseek';
import { detectTagType, isTagType, type TagType } from '@/lib/path-utils';
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// Wiki Ingest: takes raw text and runs a 3-call AI pipeline:
//   1) Analyze the content (summary + whether it's enough to draw an
//      architecture diagram + search queries to fill the gaps).
//   2) Optionally web-search (Tavily) to gather extra context.
//   3) Generate an Obsidian wiki page AND a TMD project schema
//      (tags / nodes / edges) for a visual workflow diagram.
// It then writes the wiki page (local FS on the VPS, or via the GitHub
// Contents API on Vercel), appends a log line, and — when requested —
// builds a real TMD project (not just a template) from the schema.

// File ops touch the local filesystem, so this must run on Node, never Edge.
export const runtime = 'nodejs';
// The pipeline makes up to 3 sequential AI calls + web search + N store writes,
// which can exceed the default serverless budget on a large input.
export const maxDuration = 300;

// Two write backends:
//  - VPS mode: AI_WIKI_DIR is set -> write to the local ai-wiki checkout.
//  - Vercel mode: filesystem is read-only -> commit straight to the
//    Makoto52T/ai-wiki repo via the GitHub Contents API.
const AI_WIKI_DIR = process.env.AI_WIKI_DIR;
const WIKI_ROOT = AI_WIKI_DIR || '/root/ai-wiki';
const WIKI_DIR = path.join(WIKI_ROOT, 'wiki');
const LOG_FILE = path.join(WIKI_ROOT, 'log.md');

// GitHub Contents API target for Vercel mode.
const GH_REPO = 'Makoto52T/ai-wiki';
const GH_BRANCH = 'main';
const GH_API = 'https://api.github.com';

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

// Node types the canvas understands. Anything the model returns outside this
// set is coerced to 'function' so a bad label never produces an unrenderable
// node (the data layer would accept any string).
const NODE_TYPES = new Set([
  'function',
  'http-request',
  'puppeteer',
  'server',
  'sub-project',
]);
function coerceNodeType(t: unknown): import('@/lib/store').Node['type'] {
  return typeof t === 'string' && NODE_TYPES.has(t)
    ? (t as import('@/lib/store').Node['type'])
    : 'function';
}

// ---------------------------------------------------------------------------
// Web search (Tavily) — optional. No key => returns '' and the pipeline skips
// the search step gracefully.
// ---------------------------------------------------------------------------
async function searchWeb(queries: string[]): Promise<string> {
  const key = process.env.TAVILY_API_KEY;
  if (!key || queries.length === 0) return '';
  const results = await Promise.all(
    queries.map((q) =>
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: key,
          query: q,
          max_results: 3,
          search_depth: 'basic',
        }),
      })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        // One failed query shouldn't sink the whole search.
        .catch(() => ({ results: [] }))
    )
  );
  return results
    .flatMap((r: any) => (Array.isArray(r?.results) ? r.results : []))
    .map((r: any) => `## ${r.title}\n${r.content}`)
    .join('\n\n');
}

// Pull the first balanced JSON object/array out of a model reply, tolerating a
// ```json fence or surrounding prose. Returns null if no JSON is found.
function extractJson(text: string): any | null {
  let s = text.trim();
  // Strip a ```json ... ``` fence if present.
  const fence = s.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
  if (fence) s = fence[1].trim();
  // Otherwise slice from the first { to the last } (objects only here).
  if (!s.startsWith('{') && !s.startsWith('[')) {
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first !== -1 && last > first) s = s.slice(first, last + 1);
  }
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const SYSTEM_WIKI = `คุณคือ AI Wiki writer. แปลง raw content ที่ได้รับเป็น Obsidian wiki page.
กฎ:
- ใช้ภาษาตาม content (ไทยถ้า content เป็นไทย, อังกฤษถ้าเป็นอังกฤษ)
- ขึ้นต้นด้วย YAML frontmatter (--- ... ---) ที่มี tags, date, type
- ใส่บรรทัด backlink: [[../index.md]] | [[../cross.md]] ใต้ heading หลัก
- จัดเนื้อหาเป็น ## sections ที่อ่านง่าย ใช้ table/bullet ตามเหมาะสม
- รักษาข้อมูลสำคัญทั้งหมดจาก raw content ไว้ ห้ามแต่งเติมข้อมูลที่ไม่มี`;

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

  let body: {
    title?: unknown;
    rawContent?: unknown;
    tags?: unknown;
    webSearch?: unknown;
    autoProject?: unknown;
    projectName?: unknown;
  };
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
  // Both default ON: the UI checkboxes are on by default.
  const wantWebSearch = body.webSearch !== false;
  const wantAutoProject = body.autoProject !== false;
  const projectName =
    typeof body.projectName === 'string' && body.projectName.trim()
      ? body.projectName.trim()
      : title;

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!rawContent) {
    return NextResponse.json({ error: 'rawContent is required' }, { status: 400 });
  }

  const tagHint = tags.length
    ? `\n\nหมายเหตุ: topic tags ที่ผู้ใช้กำหนด: ${tags.join(', ')}`
    : '';

  // --- Call 1: analyze sufficiency + plan search ---------------------------
  let summary = '';
  let searchQueries: string[] = [];
  try {
    const analyzeRaw = await deepseekChat(
      [
        {
          role: 'system',
          content:
            'คุณคือ analyst. ตอบกลับเป็น JSON ที่ valid เท่านั้น ห้ามมีข้อความอื่น',
        },
        {
          role: 'user',
          content: `วิเคราะห์ content นี้:
1. content อธิบายอะไร? (1-2 ประโยค)
2. content เพียงพอสำหรับสร้าง architecture diagram หรือไม่?
3. ถ้าไม่พอ ระบุ 2-3 search queries เพื่อหาข้อมูลเพิ่ม

ตอบ JSON: {"summary": string, "sufficient": boolean, "searchQueries": string[]}

=== CONTENT ===
${rawContent}${tagHint}`,
        },
      ],
      { temperature: 0.2, maxTokens: 1024 }
    );
    const parsed = extractJson(analyzeRaw);
    if (parsed && typeof parsed === 'object') {
      summary = typeof parsed.summary === 'string' ? parsed.summary : '';
      const sufficient = parsed.sufficient !== false;
      if (!sufficient && Array.isArray(parsed.searchQueries)) {
        searchQueries = parsed.searchQueries
          .filter((q: unknown): q is string => typeof q === 'string' && q.trim() !== '')
          .slice(0, 3);
      }
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: `AI analyze failed: ${e?.message || 'unknown error'}` },
      { status: 502 }
    );
  }

  // --- Call 2 (conditional): web search -----------------------------------
  let webContext = '';
  if (wantWebSearch && searchQueries.length > 0) {
    try {
      webContext = await searchWeb(searchQueries);
    } catch {
      // Search is best-effort; carry on with whatever context we have.
      webContext = '';
    }
  }

  // --- Call 3: generate wiki page + TMD project schema --------------------
  let wikiContent = '';
  let schema: ProjectSchema | null = null;
  try {
    const webBlock = webContext
      ? `\n\n=== WEB CONTEXT (ข้อมูลเสริมจาก internet) ===\n${webContext}`
      : '';
    const genRaw = await deepseekChat(
      [
        {
          role: 'system',
          content: `${SYSTEM_WIKI}

นอกจาก wiki page แล้ว ให้สร้าง TMD project schema สำหรับ visual workflow diagram ด้วย
- node.type ต้องเป็นหนึ่งใน: "http-request" | "function" | "puppeteer" | "server"
- tag.type ต้องเป็นหนึ่งใน: "domain" | "generic" | "pathname" | "param" | "body"
- positionX/positionY: วาง node เป็นแถวซ้าย->ขวา เว้นระยะ ~220px (x: 120, 360, 600, ...), y ~160
- edge.sourceName/targetName ต้องตรงกับ node.name เป๊ะ ๆ
- ตอบกลับเป็น JSON object เท่านั้น ห้ามมี code fence หรือข้อความอื่น`,
        },
        {
          role: 'user',
          content: `จาก content + web context นี้ สร้าง:
1. wiki page (Obsidian markdown format)
2. TMD project schema สำหรับ visual workflow diagram

Return JSON:
{
  "wikiContent": string,
  "project": {
    "name": string,
    "description": string,
    "tags": [{"key": string, "value": string, "type": "domain"|"generic"|"pathname"|"param"|"body"}],
    "nodes": [{"name": string, "type": "http-request"|"function"|"puppeteer"|"server", "description": string, "positionX": number, "positionY": number, "config": {}}],
    "edges": [{"sourceName": string, "targetName": string, "label": string}]
  }
}

Title: ${title}${tagHint}

=== RAW CONTENT ===
${rawContent}${webBlock}`,
        },
      ],
      { temperature: 0.3, maxTokens: 6000 }
    );
    const parsed = extractJson(genRaw);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('AI did not return parseable JSON');
    }
    wikiContent =
      typeof parsed.wikiContent === 'string' ? parsed.wikiContent : '';
    schema = normalizeSchema(parsed.project, projectName);
  } catch (e: any) {
    return NextResponse.json(
      { error: `AI generate failed: ${e?.message || 'unknown error'}` },
      { status: 502 }
    );
  }

  // Strip an accidental ```markdown fence if the model wrapped wikiContent.
  wikiContent = wikiContent
    .replace(/^\s*```(?:markdown|md)?\s*\n/i, '')
    .replace(/\n```\s*$/i, '')
    .trim();
  if (!wikiContent) {
    return NextResponse.json(
      { error: 'AI returned an empty wiki page' },
      { status: 502 }
    );
  }

  // --- Persist the wiki page + log line ------------------------------------
  let wikiPath: string;
  const date = new Date().toISOString().slice(0, 10);
  const tagSuffix = tags.length ? ` [${tags.join(', ')}]` : '';
  try {
    if (AI_WIKI_DIR) {
      wikiPath = await writeWikiToDisk(title, wikiContent, date, tagSuffix);
    } else {
      wikiPath = await writeWikiToGitHub(title, wikiContent, date, tagSuffix);
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: `Failed to write wiki file: ${e?.message || 'unknown error'}` },
      { status: 500 }
    );
  }

  // --- Build a real TMD project from the schema (when requested) -----------
  let projectId: string | null = null;
  let projectWarning: string | undefined;
  if (wantAutoProject && schema) {
    try {
      projectId = await buildProject(userId, schema, wikiPath);
    } catch (e: any) {
      // The wiki already persisted; report partial success.
      projectWarning = `Wiki saved but project creation failed: ${e?.message || 'unknown'}`;
    }
  }

  return NextResponse.json(
    {
      wikiPath,
      wikiContent,
      projectId,
      summary,
      sufficient: searchQueries.length === 0,
      searchQueries,
      usedWebSearch: Boolean(webContext),
      nodeCount: schema?.nodes.length ?? 0,
      edgeCount: schema?.edges.length ?? 0,
      warning: projectWarning,
    },
    { status: 200 }
  );
}

// ---------------------------------------------------------------------------
// Project schema normalization + builder
// ---------------------------------------------------------------------------

interface SchemaTag {
  key: string;
  value: string;
  type: TagType;
}
interface SchemaNode {
  name: string;
  type: import('@/lib/store').Node['type'];
  description: string;
  positionX: number;
  positionY: number;
  config: Record<string, any>;
}
interface SchemaEdge {
  sourceName: string;
  targetName: string;
  label: string;
}
interface ProjectSchema {
  name: string;
  description: string;
  tags: SchemaTag[];
  nodes: SchemaNode[];
  edges: SchemaEdge[];
}

// Coerce whatever the model returned into a strict, render-safe schema. Bad
// node types collapse to 'function', bad tag types are auto-detected, and node
// positions get a sensible left-to-right fallback when missing/non-numeric.
function normalizeSchema(raw: any, fallbackName: string): ProjectSchema {
  const obj = raw && typeof raw === 'object' ? raw : {};

  const nodes: SchemaNode[] = (Array.isArray(obj.nodes) ? obj.nodes : [])
    .filter((n: any) => n && typeof n === 'object' && typeof n.name === 'string' && n.name.trim())
    .map((n: any, i: number) => ({
      name: String(n.name).trim(),
      type: coerceNodeType(n.type),
      description: typeof n.description === 'string' ? n.description : '',
      positionX: Number.isFinite(Number(n.positionX)) ? Number(n.positionX) : 120 + i * 240,
      positionY: Number.isFinite(Number(n.positionY)) ? Number(n.positionY) : 160,
      config: n.config && typeof n.config === 'object' ? n.config : {},
    }));

  // Only keep edges whose endpoints name real nodes.
  const nodeNames = new Set(nodes.map((n) => n.name));
  const edges: SchemaEdge[] = (Array.isArray(obj.edges) ? obj.edges : [])
    .filter(
      (e: any) =>
        e &&
        typeof e === 'object' &&
        typeof e.sourceName === 'string' &&
        typeof e.targetName === 'string' &&
        nodeNames.has(e.sourceName) &&
        nodeNames.has(e.targetName) &&
        e.sourceName !== e.targetName
    )
    .map((e: any) => ({
      sourceName: String(e.sourceName),
      targetName: String(e.targetName),
      label: typeof e.label === 'string' ? e.label : '',
    }));

  const tags: SchemaTag[] = (Array.isArray(obj.tags) ? obj.tags : [])
    .filter((t: any) => t && typeof t === 'object' && typeof t.key === 'string' && t.key.trim())
    .map((t: any) => {
      const value = String(t.value ?? '');
      const type: TagType = isTagType(t.type) ? t.type : detectTagType(value);
      return { key: String(t.key).trim(), value, type };
    });

  return {
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : fallbackName,
    description: typeof obj.description === 'string' ? obj.description : '',
    tags,
    nodes,
    edges,
  };
}

// Create the project, tags, nodes (tracking name->id), and edges (resolving
// names to ids) via the store. Returns the new project id.
async function buildProject(
  userId: string,
  schema: ProjectSchema,
  wikiPath: string
): Promise<string> {
  const project = await store.createProject(
    userId,
    schema.name,
    schema.description || `Generated from Wiki Ingest — wiki/${path.basename(wikiPath)}`,
    false // a real project, not a template
  );

  if (schema.tags.length) {
    await store.updateProjectTags(
      project.id,
      schema.tags.map((t) => ({ id: randomUUID(), key: t.key, value: t.value, type: t.type }))
    );
  }

  const nameToId = new Map<string, string>();
  for (const n of schema.nodes) {
    const created = await store.addNode(project.id, {
      type: n.type,
      name: n.name,
      description: n.description,
      positionX: n.positionX,
      positionY: n.positionY,
      config: n.config,
    });
    if (created) nameToId.set(n.name, created.id);
  }

  for (const e of schema.edges) {
    const src = nameToId.get(e.sourceName);
    const tgt = nameToId.get(e.targetName);
    if (!src || !tgt) continue;
    await store.addEdge(project.id, src, tgt, e.label);
  }

  return project.id;
}

// ---------------------------------------------------------------------------
// Wiki file backends (unchanged)
// ---------------------------------------------------------------------------

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// VPS backend: write to the local ai-wiki checkout. Returns absolute path.
async function writeWikiToDisk(
  title: string,
  wikiContent: string,
  date: string,
  tagSuffix: string
): Promise<string> {
  await fs.mkdir(WIKI_DIR, { recursive: true });
  const slug = slugify(title);
  let filename = `${slug}.md`;
  let target = path.join(WIKI_DIR, filename);
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await fileExists(target)) {
    filename = `${slug}-${n}.md`;
    target = path.join(WIKI_DIR, filename);
    n += 1;
  }
  await fs.writeFile(target, wikiContent + '\n', 'utf8');
  await fs.appendFile(
    LOG_FILE,
    `${date} — Wiki Ingest: wiki/${filename} — ${title}${tagSuffix}\n`,
    'utf8'
  );
  return target;
}

// Vercel backend: commit to Makoto52T/ai-wiki via the GitHub Contents API.
// Returns the repo-relative path written (wiki/<filename>).
async function writeWikiToGitHub(
  title: string,
  wikiContent: string,
  date: string,
  tagSuffix: string
): Promise<string> {
  const token = process.env.GITHUB_API_TOKEN;
  if (!token) {
    throw new Error('GITHUB_API_TOKEN not configured on the server');
  }

  const slug = slugify(title);
  const filename = `${slug}-${Date.now()}.md`;
  const repoPath = `wiki/${filename}`;

  await ghPutFile(token, repoPath, wikiContent + '\n', `ingest: ${title}`, undefined);

  try {
    const log = await ghGetFile(token, 'log.md');
    const newLog =
      log.content + `${date} — Wiki Ingest: ${repoPath} — ${title}${tagSuffix}\n`;
    await ghPutFile(token, 'log.md', newLog, `log: ${title}`, log.sha);
  } catch {
    // Log append is best-effort; the wiki page already committed.
  }

  return repoPath;
}

async function ghGetFile(
  token: string,
  repoPath: string
): Promise<{ content: string; sha: string }> {
  const res = await fetch(
    `${GH_API}/repos/${GH_REPO}/contents/${repoPath}?ref=${GH_BRANCH}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'tmd-wiki-ingest',
      },
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub GET ${repoPath} failed: ${res.status}`);
  }
  const data: any = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { content, sha: data.sha };
}

async function ghPutFile(
  token: string,
  repoPath: string,
  content: string,
  message: string,
  sha?: string
): Promise<void> {
  const res = await fetch(`${GH_API}/repos/${GH_REPO}/contents/${repoPath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'tmd-wiki-ingest',
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(content).toString('base64'),
      branch: GH_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GitHub PUT ${repoPath} failed: ${res.status} ${detail}`);
  }
}
