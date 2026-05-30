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

  const css = (o: Record<string, string | number>) => o as React.CSSProperties;

  if (!projectId) {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col" style={{ background: 'var(--bg)' }}>
        <h1 className="text-4xl font-bold mb-2">🧩 toolsMD</h1>
        <p className="mb-8" style={{ color: 'var(--muted)' }}>Welcome, {session.user?.name}</p>
        <button onClick={createProject} className="px-6 py-3 rounded-lg text-white font-medium"
                style={{ background: 'var(--accent)' }}>+ Create Project</button>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg)', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', alignItems: 'center' }}>
        <b>🧩 toolsMD</b>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>/ {projectName}</span>
        <div style={{ flex: 1 }} />
        <button onClick={createNode} className="px-3 py-1.5 rounded-md border text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'transparent' }}>+ Node</button>
        <button onClick={() => setConnectMode(!connectMode)}
                className="px-3 py-1.5 rounded-md border text-sm"
                style={{ borderColor: connectMode ? 'var(--accent)' : 'var(--border)', color: connectMode ? '#fff' : 'var(--text)', background: connectMode ? 'var(--accent)' : 'transparent' }}>
          {connectMode ? 'Selecting...' : '🔗 Connect'}
        </button>
        <button onClick={exportPlan} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>📋 Export</button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: 240, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 8, background: 'var(--surface)' }}>
          {nodes.map(n => (
            <div key={n.id} onClick={() => setSelectedNode(n.id)}
                 style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4, fontSize: 13,
                          background: selectedNode === n.id ? 'rgba(68,147,248,0.1)' : 'transparent',
                          border: selectedNode === n.id ? '1px solid var(--accent)' : '1px solid transparent' }}>
              📦 {n.name} <span style={{ color: 'var(--muted)', fontSize: 10 }}>({nodeFns(n.id).length})</span>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div onClick={() => setSelectedNode(null)}
             style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {edges.map(e => {
              const fn = nodes.find(n => n.id === e.from_node_id), tn = nodes.find(n => n.id === e.to_node_id);
              if (!fn || !tn) return null;
              return <line key={e.id} x1={fn.x + fn.w} y1={fn.y + 30} x2={tn.x} y2={tn.y + 30} stroke="var(--border)" strokeWidth={2} />;
            })}
          </svg>
          {nodes.map(n => {
            const fns = nodeFns(n.id);
            const isConn = connectMode && (connectFirst === n.id || connectSecond === n.id);
            return (
              <div key={n.id}
                   onClick={(e) => {
                     e.stopPropagation();
                     if (connectMode) {
                       if (!connectFirst) setConnectFirst(n.id);
                       else if (!connectSecond) { setConnectSecond(n.id); }
                     } else {
                       setSelectedNode(n.id);
                     }
                   }}
                   onDoubleClick={() => setEditingNode(n.id)}
                   style={{
                     position: 'absolute', left: n.x, top: n.y, width: n.w, minHeight: 60,
                     background: 'var(--surface)',
                     border: `1.5px solid ${selectedNode === n.id ? 'var(--accent)' : isConn ? 'orange' : 'var(--border)'}`,
                     borderRadius: 10, padding: '10px 12px', cursor: 'move', fontSize: 12,
                   }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{n.name}</div>
                {fns.slice(0, 3).map(f => (
                  <span key={f.id} style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 8, background: 'rgba(68,147,248,0.1)', color: 'var(--accent)', fontSize: 10, margin: '0 2px 2px 0' }}>
                    {f.icon || '⚙️'} {f.name}
                  </span>
                ))}
                {!fns.length && <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>Double-click to edit</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Connect confirmation */}
      {connectSecond && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, minWidth: 400 }}>
            <h3 style={{ marginBottom: 16 }}>🔗 Connect</h3>
            <p>{nodes.find(n => n.id === connectFirst)?.name} → {nodes.find(n => n.id === connectSecond)?.name}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => { setConnectSecond(null); setConnectFirst(null); }} className="px-4 py-2 rounded-md border text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'transparent' }}>Cancel</button>
              <button onClick={confirmConnect} className="px-4 py-2 rounded-md text-sm text-white" style={{ background: 'var(--accent)', border: 'none' }}>Connect</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Node Modal */}
      {editingNode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
             onClick={() => setEditingNode(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, minWidth: 400, maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: 16 }}>✏️ {nodes.find(n => n.id === editingNode)?.name}</h3>
            <div style={{ marginBottom: 16 }}>
              {nodeFns(editingNode).map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg)', borderRadius: 6, marginBottom: 4, fontSize: 13 }}>
                  {f.icon || '⚙️'} {f.name}
                  <button onClick={() => deleteFunction(f.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newFnName} onChange={e => setNewFnName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addFunction()}
                     placeholder="Function name..." className="px-2 py-1.5 rounded-md text-sm"
                     style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              <button onClick={addFunction} className="px-3 py-1.5 rounded-md text-sm text-white" style={{ background: 'var(--accent)', border: 'none' }}>+ Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', padding: '8px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, zIndex: 200 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
