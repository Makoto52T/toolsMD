// Simple in-memory store for MVP
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

// Mock data store
const users = new Map<string, User>();
const projects = new Map<string, Project>();

export const store = {
  // User operations
  createUser: (email: string, name: string): User => {
    const id = `user_${Date.now()}`;
    const user = { id, email, name };
    users.set(id, user);
    return user;
  },

  getUserByEmail: (email: string): User | undefined => {
    return Array.from(users.values()).find(u => u.email === email);
  },

  getUser: (id: string): User | undefined => {
    return users.get(id);
  },

  // Project operations
  createProject: (userId: string, name: string, description: string): Project => {
    const id = `proj_${Date.now()}`;
    const project: Project = {
      id,
      userId,
      name,
      description,
      nodes: [],
      edges: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    projects.set(id, project);
    return project;
  },

  getProject: (id: string): Project | undefined => {
    return projects.get(id);
  },

  getUserProjects: (userId: string): Project[] => {
    return Array.from(projects.values()).filter(p => p.userId === userId);
  },

  updateProject: (id: string, name: string, description: string): Project | null => {
    const project = projects.get(id);
    if (!project) return null;
    project.name = name;
    project.description = description;
    project.updatedAt = new Date();
    return project;
  },

  deleteProject: (id: string): boolean => {
    return projects.delete(id);
  },

  // Node operations
  addNode: (projectId: string, node: Omit<Node, 'id'>): Node | null => {
    const project = projects.get(projectId);
    if (!project) return null;
    const newNode: Node = { ...node, id: `node_${Date.now()}` };
    project.nodes.push(newNode);
    project.updatedAt = new Date();
    return newNode;
  },

  updateNode: (projectId: string, nodeId: string, updates: Partial<Node>): Node | null => {
    const project = projects.get(projectId);
    if (!project) return null;
    const node = project.nodes.find(n => n.id === nodeId);
    if (!node) return null;
    Object.assign(node, updates);
    project.updatedAt = new Date();
    return node;
  },

  deleteNode: (projectId: string, nodeId: string): boolean => {
    const project = projects.get(projectId);
    if (!project) return false;
    const index = project.nodes.findIndex(n => n.id === nodeId);
    if (index === -1) return false;
    project.nodes.splice(index, 1);
    project.edges = project.edges.filter(e => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId);
    project.updatedAt = new Date();
    return true;
  },

  // Edge operations
  addEdge: (projectId: string, sourceNodeId: string, targetNodeId: string, label: string): Edge | null => {
    const project = projects.get(projectId);
    if (!project) return null;
    const edge: Edge = { id: `edge_${Date.now()}`, sourceNodeId, targetNodeId, label };
    project.edges.push(edge);
    project.updatedAt = new Date();
    return edge;
  },

  deleteEdge: (projectId: string, edgeId: string): boolean => {
    const project = projects.get(projectId);
    if (!project) return false;
    const index = project.edges.findIndex(e => e.id === edgeId);
    if (index === -1) return false;
    project.edges.splice(index, 1);
    project.updatedAt = new Date();
    return true;
  },
};
