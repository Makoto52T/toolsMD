'use client';

import { Session } from 'next-auth';
import { useState, useCallback, useEffect, useRef } from 'react';

interface Project { id: string; name: string; }
interface NodeItem { id: string; name: string; x: number; y: number; w: number; h: number; fnCount: number; }
interface FunctionItem { id: string; node_id: string; name: string; icon: string; category: string; sort_order: number; }
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
  const [toast, setToast] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Duplicate detection state
  const [dupModal, setDupModal] = useState<{ name: string; duplicates: { name: string; confidence: number; reason: string }[] } | null>(null);

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

  const createProject = async () => {
    const name = prompt('Project name:') || 'Untitled';
    const p = await api('POST', '/projects', { name });
    setProjectId(p.id); setProjectName(p.name);
  };

  const createNode = async () => {
    if (!projectId) return;
    const n = await api('POST', `/projects/${projectId}/nodes`, {
      name: 'New Node', x: 100 + Math.random() * 200, y: 80 + Math.random() * 160,
      w: 180, h: 80,
    });
    setNodes(prev => [...prev, { ...n, fnCount: 0 }]);
    setMenuOpen(false);
  };

  const updateNodePosition = async (nodeId: string, x: number, y: number) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, x, y } : n));
    try { await api('PATCH', `/nodes/${nodeId}`, { x, y }); } catch {}
  };

  const addFunction = async (forceAdd?: boolean) => {
    if (!editingNode || !newFnName.trim()) return;
    const name = newFnName.trim();

    // If forceAdd is false/undefined, check duplicates first
    if (!forceAdd) {
      try {
        const check = await api('POST', `/nodes/${editingNode}/functions/check-duplicate`, { name });
        const highDups = (check.duplicates || []).filter((d: any) => d.confidence > 0.7);
        if (highDups.length > 0) {
          setDupModal({ name, duplicates: highDups });
          return;
        }
      } catch (err: any) {
        // If check-duplicate endpoint fails, proceed normally
        console.warn('Duplicate check failed, proceeding:', err);
      }
    }

    // Proceed with add
    try {
      const fn = await api('POST', `/nodes/${editingNode}/functions`, { name, force: !!forceAdd });
      setFunctions(prev => [...prev, fn]);
      setNodes(prev => prev.map(n => n.id === editingNode ? { ...n, fnCount: (n.fnCount || 0) + 1 } : n));
      setNewFnName('');
      setDupModal(null);
    } catch (err: any) {
      if (err?.error === 'SEMANTIC_DUPLICATE') {
        setDupModal({ name, duplicates: err.duplicates || [] });
      } else {
        setToast(err?.message || err?.error || 'Failed to add function');
        setTimeout(() => setToast(''), 2000);
      }
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
        {fns.slice(0, 4).map(f => (
          <span key={f.id} className="node-fn-tag">{f.icon || '⚙️'} {f.name}</span>
        ))}
        {!fns.length && <div className="node-hint">Double-click to edit</div>}
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

        /* Modal overlay */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
        .modal-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; max-height: 70vh; overflow-y: auto; width: 100%; }

        /* Mobile menu */
        .mobile-menu { position: fixed; top: 48px; right: 8px; background: var(--surface-elevated); border: 1px solid var(--border-hover); border-radius: var(--radius-md); padding: 4px; z-index: 200; box-shadow: 0 8px 32px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 2px; min-width: 160px; }
        .mobile-menu button { justify-content: flex-start; width: 100%; }

        /* Mobile sidebar overlay */
        .sidebar-overlay { position: fixed; inset: 0; z-index: 150; display: flex; }
        .sidebar-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
        .sidebar-drawer { position: relative; background: var(--bg-raised); border-right: 1px solid var(--border); width: 260px; height: 100%; overflow-y: auto; padding: 8px; z-index: 1; }

        /* Connection indicator */
        .conn-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--radius-sm); background: rgba(210,153,34,0.15); color: var(--warning); font-size: 12px; font-weight: 500; }

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
        }
      `}</style>

      {/* Topbar */}
      <div className="topbar">
        <span className="topbar-logo">🧩<span className="topbar-name">{projectName}</span></span>
        <div style={{ flex: 1 }} />

        {/* Desktop actions */}
        <div className="topbar-actions desktop">
          <button onClick={createNode} className="btn btn-ghost btn-sm">+ Node</button>
          <button onClick={() => setConnectMode(!connectMode)} className={connectMode ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
            {connectMode ? 'Selecting...' : '🔗 Connect'}
          </button>
          <button onClick={exportPlan} className="btn btn-primary btn-sm">📋 Export</button>
        </div>

        {/* Mobile hamburger */}
        <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div className="mobile-menu fade-in" onClick={() => setMenuOpen(false)}>
          <button onClick={createNode} className="btn btn-ghost btn-sm">+ Node</button>
          <button onClick={() => { setConnectMode(!connectMode); setMenuOpen(false); }} className={connectMode ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
            {connectMode ? 'Selecting...' : '🔗 Connect'}
          </button>
          <button onClick={exportPlan} className="btn btn-primary btn-sm">📋 Export</button>
          <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
          <button onClick={() => { setSidebarOpen(true); setMenuOpen(false); }} className="btn btn-ghost btn-sm">📦 Nodes ({nodes.length})</button>
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

      {/* Edit Node modal */}
      {editingNode && (
        <div className="modal-overlay fade-in mobile-sheet" onClick={() => setEditingNode(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text-primary)' }}>
              ✏️ {nodes.find(n => n.id === editingNode)?.name}
            </h3>
            {nodeFns(editingNode).map(f => (
              <div key={f.id} className="fn-row">
                <span>{f.icon || '⚙️'}</span>
                <span>{f.name}</span>
                <button onClick={() => deleteFunction(f.id)} className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }}>×</button>
              </div>
            ))}
            {!nodeFns(editingNode).length && <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No functions yet</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <input
                value={newFnName}
                onChange={e => setNewFnName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFunction()}
                placeholder="Function name..."
                className="input"
                style={{ flex: 1 }}
              />
              <button onClick={() => addFunction()} className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>+ Add</button>
            </div>
          </div>
          <style>{`
            .fn-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg); border-radius: var(--radius-sm); margin-bottom: 4px; font-size: 13px; color: var(--text-secondary); }
          `}</style>
        </div>
      )}

      {/* Duplicate confirmation modal */}
      {dupModal && (
        <div className="modal-overlay fade-in mobile-sheet" onClick={() => setDupModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: 'var(--text-primary)' }}>⚠️ ฟังก์ชันอาจซ้ำกัน</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
              <strong>"{dupModal.name}"</strong> อาจซ้ำกับ:
            </p>
            {dupModal.duplicates.map((d, i) => (
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
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '16px 0', textAlign: 'center' }}>
              ต้องการเพิ่ม "{dupModal.name}" อยู่ดีหรือไม่?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDupModal(null)} className="btn btn-ghost btn-sm">ยกเลิก</button>
              <button onClick={() => addFunction(true)} className="btn btn-primary btn-sm">เพิ่มอยู่ดี</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
