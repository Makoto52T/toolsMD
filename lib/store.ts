// Persistent store backed by VPS MySQL (mysql2 pool in ./db).
// API surface mirrors the previous in-memory store, but every method is async.
import { randomUUID } from 'crypto';
import type { RowDataPacket } from 'mysql2';
import pool from './db';
import { detectTagType, isTagType, type TagType } from './path-utils';

export interface Node {
  id: string;
  type: 'function' | 'http-request' | 'puppeteer' | 'sub-project' | 'server';
  name: string;
  description: string;
  positionX: number;
  positionY: number;
  config: Record<string, any>;
}

export interface Edge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string;
  // React Flow handle ids (top/bottom/left/right) the edge was drawn from/to.
  // Null for legacy edges created before per-handle connections existed; those
  // fall back to React Flow's default handle on render (back-compat).
  sourceHandle: string | null;
  targetHandle: string | null;
}

export interface Tag {
  id: string;
  key: string;
  value: string;
  // How the tag value is used: domain/pathname/param/body in the URL builder &
  // body, or generic for plain scalars. Legacy tags without a stored type are
  // lazily auto-detected on read (and written back on the next tags PUT).
  type: TagType;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  // Templates (is_template=1) are owned projects that are hidden from the normal
  // dashboard list and surfaced in a separate "Templates" section. They can be
  // forked into fresh projects or appended onto an existing canvas.
  isTemplate: boolean;
  // Public tutorial templates (is_public_template=1) are visible to *every*
  // user in the Templates section (owned by the system user). Private templates
  // (is_public_template=0) stay visible only to their owner.
  isPublicTemplate: boolean;
  tags: Tag[];
  nodes: Node[];
  edges: Edge[];
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

// --- row mappers -----------------------------------------------------------

function parseConfig(raw: unknown): Record<string, any> {
  if (raw == null) return {};
  // mysql2 returns JSON columns already parsed as objects, but be defensive.
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, any>;
  return {};
}

function parseTags(raw: unknown): Tag[] {
  let val: unknown = raw;
  if (val == null) return [];
  if (typeof val === 'string') {
    try {
      val = JSON.parse(val);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(val)) return [];
  return val
    .filter(
      (t): t is Tag =>
        t != null &&
        typeof t === 'object' &&
        typeof (t as any).id === 'string' &&
        typeof (t as any).key === 'string'
    )
    .map((t) => {
      const value = String((t as any).value ?? '');
      // Lazy migrate: legacy tags have no `type`. Auto-detect from the value so
      // old projects get sensible types without a migration script; the next
      // tags PUT writes the resolved type back to the DB.
      const rawType = (t as any).type;
      const type: TagType = isTagType(rawType) ? rawType : detectTagType(value);
      return { id: (t as any).id, key: (t as any).key, value, type };
    });
}

function mapNode(r: RowDataPacket): Node {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    description: r.description ?? '',
    positionX: Number(r.position_x),
    positionY: Number(r.position_y),
    config: parseConfig(r.config),
  };
}

function mapEdge(r: RowDataPacket): Edge {
  return {
    id: r.id,
    sourceNodeId: r.source_node_id,
    targetNodeId: r.target_node_id,
    label: r.label ?? '',
    sourceHandle: r.source_handle ?? null,
    targetHandle: r.target_handle ?? null,
  };
}

async function loadProjectRow(r: RowDataPacket): Promise<Project> {
  const [nodeRows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM nodes WHERE project_id = ? ORDER BY created_at ASC, id ASC',
    [r.id]
  );
  const [edgeRows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM edges WHERE project_id = ? ORDER BY created_at ASC, id ASC',
    [r.id]
  );
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    description: r.description ?? '',
    isTemplate: Boolean(r.is_template),
    isPublicTemplate: Boolean(r.is_public_template),
    tags: parseTags(r.tags),
    nodes: nodeRows.map(mapNode),
    edges: edgeRows.map(mapEdge),
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

// --- store -----------------------------------------------------------------

export const store = {
  // User operations
  createUser: async (email: string, name: string): Promise<User> => {
    const id = randomUUID();
    try {
      await pool.execute('INSERT INTO users (id, email, name) VALUES (?, ?, ?)', [
        id,
        email,
        name,
      ]);
      return { id, email, name };
    } catch (e: any) {
      // Concurrent logins with the same email race between getUserByEmail and
      // this INSERT; the UNIQUE(email) constraint then throws ER_DUP_ENTRY on
      // the loser. Treat that as "already created" and return the winner's row.
      if (e?.code === 'ER_DUP_ENTRY') {
        const existing = await store.getUserByEmail(email);
        if (existing) return existing;
      }
      throw e;
    }
  },

  getUserByEmail: async (email: string): Promise<User | undefined> => {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, email, name FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const r = rows[0];
    return r ? { id: r.id, email: r.email, name: r.name } : undefined;
  },

  getUser: async (id: string): Promise<User | undefined> => {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, email, name FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    const r = rows[0];
    return r ? { id: r.id, email: r.email, name: r.name } : undefined;
  },

  // Project operations
  createProject: async (
    userId: string,
    name: string,
    description: string,
    isTemplate = false
  ): Promise<Project> => {
    const id = randomUUID();
    await pool.execute(
      'INSERT INTO projects (id, user_id, name, description, is_template) VALUES (?, ?, ?, ?, ?)',
      [id, userId, name, description, isTemplate ? 1 : 0]
    );
    const project = await store.getProject(id);
    // getProject just inserted row must exist.
    return project as Project;
  },

  getProject: async (id: string): Promise<Project | undefined> => {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM projects WHERE id = ? LIMIT 1',
      [id]
    );
    const r = rows[0];
    if (!r) return undefined;
    return loadProjectRow(r);
  },

  getUserProjects: async (userId: string): Promise<Project[]> => {
    // Templates are deliberately excluded here so they don't clutter the normal
    // dashboard list — they have their own getUserTemplates() query / UI section.
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM projects WHERE user_id = ? AND is_template = 0 ORDER BY updated_at DESC',
      [userId]
    );
    return Promise.all(rows.map(loadProjectRow));
  },

