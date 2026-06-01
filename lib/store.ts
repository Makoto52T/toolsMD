// Persistent store backed by VPS MySQL (mysql2 pool in ./db).
// API surface mirrors the previous in-memory store, but every method is async.
import { randomUUID } from 'crypto';
import type { RowDataPacket } from 'mysql2';
import pool from './db';

export interface Node {
  id: string;
  type: 'function' | 'http-request' | 'puppeteer' | 'sub-project';
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
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
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
    description: string
  ): Promise<Project> => {
    const id = randomUUID();
    await pool.execute(
      'INSERT INTO projects (id, user_id, name, description) VALUES (?, ?, ?, ?)',
      [id, userId, name, description]
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
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC',
      [userId]
    );
    return Promise.all(rows.map(loadProjectRow));
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
    label: string
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
      `INSERT INTO edges (id, project_id, source_node_id, target_node_id, label)
       VALUES (?, ?, ?, ?, ?)`,
      [id, projectId, sourceNodeId, targetNodeId, label ?? '']
    );
    await touchProject(projectId);
    return { id, sourceNodeId, targetNodeId, label: label ?? '' };
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

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as any)[k] = v;
  }
  return out;
}
