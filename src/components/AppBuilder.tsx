'use client';

import { Session } from 'next-auth';
import { signOut } from 'next-auth/react';
import { useState, useCallback, useEffect, useRef } from 'react';

interface Project { id: string; name: string; }
interface NodeItem { id: string; name: string; description?: string; notes?: string; x: number; y: number; w: number; h: number; fnCount: number; }
interface FunctionItem { id: string; node_id: string; name: string; description?: string; icon: string; category: string; sort_order: number; }
interface EdgeItem { id: string; from_node_id: string; to_node_id: string; from_function_id: string | null; to_function_id: string | null; label: string; }

export default function AppBuilder({ session, initialProject }: { session: Session; initialProject: Project | null }) {
  const [projectId, setProjectId] = useState<string | null>(initialProject?.id || null);
  const [projectName, setProjectName] = useState(initialProject?.name || 'Untitled');
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [functions, setFunctions] = useState<FunctionItem[]>([]);
  const [edges, setEdges] = useState<EdgeItem[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFirst, setConnectFirst] = useState<string | null>(null);
  const [connectSecond, setConnectSecond] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [newFnName, setNewFnName] = useState('');
  const [newFnDesc, setNewFnDesc] = useState('');
  const [editNodeName, setEditNodeName] = useState('');
  const [editNodeDesc, setEditNodeDesc] = useState('');
  const [editNodeNotes, setEditNodeNotes] = useState('');
  const [toast, setToast] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  // ─── Create Node Modal state ───
  const [createModal, setCreateModal] = useState(false);
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeDesc, setNewNodeDesc] = useState('');
  const [newNodeNotes, setNewNodeNotes] = useState('');

  // AI duplicate check result modal
  const [checkModal, setCheckModal] = useState<{
    name: string;
    description?: string;
    duplicates: { name: string; confidence: number; reason: string }[];
    checking: boolean;
  } | null>(null);

  // Drag state
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);

  const api = async (method: string, path: string, body?: any) => {
    const res = await fetch('/api' + path, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw await res.json();
    return res.json();
  };

  const loadData = useCallback(async () => {
    if (!projectId) return;
    const d = await api('GET', `/projects/${projectId}/full`);
    setProjectName(d.project.name);
    setNodes(d.nodes.map((n: any) => ({ ...n, fnCount: 0 })));
    setFunctions(d.functions);
    setEdges(d.edges);
  }, [projectId]);

  useEffect(() => { if (projectId) loadData(); }, [projectId, loadData]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.project-switcher')) setProjectSwitcherOpen(false);
      if (!target.closest('.user-menu')) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const data = await api('GET', '/projects');
      setProjects(Array.isArray(data) ? data : []);
    } catch { /* silently ignore */ }
  }, []);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  // ─── Restore last project from localStorage on mount ───
  useEffect(() => {
    const restoreLastProject = async () => {
      try {
        const savedProjectId = localStorage.getItem('toolsMD_lastProject');
        if (!savedProjectId || !initialProject || savedProjectId === initialProject.id) return;
        // Verify the project exists and belongs to user by calling the API
        await api('GET', `/projects/${savedProjectId}/full`);
        switchProject(savedProjectId, '');
      } catch {
        // Project not found or not owned — clear stale localStorage, keep initialProject
        try { localStorage.removeItem('toolsMD_lastProject'); } catch {}
      }
    };
    restoreLastProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // run once on mount

  // Populate node name in edit modal
  useEffect(() => {
    if (editingNode) {
      const node = nodes.find(n => n.id === editingNode);
      if (node) {
        setEditNodeName(node.name);
        setEditNodeDesc(node.description || '');
        setEditNodeNotes(node.notes || '');
      }
    }
  }, [editingNode]);

  const createProject = async () => {
    const name = prompt('Project name:') || 'Untitled';
    const p = await api('POST', '/projects', { name });
    setProjectId(p.id); setProjectName(p.name);
    setProjectSwitcherOpen(false);
    loadProjects();
    try { localStorage.setItem('toolsMD_lastProject', p.id); } catch {}
  };

  const switchProject = async (id: string, name: string) => {
    setProjectId(id);
    setProjectName(name);
    setProjectSwitcherOpen(false);
    setSelectedNode(null);
    setNodes([]);
    setFunctions([]);
    setEdges([]);
    try { localStorage.setItem('toolsMD_lastProject', id); } catch {}
  };

  const openCreateModal = () => {
    setNewNodeName('');
    setNewNodeDesc('');
    setNewNodeNotes('');
    setCreateModal(true);
    setMenuOpen(false);
  };

  const confirmCreateNode = async () => {
    if (!projectId || !newNodeName.trim()) return;
    const n = await api('POST', `/projects/${projectId}/nodes`, {
      name: newNodeName.trim(),
      description: newNodeDesc.trim() || undefined,
      notes: newNodeNotes.trim() || undefined,
      x: 100 + Math.random() * 200, y: 80 + Math.random() * 160,
      w: 180, h: 80,
    });
    setNodes(prev => [...prev, { ...n, fnCount: 0 }]);
    setCreateModal(false);
    setNewNodeName('');
    setNewNodeDesc('');
    setNewNodeNotes('');
  };

  const updateNodePosition = async (nodeId: string, x: number, y: number) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, x, y } : n));
    try { await api('PATCH', `/nodes/${nodeId}`, { x, y }); } catch {}
  };

  const updateNode = async (nodeId: string, fields: { name?: string; description?: string; notes?: string }) => {
    setNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n;
      return { ...n, ...fields };
    }));
    try { await api('PATCH', `/nodes/${nodeId}`, fields); } catch {}
  };

  // Add function immediately — no duplicate check
  const addFunction = async () => {
    if (!editingNode || !newFnName.trim()) return;
    const name = newFnName.trim();
    const description = newFnDesc.trim() || undefined;

    try {
      const fn = await api('POST', `/nodes/${editingNode}/functions`, { name, description });
      setFunctions(prev => [...prev, fn]);
      setNodes(prev => prev.map(n => n.id === editingNode ? { ...n, fnCount: (n.fnCount || 0) + 1 } : n));
      setNewFnName('');
      setNewFnDesc('');
    } catch (err: any) {
      setToast(err?.message || err?.error || 'Failed to add function');
      setTimeout(() => setToast(''), 2000);
    }
  };

  // AI duplicate check — manual trigger
  const checkWithAI = async () => {
    if (!editingNode || !newFnName.trim()) return;
    const name = newFnName.trim();
    const description = newFnDesc.trim() || undefined;

    setCheckModal({ name, description, duplicates: [], checking: true });

    try {
      const result = await api('POST', `/nodes/${editingNode}/functions/check-duplicate`, { name, description });
      const highDups = (result.duplicates || []).filter((d: any) => d.confidence > 0.5);
      setCheckModal({ name, description, duplicates: highDups, checking: false });
    } catch (err: any) {
      setToast(err?.message || 'AI check failed');
      setTimeout(() => setToast(''), 2000);
      setCheckModal(null);
    }
  };

  const deleteFunction = async (fnId: string) => {
    await api('DELETE', `/functions/${fnId}`);
    setFunctions(prev => prev.filter(f => f.id !== fnId));
  };

  const confirmConnect = async () => {
    if (!projectId || !connectFirst || !connectSecond) return;
    const e = await api('POST', `/projects/${projectId}/edges`, {
      from_node_id: connectFirst, to_node_id: connectSecond, label: '',
    });
    setEdges(prev => [...prev, e]);
    setConnectFirst(null); setConnectSecond(null); setConnectMode(false);
  };

  const exportPlan = () => {
    const order: string[] = [];
    const inD: Record<string, number> = {};
    const adj: Record<string, string[]> = {};
    nodes.forEach(n => { inD[n.id] = 0; adj[n.id] = []; });
    edges.forEach(e => { adj[e.from_node_id]?.push(e.to_node_id); inD[e.to_node_id] = (inD[e.to_node_id] || 0) + 1; });
    const q = nodes.filter(n => (inD[n.id] || 0) === 0).map(n => n.id);
    while (q.length) { const id = q.shift()!; order.push(id); adj[id].forEach(nid => { inD[nid]--; if (inD[nid] === 0) q.push(nid); }); }
    nodes.forEach(n => { if (!order.includes(n.id)) order.push(n.id); });
    const nm = Object.fromEntries(nodes.map(n => [n.id, n]));

    let md = `# ${projectName}\n\n> Nodes: ${nodes.length} | Functions: ${functions.length} | Edges: ${edges.length}\n\n## Order\n\n`;
    order.forEach((nid, i) => {
      const n = nm[nid]; if (!n) return;
      const fns = functions.filter(f => f.node_id === nid).sort((a, b) => a.sort_order - b.sort_order);
      md += `### ${i + 1}. 📦 ${n.name}\n`;
      if (fns.length) md += `- **Functions:** ${fns.map(f => f.icon + f.name).join(', ')}\n`;
      md += '\n';
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = projectName.toLowerCase().replace(/\s+/g, '-') + '-plan.md'; a.click();
    setToast('Plan exported!'); setTimeout(() => setToast(''), 2000);
  };

  const nodeFns = (nid: string) => functions.filter(f => f.node_id === nid).sort((a, b) => a.sort_order - b.sort_order);

  // Touch/mouse drag handlers
  const handleNodePointerDown = (e: React.PointerEvent, node: NodeItem) => {
    if (connectMode) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { nodeId: node.id, startX: e.clientX, startY: e.clientY, nodeX: node.x, nodeY: node.y };
  };

  const handleNodePointerMove = (e: React.PointerEvent, node: NodeItem) => {
    if (!dragRef.current || dragRef.current.nodeId !== node.id) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setNodes(prev => prev.map(n => n.id === node.id ? { ...n, x: (n as any).nodeX ?? n.x, y: (n as any).nodeY ?? n.y, nodeX: dragRef.current!.nodeX + dx, nodeY: dragRef.current!.nodeY + dy } : n));
  };

  const handleNodePointerUp = (e: React.PointerEvent, node: NodeItem) => {
    if (!dragRef.current || dragRef.current.nodeId !== node.id) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newX = Math.max(0, dragRef.current.nodeX + dx);
    const newY = Math.max(0, dragRef.current.nodeY + dy);
    updateNodePosition(node.id, newX, newY);
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // ─── Empty state ─────────────────────────────────
  if (!projectId) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🧩</div>
        <h1>toolsMD</h1>
        <p>Welcome, {session.user?.name}</p>
        <button onClick={createProject} className="btn btn-primary btn-lg">+ Create Project</button>
        <style>{`
          .empty-state { min-height: 100vh; min-height: 100dvh; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 16px; background: var(--bg); padding: 24px; text-align: center; }
          .empty-icon { width: 48px; height: 48px; border-radius: var(--radius-md); background: var(--accent-bg); border: 1px solid var(--border-accent); display: flex; align-items: center; justify-content: center; font-size: 22px; }
          .empty-state h1 { font-size: 22px; font-weight: 600; color: var(--text-primary); margin: 0; }
          .empty-state p { color: var(--text-muted); font-size: 14px; margin: 0; }
        `}</style>
      </div>
    );
  }

  const NodeCard = ({ n }: { n: NodeItem & { nodeX?: number; nodeY?: number } }) => {
    const fns = nodeFns(n.id);
    const isConn = connectMode && (connectFirst === n.id || connectSecond === n.id);
    const active = selectedNode === n.id;
    const x = n.nodeX ?? n.x;
    const y = n.nodeY ?? n.y;

    return (
      <div
        className={`node-card${active ? ' active' : ''}${isConn ? ' connecting' : ''}`}
        style={{ left: x, top: y, width: n.w || 180 }}
        onClick={(e) => {
          e.stopPropagation();
          if (connectMode) {
            if (!connectFirst) setConnectFirst(n.id);
            else if (!connectSecond) setConnectSecond(n.id);
          } else {
            setSelectedNode(n.id);
          }
        }}
        onDoubleClick={() => setEditingNode(n.id)}
        onPointerDown={(e) => handleNodePointerDown(e, n)}
        onPointerMove={(e) => handleNodePointerMove(e, n)}
        onPointerUp={(e) => handleNodePointerUp(e, n)}
      >
        <div className="node-name">{n.name}</div>
        {(n.description || n.notes) && (
          <div className="node-meta-tooltip">
            {n.description && <div className="node-meta-desc">📝 {n.description.slice(0, 60)}{n.description.length > 60 ? '...' : ''}</div>}
            {n.notes && <div className="node-meta-notes">🗒️ {n.notes.slice(0, 60)}{n.notes.length > 60 ? '...' : ''}</div>}
          </div>
        )}
        {fns.slice(0, 4).map(f => (
          <span key={f.id} className="node-fn-tag">{f.icon || '⚙️'} {f.name}</span>
        ))}
        {!fns.length && !n.description && !n.notes && <div className="node-hint">Double-click to edit</div>}
      </div>
    );
  };

  return (
    <div className="app-layout">
      <style>{`
        .app-layout { background: var(--bg); height: 100vh; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }
        
        /* Topbar */
        .topbar { display: flex; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--surface); align-items: center; height: 48px; flex-shrink: 0; }
        .topbar-logo { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-right: 4px; display: flex; align-items: center; gap: 4px; }
        .topbar-name { font-size: 14px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px; }
        .topbar-actions { display: flex; gap: 6px; margin-left: auto; }
        .topbar-actions.desktop { display: flex; }
        .topbar-actions.mobile { display: none; }
        .hamburger { display: none; background: none; border: none; color: var(--text-secondary); font-size: 20px; cursor: pointer; padding: 4px 8px; }

        /* Project Switcher */
        .project-switcher { position: relative; margin-right: 8px; flex-shrink: 0; }
        .project-switcher-trigger { display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 4px 8px; border-radius: var(--radius-sm); font-size: 14px; color: var(--text-primary); font-weight: 600; background: none; border: 1px solid transparent; white-space: nowrap; }
        .project-switcher-trigger:hover { background: var(--surface-hover); border-color: var(--border); }
        .project-switcher-trigger svg { width: 14px; height: 14px; color: var(--text-muted); }
        .project-switcher-dropdown { position: absolute; top: 42px; left: 0; background: var(--surface-elevated); border: 1px solid var(--border-hover); border-radius: var(--radius-md); padding: 4px; z-index: 200; box-shadow: 0 8px 32px rgba(0,0,0,0.4); min-width: 220px; max-height: 320px; overflow-y: auto; }
        .project-switcher-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: 13px; color: var(--text-secondary); border: none; background: none; width: 100%; text-align: left; }
        .project-switcher-item:hover { background: var(--surface-hover); }
        .project-switcher-item.active { background: var(--accent-bg); color: var(--text-primary); }
        .project-switcher-item .check { color: var(--accent); font-size: 11px; margin-left: auto; }
        .project-switcher-new { border-top: 1px solid var(--border); margin-top: 4px; padding-top: 4px; color: var(--accent); font-weight: 500; }

        /* User Menu */
        .user-menu { position: relative; margin-left: 8px; flex-shrink: 0; }
        .user-menu-trigger { display: flex; align-items: center; cursor: pointer; padding: 0; background: none; border: none; }
        .user-avatar { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; border: 2px solid transparent; }
        .user-avatar:hover { border-color: var(--accent); }
        .user-avatar-placeholder { width: 30px; height: 30px; border-radius: 50%; background: var(--accent-bg); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; border: 2px solid transparent; }
        .user-avatar-placeholder:hover { border-color: var(--accent); }
        .user-menu-dropdown { position: absolute; top: 44px; right: 0; background: var(--surface-elevated); border: 1px solid var(--border-hover); border-radius: var(--radius-md); padding: 8px; z-index: 200; box-shadow: 0 8px 32px rgba(0,0,0,0.4); min-width: 220px; }
        .user-menu-email { padding: 8px 12px; font-size: 12px; color: var(--text-muted); border-bottom: 1px solid var(--border); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .user-menu-logout { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: 13px; color: #f87171; border: none; background: none; width: 100%; text-align: left; }
        .user-menu-logout:hover { background: rgba(248,113,113,0.1); }

        /* Close dropdowns on outside click */

        /* Sidebar */
        .sidebar { width: 200px; border-right: 1px solid var(--border); overflow-y: auto; padding: 8px; background: var(--bg-raised); flex-shrink: 0; }
        .sidebar-header { padding: 4px 8px 8px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center; }
        .sidebar-item { padding: 8px 10px; border-radius: var(--radius-sm); cursor: pointer; margin-bottom: 2px; font-size: 13px; display: flex; align-items: center; gap: 6px; background: transparent; border: 1px solid transparent; color: var(--text-secondary); }
        .sidebar-item:hover { background: var(--surface-hover); }
        .sidebar-item.active { background: var(--accent-bg); border-color: var(--border-accent); color: var(--text-primary); }
        .sidebar-item .count { margin-left: auto; font-size: 10px; color: var(--text-muted); }
        .sidebar-empty { padding: 16px; text-align: center; color: var(--text-muted); font-size: 12px; }

        /* Canvas */
        .canvas { flex: 1; position: relative; overflow: auto; -webkit-overflow-scrolling: touch; }
        .canvas-grid { position: absolute; inset: 0; min-width: 2000px; min-height: 2000px; opacity: 0.025; background-image: radial-gradient(circle, var(--text-muted) 1px, transparent 1px); background-size: 24px 24px; pointer-events: none; }
        
        /* Node card */
        .node-card { position: absolute; min-height: 60px; background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius-lg); padding: 10px 12px; cursor: grab; font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); touch-action: none; user-select: none; -webkit-user-select: none; }
        .node-card:active { cursor: grabbing; }
        .node-card.active { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
        .node-card.connecting { border-color: #d29922; }
        .node-name { font-weight: 600; color: var(--text-primary); margin-bottom: 6px; font-size: 13px; }
        .node-fn-tag { display: inline-block; padding: 2px 7px; border-radius: var(--radius-sm); background: var(--accent-bg); color: var(--accent); font-size: 10px; margin: 0 2px 2px 0; font-weight: 500; white-space: nowrap; }
        .node-hint { font-size: 10px; color: var(--text-muted); font-style: italic; }
        .node-meta-tooltip { margin-bottom: 6px; }
        .node-meta-desc { font-size: 10px; color: var(--text-muted); margin-bottom: 2px; line-height: 1.4; }
        .node-meta-notes { font-size: 10px; color: var(--accent); opacity: 0.7; line-height: 1.4; }

        /* Modal overlay */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
        .modal-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; max-height: 70vh; overflow-y: auto; width: 100%; }

        /* Form elements */
        .fn-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg); border-radius: var(--radius-sm); margin-bottom: 4px; font-size: 13px; color: var(--text-secondary); }
        .fn-desc { font-size: 11px; color: var(--text-muted); margin-left: 24px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px; }
        .textarea-desc { width: 100%; min-height: 60px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--text-primary); font-size: 13px; resize: vertical; font-family: inherit; }
        .textarea-desc:focus { outline: none; border-color: var(--accent); }

        /* Node name input in modal */
        .node-name-input { padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--text-primary); font-family: inherit; }
        .node-name-input:focus { outline: none; border-color: var(--accent); }

        /* Trello-like function creation card */
        .fn-create-card { margin-top: 16px; padding: 12px; background: var(--bg); border: 1px solid var(--border-hover); border-radius: var(--radius-md); }
        .fn-create-label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
        .textarea-desc-tall { width: 100%; min-height: 80px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text-primary); font-size: 13px; resize: vertical; font-family: inherit; margin-bottom: 10px; }
        .textarea-desc-tall:focus { outline: none; border-color: var(--accent); }
        .fn-create-actions { display: flex; gap: 8px; }

        /* Mobile menu */
        .mobile-menu { position: fixed; top: 48px; right: 8px; background: var(--surface-elevated); border: 1px solid var(--border-hover); border-radius: var(--radius-md); padding: 4px; z-index: 200; box-shadow: 0 8px 32px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 2px; min-width: 160px; }
        .mobile-menu button { justify-content: flex-start; width: 100%; }

        /* Mobile sidebar overlay */
        .sidebar-overlay { position: fixed; inset: 0; z-index: 150; display: flex; }
        .sidebar-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
        .sidebar-drawer { position: relative; background: var(--bg-raised); border-right: 1px solid var(--border); width: 260px; height: 100%; overflow-y: auto; padding: 8px; z-index: 1; }

        /* Connection indicator */
        .conn-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--radius-sm); background: rgba(210,153,34,0.15); color: var(--warning); font-size: 12px; font-weight: 500; }

        /* Spinner */
        .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--border); border-top: 2px solid var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 4px; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ─── MOBILE ─── */
        @media (max-width: 768px) {
          .topbar-actions.desktop { display: none; }
          .topbar-actions.mobile { display: flex; }
          .hamburger { display: block; }
          .sidebar { display: none; }
          .node-card { padding: 8px 10px; min-height: 50px; }
          .node-name { font-size: 12px; margin-bottom: 4px; }
          .node-fn-tag { font-size: 9px; padding: 2px 5px; }
          .modal-card { max-width: 100%; max-height: 85vh; border-radius: var(--radius-lg) var(--radius-lg) 0 0; margin-top: auto; }
          .modal-overlay { align-items: flex-end; }
          .topbar { padding: 8px 10px; }
          .topbar-name { max-width: 80px; }
          .project-switcher-trigger { font-size: 13px; padding: 4px 6px; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .project-switcher-dropdown { left: -40px; min-width: 200px; }
          .user-menu-dropdown { right: -60px; min-width: 200px; }
          .fn-desc { max-width: 200px; }
        }
      `}</style>

      {/* Topbar */}
      <div className="topbar">
        <span className="topbar-logo">🧩</span>

        {/* Project Switcher */}
        <div className="project-switcher">
          <button
            className="project-switcher-trigger"
            onClick={(e) => { e.stopPropagation(); setProjectSwitcherOpen(!projectSwitcherOpen); setUserMenuOpen(false); }}
          >
            {projectName}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {projectSwitcherOpen && (
            <div className="project-switcher-dropdown fade-in">
              {projects.map(p => (
                <button
                  key={p.id}
                  className={`project-switcher-item${p.id === projectId ? ' active' : ''}`}
                  onClick={() => p.id !== projectId && switchProject(p.id, p.name)}
                >
                  <span>📁</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  {p.id === projectId && <span className="check">✓</span>}
                </button>
              ))}
              {!projects.length && (
                <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No projects yet</div>
              )}
              <button
                className="project-switcher-item project-switcher-new"
                onClick={createProject}
              >
                <span>➕</span> New Project
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Desktop actions */}
        <div className="topbar-actions desktop">
          <button onClick={openCreateModal} className="btn btn-ghost btn-sm">+ Node</button>
          <button onClick={() => setConnectMode(!connectMode)} className={connectMode ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
            {connectMode ? 'Selecting...' : '🔗 Connect'}
          </button>
          <button onClick={exportPlan} className="btn btn-primary btn-sm">📋 Export</button>
        </div>

        {/* User Menu */}
        <div className="user-menu">
          <button
            className="user-menu-trigger"
            onClick={(e) => { e.stopPropagation(); setUserMenuOpen(!userMenuOpen); setProjectSwitcherOpen(false); }}
          >
            {session.user?.image ? (
              <img className="user-avatar" src={session.user.image} alt={session.user.name || 'User'} referrerPolicy="no-referrer" />
            ) : (
              <div className="user-avatar-placeholder">
                {session.user?.name?.[0]?.toUpperCase() || session.user?.email?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </button>
          {userMenuOpen && (
            <div className="user-menu-dropdown fade-in">
              <div className="user-menu-email">
                Signed in as <strong>{session.user?.email || session.user?.name || 'User'}</strong>
              </div>
              <button className="user-menu-logout" onClick={() => signOut()}>
                <span>🚪</span> Logout
              </button>
            </div>
          )}
        </div>

        {/* Mobile hamburger */}
        <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div className="mobile-menu fade-in" onClick={() => setMenuOpen(false)}>
          <button onClick={openCreateModal} className="btn btn-ghost btn-sm">+ Node</button>
          <button onClick={() => { setConnectMode(!connectMode); setMenuOpen(false); }} className={connectMode ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
            {connectMode ? 'Selecting...' : '🔗 Connect'}
          </button>
          <button onClick={exportPlan} className="btn btn-primary btn-sm">📋 Export</button>
          <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
          <button onClick={() => { setSidebarOpen(true); setMenuOpen(false); }} className="btn btn-ghost btn-sm">📦 Nodes ({nodes.length})</button>
          <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => { switchProject(p.id, p.name); setMenuOpen(false); }}
              className={`btn btn-ghost btn-sm`}
              style={{ color: p.id === projectId ? 'var(--accent)' : undefined }}
            >
              {p.id === projectId ? '✓' : '📁'} {p.name}
            </button>
          ))}
          <button onClick={() => { createProject(); setMenuOpen(false); }} className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }}>➕ New Project</button>
          <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
          <button onClick={() => signOut()} className="btn btn-ghost btn-sm" style={{ color: '#f87171' }}>🚪 Logout</button>
        </div>
      )}

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="sidebar-overlay">
          <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
          <div className="sidebar-drawer">
            <div className="sidebar-header">
              Nodes
              <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            {nodes.map(n => {
              const fns = nodeFns(n.id);
              const active = selectedNode === n.id;
              return (
                <div key={n.id} className={`sidebar-item${active ? ' active' : ''}`} onClick={() => { setSelectedNode(n.id); setSidebarOpen(false); }}>
                  <span style={{ opacity: 0.5 }}>📦</span> {n.name}
                  <span className="count">{fns.length}</span>
                </div>
              );
            })}
            {!nodes.length && <div className="sidebar-empty">No nodes yet</div>}
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Desktop sidebar */}
        <div className="sidebar">
          <div className="sidebar-header">Nodes</div>
          {nodes.map(n => {
            const fns = nodeFns(n.id);
            const active = selectedNode === n.id;
            return (
              <div key={n.id} className={`sidebar-item${active ? ' active' : ''}`} onClick={() => setSelectedNode(n.id)}>
                <span style={{ opacity: 0.5 }}>📦</span> {n.name}
                <span className="count">{fns.length}</span>
              </div>
            );
          })}
          {!nodes.length && <div className="sidebar-empty">No nodes yet</div>}
        </div>

        {/* Canvas */}
        <div className="canvas" onClick={() => setSelectedNode(null)}>
          <div className="canvas-grid" />

          {/* Edges */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', minWidth: 2000, minHeight: 2000 }}>
            {edges.map(e => {
              const fn = nodes.find(n => n.id === e.from_node_id), tn = nodes.find(n => n.id === e.to_node_id);
              if (!fn || !tn) return null;
              return (
                <line
                  key={e.id}
                  x1={fn.x + (fn.w || 180)} y1={fn.y + 30}
                  x2={tn.x} y2={tn.y + 30}
                  stroke="var(--border-hover)" strokeWidth={2} strokeLinecap="round"
                />
              );
            })}
          </svg>

          {/* Nodes */}
          {nodes.map(n => <NodeCard key={n.id} n={n} />)}

          {/* Connect mode indicator */}
          {connectMode && (
            <div className="toast" style={{ bottom: connectSecond ? 80 : 24 }}>
              {connectFirst && <span className="conn-badge">{nodes.find(n => n.id === connectFirst)?.name}</span>}
              {connectFirst && !connectSecond && ' → tap second node'}
              {connectSecond && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="conn-badge">{nodes.find(n => n.id === connectFirst)?.name}</span>
                  <span style={{ color: 'var(--accent)' }}>→</span>
                  <span className="conn-badge">{nodes.find(n => n.id === connectSecond)?.name}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Connect confirmation modal */}
      {connectSecond && (
        <div className="modal-overlay fade-in">
          <div className="modal-card" style={{ maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text-primary)' }}>🔗 Connect Nodes</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
              {nodes.find(n => n.id === connectFirst)?.name}
              <span style={{ margin: '0 8px', color: 'var(--accent)' }}>→</span>
              {nodes.find(n => n.id === connectSecond)?.name}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setConnectSecond(null); setConnectFirst(null); }} className="btn btn-ghost btn-sm">Cancel</button>
              <button onClick={confirmConnect} className="btn btn-primary btn-sm">Connect</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Node modal */}
      {createModal && (
        <div className="modal-overlay fade-in mobile-sheet" onClick={() => setCreateModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text-primary)' }}>🆕 Create Node</h3>

            <div style={{ marginBottom: 12 }}>
              <label className="fn-create-label">Node Name *</label>
              <input
                value={newNodeName}
                onChange={e => setNewNodeName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    confirmCreateNode();
                  }
                }}
                placeholder="e.g., User Service"
                className="input"
                autoFocus
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="fn-create-label">Description (markdown, optional)</label>
              <textarea
                value={newNodeDesc}
                onChange={e => setNewNodeDesc(e.target.value)}
                placeholder="Describe what this node/component does..."
                className="textarea-desc"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="fn-create-label">Notes (markdown, optional — personal notes)</label>
              <textarea
                value={newNodeNotes}
                onChange={e => setNewNodeNotes(e.target.value)}
                placeholder="Private notes, reminders, TODOs..."
                className="textarea-desc"
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setCreateModal(false)} className="btn btn-ghost btn-sm">Cancel</button>
              <button onClick={confirmCreateNode} disabled={!newNodeName.trim()} className="btn btn-primary btn-sm">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Node modal */}
      {editingNode && (
        <div className="modal-overlay fade-in mobile-sheet" onClick={() => { setEditingNode(null); setNewFnName(''); setNewFnDesc(''); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            {/* Node rename input */}
            <div style={{ marginBottom: 16 }}>
              <label className="fn-create-label">Node Name</label>
              <input
                value={editNodeName}
                onChange={e => setEditNodeName(e.target.value)}
                onBlur={() => { if (editNodeName.trim()) updateNode(editingNode!, { name: editNodeName.trim() }); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (editNodeName.trim()) updateNode(editingNode!, { name: editNodeName.trim() }); (e.target as HTMLInputElement).blur(); } }}
                placeholder="Node name..."
                className="input node-name-input"
                style={{ fontSize: 16, fontWeight: 600, width: '100%' }}
              />
            </div>

            {/* Node description */}
            <div style={{ marginBottom: 12 }}>
              <label className="fn-create-label">Description (markdown)</label>
              <textarea
                value={editNodeDesc}
                onChange={e => setEditNodeDesc(e.target.value)}
                onBlur={() => updateNode(editingNode!, { description: editNodeDesc.trim() || null as any })}
                placeholder="Describe what this node does..."
                className="textarea-desc"
              />
            </div>

            {/* Node notes */}
            <div style={{ marginBottom: 16 }}>
              <label className="fn-create-label">Notes (private)</label>
              <textarea
                value={editNodeNotes}
                onChange={e => setEditNodeNotes(e.target.value)}
                onBlur={() => updateNode(editingNode!, { notes: editNodeNotes.trim() || null as any })}
                placeholder="Personal notes, reminders..."
                className="textarea-desc"
              />
            </div>

            {/* Existing functions list */}
            {nodeFns(editingNode).map(f => (
              <div key={f.id}>
                <div className="fn-row">
                  <span>{f.icon || '⚙️'}</span>
                  <span style={{ flex: 1 }}>{f.name}</span>
                  <button onClick={() => deleteFunction(f.id)} className="btn btn-danger btn-sm">×</button>
                </div>
                {f.description && <div className="fn-desc">📝 {f.description}</div>}
              </div>
            ))}
            {!nodeFns(editingNode).length && <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No functions yet — add one below</div>}

            {/* Trello-like function creation card */}
            <div className="fn-create-card">
              <label className="fn-create-label">Function name:</label>
              <input
                value={newFnName}
                onChange={e => setNewFnName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    addFunction();
                  }
                }}
                placeholder="e.g., userLogin"
                className="input"
              />

              <label className="fn-create-label">Description (markdown):</label>
              <textarea
                value={newFnDesc}
                onChange={e => setNewFnDesc(e.target.value)}
                placeholder="Describe what this function does... (markdown)"
                className="textarea-desc-tall"
              />

              <div className="fn-create-actions">
                <button onClick={addFunction} className="btn btn-primary btn-sm">+ Add</button>
                <button onClick={checkWithAI} className="btn btn-ghost btn-sm">🤖 Check with AI</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Duplicate Check Result Modal */}
      {checkModal && (
        <div className="modal-overlay fade-in mobile-sheet" onClick={() => setCheckModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: 'var(--text-primary)' }}>
              🤖 AI Duplicate Check
            </h3>

            {checkModal.checking ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)' }}>
                <span className="spinner" /> Checking with AI...
              </div>
            ) : checkModal.duplicates.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
                  No duplicates found for <strong>"{checkModal.name}"</strong>
                </p>
                {checkModal.description && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                    {checkModal.description}
                  </p>
                )}
              </div>
            ) : (
              <>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
                  <strong>"{checkModal.name}"</strong> อาจซ้ำกับ:
                </p>
                {checkModal.description && (
                  <div style={{
                    padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--text-muted)',
                    background: 'var(--bg)', borderRadius: 'var(--radius-sm)', whiteSpace: 'pre-wrap',
                  }}>
                    📝 {checkModal.description}
                  </div>
                )}
                {checkModal.duplicates.map((d, i) => (
                  <div key={i} style={{
                    padding: '10px 12px', background: 'var(--warning-bg, rgba(210,153,34,0.1))',
                    border: '1px solid var(--warning-border, rgba(210,153,34,0.3))',
                    borderRadius: 'var(--radius-sm)', marginBottom: 8, fontSize: 13,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>"{d.name}"</span>
                      <span style={{
                        fontSize: 11, padding: '1px 6px', borderRadius: 10,
                        background: d.confidence > 0.85 ? 'rgba(220,53,69,0.2)' : 'rgba(210,153,34,0.25)',
                        color: d.confidence > 0.85 ? '#f87171' : '#d29922',
                        fontWeight: 600,
                      }}>
                        {Math.round(d.confidence * 100)}%
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{d.reason}</div>
                  </div>
                ))}
              </>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setCheckModal(null)} className="btn btn-ghost btn-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