  // Templates visible to a user: their own private templates PLUS every public
  // tutorial template (is_public_template=1, owned by the system user). Ordered
  // public-first so the curated tutorials lead, then the user's own.
  getUserTemplates: async (userId: string): Promise<Project[]> => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM projects
         WHERE is_template = 1 AND (user_id = ? OR is_public_template = 1)
         ORDER BY is_public_template DESC, updated_at DESC`,
      [userId]
    );
    return Promise.all(rows.map(loadProjectRow));
  },

  // Public tutorial templates only — usable without auth (e.g. a logged-out
  // /docs preview). No user filter.
  getPublicTemplates: async (): Promise<Project[]> => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM projects
         WHERE is_template = 1 AND is_public_template = 1
         ORDER BY updated_at DESC`
    );
    return Promise.all(rows.map(loadProjectRow));
  },

  // Fork a template (or any project) into a brand-new project owned by userId.
  // Copies project meta + tags + nodes + edges, remapping node ids so edges in
  // the copy point at the new node rows. The fork is always a normal project
  // (is_template=0) even when the source is a template.
  forkProject: async (
    sourceId: string,
    userId: string,
    name?: string
  ): Promise<Project | null> => {
    const source = await store.getProject(sourceId);
    if (!source) return null;

    const newProject = await store.createProject(
      userId,
      name || `${source.name} (copy)`,
      source.description,
      false
    );

    // Re-id tags so the fork is fully independent of the source. Keep a map
    // oldTagId -> newTagId so node configs that reference tag ids (urlParts,
    // urlTagId, outputBindings[].tagId) can be rewired to the cloned tags —
    // otherwise those references dangle and the node fails at run time
    // ("URL builder has no resolvable tags", bindings silently skipped).
    const tagIdMap = new Map<string, string>();
    const clonedTags: Tag[] = source.tags.map((t) => {
      const id = randomUUID();
      tagIdMap.set(t.id, id);
      return { id, key: t.key, value: t.value, type: t.type };
    });
    if (clonedTags.length) await store.updateProjectTags(newProject.id, clonedTags);

    // Copy nodes, keeping a map oldNodeId -> newNodeId so edges can be rewired.
    const idMap = new Map<string, string>();
    for (const n of source.nodes) {
      const created = await store.addNode(newProject.id, {
        type: n.type,
        name: n.name,
        description: n.description,
        positionX: n.positionX,
        positionY: n.positionY,
        config: remapConfigTagIds(n.config, tagIdMap),
      });
      if (created) idMap.set(n.id, created.id);
    }

    // Copy edges with remapped endpoints. Skip any edge whose endpoint failed to
    // copy (shouldn't happen, but keeps the fork consistent).
    for (const e of source.edges) {
      const src = idMap.get(e.sourceNodeId);
      const tgt = idMap.get(e.targetNodeId);
      if (!src || !tgt) continue;
      await store.addEdge(newProject.id, src, tgt, e.label, e.sourceHandle, e.targetHandle);
    }

    return (await store.getProject(newProject.id)) ?? null;
  },

  updateProject: async (
    id: string,
    name: string,
    description: string
  ): Promise<Project | null> => {
    const [res] = await pool.execute<any>(
      'UPDATE projects SET name = ?, description = ? WHERE id = ?',
      [name, description, id]
    );
    if (res.affectedRows === 0) return null;
    const project = await store.getProject(id);
    return project ?? null;
  },

  updateProjectTags: async (id: string, tags: Tag[]): Promise<Project | null> => {
    const [res] = await pool.execute<any>(
      'UPDATE projects SET tags = ? WHERE id = ?',
      [JSON.stringify(tags), id]
    );
    if (res.affectedRows === 0) return null;
    await touchProject(id);
    const project = await store.getProject(id);
    return project ?? null;
  },

  deleteProject: async (id: string): Promise<boolean> => {
    const [res] = await pool.execute<any>('DELETE FROM projects WHERE id = ?', [id]);
    return res.affectedRows > 0;
  },

  // Node operations
  addNode: async (
    projectId: string,
    node: Omit<Node, 'id'>
  ): Promise<Node | null> => {
    const [proj] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM projects WHERE id = ? LIMIT 1',
      [projectId]
    );
    if (!proj[0]) return null;

    const id = randomUUID();
    await pool.execute(
      `INSERT INTO nodes (id, project_id, type, name, description, position_x, position_y, config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        node.type,
        node.name,
        node.description ?? '',
        node.positionX ?? 0,
        node.positionY ?? 0,
        JSON.stringify(node.config ?? {}),
      ]
    );
    await touchProject(projectId);
    return {
      id,
      type: node.type,
      name: node.name,
      description: node.description ?? '',
      positionX: node.positionX ?? 0,
      positionY: node.positionY ?? 0,
      config: node.config ?? {},
    };
  },

  updateNode: async (
    projectId: string,
    nodeId: string,
    updates: Partial<Node>
  ): Promise<Node | null> => {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM nodes WHERE id = ? AND project_id = ? LIMIT 1',
      [nodeId, projectId]
    );
    const current = rows[0];
    if (!current) return null;

    const merged: Node = { ...mapNode(current), ...stripUndefined(updates) };
    await pool.execute(
      `UPDATE nodes SET type = ?, name = ?, description = ?, position_x = ?, position_y = ?, config = ?
       WHERE id = ? AND project_id = ?`,
      [
        merged.type,
        merged.name,
        merged.description ?? '',
        merged.positionX ?? 0,
        merged.positionY ?? 0,
        JSON.stringify(merged.config ?? {}),
        nodeId,
        projectId,
      ]
    );
    await touchProject(projectId);
    return merged;
  },

  deleteNode: async (projectId: string, nodeId: string): Promise<boolean> => {
    // Edges referencing this node are not FK-bound (they point at node ids in
    // app logic), so clean them up explicitly to mirror old behaviour.
    await pool.execute(
      'DELETE FROM edges WHERE project_id = ? AND (source_node_id = ? OR target_node_id = ?)',
      [projectId, nodeId, nodeId]
    );
    const [res] = await pool.execute<any>(
      'DELETE FROM nodes WHERE id = ? AND project_id = ?',
      [nodeId, projectId]
    );
    if (res.affectedRows > 0) await touchProject(projectId);
    return res.affectedRows > 0;
  },

  // Edge operations
  addEdge: async (
    projectId: string,
    sourceNodeId: string,
    targetNodeId: string,
    label: string,
    sourceHandle: string | null = null,
    targetHandle: string | null = null
  ): Promise<Edge | null> => {
    const [proj] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM projects WHERE id = ? LIMIT 1',
      [projectId]
    );
    if (!proj[0]) return null;

    // Both endpoints must be real nodes in THIS project — otherwise we'd persist
    // an orphan edge (e.g. pointing at a deleted/non-existent node) that the
    // canvas can never render. Guard at the data layer.
    const [endpoints] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM nodes WHERE project_id = ? AND id IN (?, ?)',
      [projectId, sourceNodeId, targetNodeId]
    );
    const ids = new Set(endpoints.map((n) => n.id));
    if (!ids.has(sourceNodeId) || !ids.has(targetNodeId)) return null;

    const id = randomUUID();
    await pool.execute(
      `INSERT INTO edges (id, project_id, source_node_id, target_node_id, label, source_handle, target_handle)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, sourceNodeId, targetNodeId, label ?? '', sourceHandle ?? null, targetHandle ?? null]
    );
    await touchProject(projectId);
    return {
      id,
      sourceNodeId,
      targetNodeId,
      label: label ?? '',
      sourceHandle: sourceHandle ?? null,
      targetHandle: targetHandle ?? null,
    };
  },

  deleteEdge: async (projectId: string, edgeId: string): Promise<boolean> => {
    const [res] = await pool.execute<any>(
      'DELETE FROM edges WHERE id = ? AND project_id = ?',
      [edgeId, projectId]
    );
    if (res.affectedRows > 0) await touchProject(projectId);
    return res.affectedRows > 0;
  },
};

