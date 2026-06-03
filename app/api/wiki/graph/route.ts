import { NextResponse, type NextRequest } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

import { WIKI_GRAPH_OWNER_ID } from '@/app/wiki-graph/owner';

export const runtime = 'nodejs';
// We manage freshness with an in-process 60s cache below, so let the handler
// run dynamically rather than letting Next cache the whole response forever.
export const dynamic = 'force-dynamic';

// VPS mode: AI_WIKI_DIR points at the local ai-wiki checkout. Vercel mode:
// unset -> read from the Makoto52T/ai-wiki repo via the GitHub Contents API.
const AI_WIKI_DIR = process.env.AI_WIKI_DIR;
const WIKI_ROOT = AI_WIKI_DIR || '/root/ai-wiki';

const GH_REPO = 'Makoto52T/ai-wiki';
const GH_BRANCH = 'main';
const GH_API = 'https://api.github.com';

// Root-level markdown files that participate in the graph (alongside wiki/*.md).
const ROOT_FILES = ['cross.md', 'index.md', 'hotcatch.md', 'log.md'];

interface RawFile {
  // Canonical node id: the bare filename without directory, e.g. "tmd.md".
  id: string;
  // Repo-relative path used for the GitHub source link, e.g. "wiki/tmd.md".
  repoPath: string;
  content: string;
}

interface GraphNode {
  id: string;
  label: string;
  type: string;
  tags: string[];
  repoPath: string;
  githubUrl: string;
  size: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generatedAt: string;
  source: 'disk' | 'github';
}

// ---- 60s in-process cache -------------------------------------------------

let cache: { data: GraphResponse; at: number } | null = null;
const CACHE_MS = 60_000;

// ---- frontmatter + backlink parsing --------------------------------------

interface Frontmatter {
  type: string;
  tags: string[];
}

