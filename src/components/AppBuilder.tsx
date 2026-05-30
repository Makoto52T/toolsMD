'use client';

import { Session } from 'next-auth';
import { useState, useCallback, useEffect } from 'react';

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
      name: 'New Node', x: 300 + Math.random() * 200, y: 200 + Math.random() * 200,
    });
    setNodes(prev => [...prev, { ...n, fnCount: 0 }]);
  };

  const addFunction = async () => {
    if (!editingNode || !newFnName.trim()) return;
    const fn = await api('POST', `/nodes/${editingNode}/functions`, { name: newFnName.trim() });
    setFunctions(prev => [...prev, fn]);
    setNodes(prev => prev.map(n => n.id === editingNode ? { ...n, fnCount: (n.fnCount || 0) + 1 } : n));
    setNewFnName('');
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

  // ─── Empty state ─────────────────────────────────
  if (!projectId) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', flexDirection: 'column', gap: 16,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 'var(--radius-md)',
          background: 'var(--accent-bg)', border: '1px solid var(--border-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
        }}>🧩</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>toolsMD</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Welcome, {session.user?.name}
        </p>
        <button
          onClick={createProject}
          className="btn btn-primary btn-lg"
          style={{ marginTop: 8 }}
        >
          + Create Project
        </button>
      </div>
    );
  }

  // ─── Main app ─────────────────────────────────
  return (
    <div style={{ background: 'var(--bg)', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        alignItems: 'center',
        height: 48,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginRight: 4 }}>🧩</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>/</span>
        <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{projectName}</span>
        <div style={{ flex: 1 }} />
        <button onClick={createNode} className="btn btn-ghost btn-sm">+ Node</button>
        <button
          onClick={() => setConnectMode(!connectMode)}
          className={connectMode ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
        >
          {connectMode ? 'Selecting...' : '🔗 Connect'}
        </button>
        <button onClick={exportPlan} className="btn btn-primary btn-sm">📋 Export</button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{
          width: 220, borderRight: '1px solid var(--border)',
          overflowY: 'auto', padding: 8, background: 'var(--bg-raised)',
          flexShrink: 0,
        }}>
          <div style={{ padding: '4px 8px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Nodes
          </div>
          {nodes.map(n => {
            const fns = nodeFns(n.id);
            const active = selectedNode === n.id;
            return (
              <div
                key={n.id}
                onClick={() => setSelectedNode(n.id)}
                style={{
                  padding: '8px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  marginBottom: 2, fontSize: 13,
                  background: active ? 'var(--accent-bg)' : 'transparent',
                  border: active ? '1px solid var(--border-accent)' : '1px solid transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{ opacity: 0.5 }}>📦</span>
                {n.name}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{fns.length}</span>
              </div>
            );
          })}
          {!nodes.length && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No nodes yet
            </div>
          )}
        </div>

        {/* Canvas */}
        <div
          onClick={() => setSelectedNode(null)}
          style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
        >
          {/* Grid dots */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.025,
            backgroundImage: 'radial-gradient(circle, var(--text-muted) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            pointerEvents: 'none',
          }} />

          {/* Edges */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {edges.map(e => {
              const fn = nodes.find(n => n.id === e.from_node_id), tn = nodes.find(n => n.id === e.to_node_id);
              if (!fn || !tn) return null;
              return (
                <line
                  key={e.id}
                  x1={fn.x + fn.w} y1={fn.y + 30}
                  x2={tn.x} y2={tn.y + 30}
                  stroke="var(--border-hover)"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {/* Nodes */}
          {nodes.map(n => {
            const fns = nodeFns(n.id);
            const isConn = connectMode && (connectFirst === n.id || connectSecond === n.id);
            const active = selectedNode === n.id;
            return (
              <div
                key={n.id}
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
                style={{
                  position: 'absolute', left: n.x, top: n.y, width: n.w, minHeight: 60,
                  background: 'var(--surface)',
                  border: `1.5px solid ${active ? 'var(--accent)' : isConn ? '#d29922' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  fontSize: 13,
                  boxShadow: active ? '0 0 0 3px var(--accent-ring)' : '0 2px 8px rgba(0,0,0,0.2)',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, fontSize: 14 }}>
                  {n.name}
                </div>
                {fns.slice(0, 4).map(f => (
                  <span
                    key={f.id}
                    style={{
                      display: 'inline-block', padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--accent-bg)', color: 'var(--accent)',
                      fontSize: 11, margin: '0 3px 3px 0', fontWeight: 500,
                    }}
                  >
                    {f.icon || '⚙️'} {f.name}
                  </span>
                ))}
                {!fns.length && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Double-click to edit
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Connect confirmation modal */}
      {connectSecond && (
        <div
          className="fade-in"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div className="card" style={{ minWidth: 360 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text-primary)' }}>
              🔗 Connect Nodes
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
              {nodes.find(n => n.id === connectFirst)?.name}
              <span style={{ margin: '0 8px', color: 'var(--accent)' }}>→</span>
              {nodes.find(n => n.id === connectSecond)?.name}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setConnectSecond(null); setConnectFirst(null); }}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
              <button onClick={confirmConnect} className="btn btn-primary btn-sm">
                Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Node modal */}
      {editingNode && (
        <div
          className="fade-in"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
          onClick={() => setEditingNode(null)}
        >
          <div
            className="card"
            onClick={e => e.stopPropagation()}
            style={{ minWidth: 400, maxHeight: '70vh', overflowY: 'auto' }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text-primary)' }}>
              ✏️ {nodes.find(n => n.id === editingNode)?.name}
            </h3>
            {nodeFns(editingNode).map(f => (
              <div
                key={f.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)',
                  marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)',
                }}
              >
                <span>{f.icon || '⚙️'}</span>
                <span>{f.name}</span>
                <button
                  onClick={() => deleteFunction(f.id)}
                  className="btn btn-danger btn-sm"
                  style={{ marginLeft: 'auto' }}
                >
                  ×
                </button>
              </div>
            ))}
            {!nodeFns(editingNode).length && (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No functions yet
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <input
                value={newFnName}
                onChange={e => setNewFnName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFunction()}
                placeholder="Function name..."
                className="input"
                style={{ flex: 1 }}
              />
              <button onClick={addFunction} className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
                + Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