async function touchProject(projectId: string): Promise<void> {
  await pool.execute(
    'UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [projectId]
  );
}

// When a project is forked its tags are re-id'd, so any node config field that
// stores a *tag id* must be rewritten to the cloned tag's id. Known shapes:
//   - urlParts: string[]            (ordered tag ids for the URL builder)
//   - urlTagId: string              (legacy single-tag URL)
//   - outputBindings: [{ tagId }]   (response->tag bindings)
//   - tagQuery / tagBody: string[]  (legacy apply-tags arrays)
// Anything not in the map is left as-is (defensive: don't drop unknown refs).
function remapConfigTagIds(
  config: Record<string, any>,
  tagIdMap: Map<string, string>
): Record<string, any> {
  if (!config || typeof config !== 'object' || tagIdMap.size === 0) return config;
  const map = (id: unknown): unknown =>
    typeof id === 'string' && tagIdMap.has(id) ? tagIdMap.get(id) : id;
  const next: Record<string, any> = { ...config };

  if (Array.isArray(next.urlParts)) next.urlParts = next.urlParts.map(map);
  if (typeof next.urlTagId === 'string') next.urlTagId = map(next.urlTagId);
  if (Array.isArray(next.tagQuery)) next.tagQuery = next.tagQuery.map(map);
  if (Array.isArray(next.tagBody)) next.tagBody = next.tagBody.map(map);
  if (Array.isArray(next.outputBindings)) {
    next.outputBindings = next.outputBindings.map((b: any) =>
      b && typeof b === 'object' && typeof b.tagId === 'string'
        ? { ...b, tagId: map(b.tagId) }
        : b
    );
  }
  return next;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as any)[k] = v;
  }
  return out;
}