function parseFrontmatter(content: string): Frontmatter {
  const out: Frontmatter = { type: 'unknown', tags: [] };
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return out;
  const block = m[1];

  const typeMatch = block.match(/^type:\s*(.+)$/m);
  if (typeMatch) out.type = typeMatch[1].trim().replace(/^["']|["']$/g, '');

  const tagsMatch = block.match(/^tags:\s*\[(.*?)\]/m);
  if (tagsMatch) {
    out.tags = tagsMatch[1]
      .split(',')
      .map((t) => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return out;
}

// Normalize any [[backlink]] target into a canonical node id (bare *.md name).
// Handles "../index.md", "wiki/tmd.md", "tmd.md", and bare "tmd" (-> "tmd.md").
function normalizeLinkTarget(raw: string): string | null {
  let t = raw.trim();
  if (!t) return null;
  // Strip an anchor / heading fragment if present.
  t = t.split('#')[0].split('|')[0].trim();
  if (!t) return null;
  // Strip leading ../ and wiki/ path noise, keep only the basename.
  t = t.replace(/^(\.\.\/)+/, '').replace(/^wiki\//, '');
  t = t.split('/').pop() || t;
  if (!t.endsWith('.md')) {
    // Bare references like [[socket-io-patterns]] — only keep if it looks like
    // a slug (no spaces), turning it into a candidate filename.
    if (/\s/.test(t)) return null;
    t = `${t}.md`;
  }
  return t.toLowerCase();
}

function extractLinks(content: string, selfId: string): string[] {
  const matches = content.match(/\[\[([^\]]+)\]\]/g);
  if (!matches) return [];
  const out = new Set<string>();
  for (const m of matches) {
    const inner = m.replace(/^\[\[|\]\]$/g, '');
    // "[[Backlinks]]" is a literal section heading, not a link target.
    if (inner.toLowerCase() === 'backlinks') continue;
    const id = normalizeLinkTarget(inner);
    if (id && id !== selfId) out.add(id);
  }
  return [...out];
}

function githubUrlFor(repoPath: string): string {
  return `https://github.com/${GH_REPO}/blob/${GH_BRANCH}/${repoPath}`;
}

// ---- file collection: disk vs github -------------------------------------

async function collectFromDisk(): Promise<RawFile[]> {
  const files: RawFile[] = [];
  const wikiDir = path.join(WIKI_ROOT, 'wiki');

  try {
    const names = await fs.readdir(wikiDir);
    for (const name of names) {
      if (!name.endsWith('.md')) continue;
      const content = await fs.readFile(path.join(wikiDir, name), 'utf8');
      files.push({ id: name.toLowerCase(), repoPath: `wiki/${name}`, content });
    }
  } catch {
    // wiki/ dir missing — fall through to root files.
  }

  for (const name of ROOT_FILES) {
    try {
      const content = await fs.readFile(path.join(WIKI_ROOT, name), 'utf8');
      files.push({ id: name.toLowerCase(), repoPath: name, content });
    } catch {
      // optional root file missing — skip.
    }
  }
  return files;
}

async function ghListDir(token: string, repoPath: string): Promise<string[]> {
  const res = await fetch(
    `${GH_API}/repos/${GH_REPO}/contents/${repoPath}?ref=${GH_BRANCH}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'tmd-wiki-graph',
      },
    }
  );
  if (!res.ok) throw new Error(`GitHub list ${repoPath} failed: ${res.status}`);
  const data: any = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .filter((e) => e.type === 'file' && typeof e.name === 'string' && e.name.endsWith('.md'))
    .map((e) => e.name as string);
}

async function ghGetRaw(token: string, repoPath: string): Promise<string> {
  const res = await fetch(`${GH_API}/repos/${GH_REPO}/contents/${repoPath}?ref=${GH_BRANCH}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'tmd-wiki-graph',
    },
  });
  if (!res.ok) throw new Error(`GitHub get ${repoPath} failed: ${res.status}`);
  const data: any = await res.json();
  return Buffer.from(data.content, 'base64').toString('utf8');
}

async function collectFromGitHub(): Promise<RawFile[]> {
  const token = process.env.GITHUB_API_TOKEN;
  if (!token) throw new Error('GITHUB_API_TOKEN not configured on the server');

  const files: RawFile[] = [];

  const wikiNames = await ghListDir(token, 'wiki');
  const wikiContents = await Promise.all(
    wikiNames.map((name) => ghGetRaw(token, `wiki/${name}`))
  );
  wikiNames.forEach((name, i) => {
    files.push({ id: name.toLowerCase(), repoPath: `wiki/${name}`, content: wikiContents[i] });
  });

  const rootContents = await Promise.all(
    ROOT_FILES.map((name) => ghGetRaw(token, name).catch(() => null))
  );
  ROOT_FILES.forEach((name, i) => {
    if (rootContents[i] != null) {
      files.push({ id: name.toLowerCase(), repoPath: name, content: rootContents[i] as string });
    }
  });

  return files;
}

// ---- graph assembly -------------------------------------------------------

function buildGraph(files: RawFile[], source: 'disk' | 'github'): GraphResponse {
  const known = new Set(files.map((f) => f.id));

  // Collect deduped, valid edges first so we can size nodes by degree.
  const edgeSet = new Set<string>();
  const degree = new Map<string, number>();
  for (const id of known) degree.set(id, 0);

  for (const f of files) {
    const links = extractLinks(f.content, f.id);
    for (const target of links) {
      // Only keep edges to pages we actually have nodes for.
      if (!known.has(target)) continue;
      const key = `${f.id}->${target}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      degree.set(f.id, (degree.get(f.id) || 0) + 1);
      degree.set(target, (degree.get(target) || 0) + 1);
    }
  }

  const nodes: GraphNode[] = files.map((f) => {
    const fm = parseFrontmatter(f.content);
    const deg = degree.get(f.id) || 0;
    return {
      id: f.id,
      label: f.id.replace(/\.md$/, ''),
      type: fm.type,
      tags: fm.tags,
      repoPath: f.repoPath,
      githubUrl: githubUrlFor(f.repoPath),
      // Size scales with connection count; hub pages render larger.
      size: Math.min(40 + deg * 6, 120),
    };
  });

  const edges: GraphEdge[] = [...edgeSet].map((key) => {
    const [sourceId, target] = key.split('->');
    return { source: sourceId, target };
  });

  return { nodes, edges, generatedAt: new Date().toISOString(), source };
}

export async function GET(request: NextRequest) {
  // Private to the project owner — block direct API hits from anyone else.
  const userId = request.cookies.get('userId')?.value;
  if (userId !== WIKI_GRAPH_OWNER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    let files: RawFile[];
    let source: 'disk' | 'github';
    if (AI_WIKI_DIR) {
      files = await collectFromDisk();
      source = 'disk';
    } else {
      // No local checkout (Vercel) — read from GitHub.
      files = await collectFromGitHub();
      source = 'github';
    }

    const data = buildGraph(files, source);
    cache = { data, at: Date.now() };
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to build wiki graph' },
      { status: 500 }
    );
  }
}
