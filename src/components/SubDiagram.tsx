'use client';

import { useState, useRef, useCallback } from 'react';

interface NodeItem { id: string; name: string; description?: string; notes?: string; x: number; y: number; w: number; h: number; fnCount: number; }
interface FunctionItem { id: string; node_id: string; name: string; description?: string; icon: string; category: string; sort_order: number; }
interface EdgeItem { id: string; from_node_id: string; to_node_id: string; from_function_id: string | null; to_function_id: string | null; label: string; }

interface SubDiagramProps {
  node: NodeItem;
  functions: FunctionItem[];
  edges: EdgeItem[];
  allNodes: NodeItem[];
  allFunctions: FunctionItem[];
  onBack: () => void;
  onUpdate: () => void;
  projectId: string;
  projectName: string;
}

export default function SubDiagram({
  node,
  functions,
  edges,
  allNodes,
  allFunctions,
  onBack,
  onUpdate,
  projectId,
  projectName,
}: SubDiagramProps) {
  const [fnPositions, setFnPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedFn, setSelectedFn] = useState<string | null>(null);
  const [editingFn, setEditingFn] = useState<string | null>(null);
  const [editFnName, setEditFnName] = useState('');
  const [editFnDesc, setEditFnDesc] = useState('');
  const [toast, setToast] = useState('');
  const [deleteEdgeTarget, setDeleteEdgeTarget] = useState<EdgeItem | null>(null);

  // Create function modal
  const [createModal, setCreateModal] = useState(false);
  const [newFnName, setNewFnName] = useState('');
  const [newFnDesc, setNewFnDesc] = useState('');

  // Edge wizard
  const [edgeWizard, setEdgeWizard] = useState<{
    step: 1 | 2 | 3;
    fromNodeId: string;
    fromNodeName: string;
    fromFunctionId?: string;
    fromFunctionName?: string;
    toNodeId?: string;
    toNodeName?: string;
  } | null>(null);

  // Drag state
  const dragRef = useRef<{ fnId: string; startX: number; startY: number; fnX: number; fnY: number } | null>(null);

  // Long-press for connect
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [longPressFn, setLongPressFn] = useState<string | null>(null);

  const api = async (method: string, path: string, body?: any) => {
    const res = await fetch('/api' + path, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw await res.json();
    return res.json();
  };

  // ─── Sub edges ───
  const subEdges = edges.filter(e => {
    const ff = allFunctions.find(f => f.id === e.from_function_id);
    const tf = allFunctions.find(f => f.id === e.to_function_id);
    // Edge is "sub" if both endpoints are functions in THIS node
    if (ff && tf && ff.node_id === node.id && tf.node_id === node.id) return true;
    // Edge is "sub" if from_function is in this node (cross-node: show as dotted)
    if (ff && ff.node_id === node.id && (!tf || tf.node_id !== node.id)) return true;
    return false;
  });

  // Cross-node edges: from this node's function to function in another node
  const crossEdges = subEdges.filter(e => {
    const tf = allFunctions.find(f => f.id === e.to_function_id);
    return !tf || tf.node_id !== node.id;
  });

  // Internal edges: both functions in this node
  const internalEdges = subEdges.filter(e => {
    const tf = allFunctions.find(f => f.id === e.to_function_id);
    return tf && tf.node_id === node.id;
  });

  // ─── Function operations ───
  const getFnPos = (fnId: string, index: number) => {
    if (fnPositions[fnId]) return fnPositions[fnId];
    // Default grid layout
    const cols = Math.ceil(Math.sqrt(functions.length));
    const row = Math.floor(index / cols);
    const col = index % cols;
    return { x: 80 + col * 170, y: 60 + row * 100 };
  };

  const addFunction = async () => {
    if (!newFnName.trim()) return;
    try {
      await api('POST', `/nodes/${node.id}/functions`, {
        name: newFnName.trim(),
        description: newFnDesc.trim() || undefined,
      });
      setNewFnName('');
      setNewFnDesc('');
      setCreateModal(false);
      onUpdate();
    } catch (err: any) {
      setToast(err?.message || err?.error || 'Failed');
      setTimeout(() => setToast(''), 2000);
    }
  };

  const deleteFunction = async (fnId: string) => {
    await api('DELETE', `/functions/${fnId}`);
    setSelectedFn(null);
    setEditingFn(null);
    onUpdate();
  };

  const updateFunction = async (fnId: string, fields: { name?: string; description?: string }) => {
    try {
      await api('PATCH', `/functions/${fnId}`, fields);
      onUpdate();
    } catch (err: any) {
      setToast(err?.message || 'Failed to update');
      setTimeout(() => setToast(''), 2000);
    }
  };

  const deleteEdge = async (edgeId: string) => {
    await api('DELETE', `/edges/${edgeId}`);
    setDeleteEdgeTarget(null);
    onUpdate();
  };

  // ─── Edge wizard ───
  const startEdgeWizard = (fnId: string) => {
    const fn = functions.find(f => f.id === fnId);
    if (!fn) return;
    setEdgeWizard({
      step: 2, // skip step 1 since we know the source function
      fromNodeId: node.id,
      fromNodeName: node.name,
      fromFunctionId: fn.id,
      fromFunctionName: fn.name,
    });
    setLongPressFn(null);
  };

  const selectTargetNode = (targetNode: NodeItem) => {
    if (!edgeWizard?.fromFunctionId) return;
    const fns = allFunctions.filter(f => f.node_id === targetNode.id);
    if (fns.length === 0) {
      doCreateEdge(edgeWizard.fromNodeId, edgeWizard.fromFunctionId, edgeWizard.fromFunctionName || '?', targetNode.id, undefined);
    } else {
      setEdgeWizard(prev => prev ? { ...prev, step: 3, toNodeId: targetNode.id, toNodeName: targetNode.name } : null);
    }
  };

  const selectTargetFunction = (fn: FunctionItem) => {
    if (!edgeWizard?.toNodeId || !edgeWizard?.fromFunctionId) return;
    doCreateEdge(edgeWizard.fromNodeId, edgeWizard.fromFunctionId, edgeWizard.fromFunctionName || '?', edgeWizard.toNodeId, fn.id);
  };

  const selectTargetNodeWhole = () => {
    if (!edgeWizard?.toNodeId || !edgeWizard?.fromFunctionId) return;
    doCreateEdge(edgeWizard.fromNodeId, edgeWizard.fromFunctionId, edgeWizard.fromFunctionName || '?', edgeWizard.toNodeId, undefined);
  };

  const doCreateEdge = async (fromNodeId: string, fromFnId: string, fromFnName: string, toNodeId: string, toFnId?: string) => {
    if (fromFnId === toFnId) {
      setToast('Cannot connect function to itself');
      setTimeout(() => setToast(''), 2000);
      setEdgeWizard(null);
      return;
    }
    const targetNode = allNodes.find(n => n.id === toNodeId);
    const targetFn = toFnId ? allFunctions.find(f => f.id === toFnId) : null;
    const label = `${fromFnName} → ${targetFn?.name || targetNode?.name || '?'}`;
    try {
      await api('POST', `/projects/${projectId}/edges`, {
        from_node_id: fromNodeId,
        to_node_id: toNodeId,
        from_function_id: fromFnId,
        to_function_id: toFnId || null,
        label,
      });
      setToast(`${fromFnName} → ${targetFn?.icon || '📦'} ${targetFn?.name || targetNode?.name}`);
      setTimeout(() => setToast(''), 2500);
      onUpdate();
    } catch (err: any) {
      setToast(err?.error === 'DUPLICATE' ? 'Edge already exists' : err?.message || 'Failed');
      setTimeout(() => setToast(''), 2000);
    }
    setEdgeWizard(null);
  };

  // ─── Drag handlers ───
  const handleFnPointerDown = (e: React.PointerEvent, fnId: string, index: number) => {
    if (edgeWizard) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pos = getFnPos(fnId, index);
    dragRef.current = { fnId, startX: e.clientX, startY: e.clientY, fnX: pos.x, fnY: pos.y };

    // Long-press timer
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    const timer = setTimeout(() => {
      startEdgeWizard(fnId);
      dragRef.current = null;
    }, 800);
    longPressTimerRef.current = timer;
  };

  const handleFnPointerMove = (e: React.PointerEvent, fnId: string) => {
    if (!dragRef.current || dragRef.current.fnId !== fnId) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    }
    const newX = Math.max(0, dragRef.current.fnX + dx);
    const newY = Math.max(0, dragRef.current.fnY + dy);
    setFnPositions(prev => ({ ...prev, [fnId]: { x: newX, y: newY } }));
  };

  const handleFnPointerUp = (e: React.PointerEvent, fnId: string) => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    if (!dragRef.current || dragRef.current.fnId !== fnId) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newX = Math.max(0, dragRef.current.fnX + dx);
    const newY = Math.max(0, dragRef.current.fnY + dy);
    setFnPositions(prev => ({ ...prev, [fnId]: { x: newX, y: newY } }));
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // ─── Export ───
  const exportPlan = () => {
    let md = `# ${node.name} — Functions\n\n`;
    md += `> Project: ${projectName} | Functions: ${functions.length} | Edges: ${internalEdges.length + crossEdges.length}\n\n`;
    md += `## Functions\n\n`;
    functions.forEach((f, i) => {
      md += `### ${i + 1}. ${f.icon || '⚙️'} ${f.name}\n`;
      if (f.description) md += `- ${f.description}\n`;
      const outEdges = edges.filter(e => e.from_function_id === f.id);
      outEdges.forEach(e => {
        const tgtNode = allNodes.find(n => n.id === e.to_node_id);
        const tgtFn = allFunctions.find(tf => tf.id === e.to_function_id);
        md += `  - → ${tgtFn?.icon || ''}${tgtFn?.name || tgtNode?.name || '?'}`;
        if (tgtNode && tgtNode.id !== node.id) md += ` *(in ${tgtNode.name})*`;
        md += '\n';
      });
      md += '\n';
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${node.name.toLowerCase().replace(/\\s+/g, '-')}-functions.md`;
    a.click();
    setToast('Exported!');
    setTimeout(() => setToast(''), 2000);
  };

  // ─── Open editing modal ───
  const openEditFn = (fn: FunctionItem) => {
    setEditingFn(fn.id);
    setEditFnName(fn.name);
    setEditFnDesc(fn.description || '');
  };

  const saveEditFn = () => {
    if (!editingFn || !editFnName.trim()) return;
    updateFunction(editingFn, {
      name: editFnName.trim(),
      description: editFnDesc.trim() || undefined as any,
    });
    setEditingFn(null);
  };

  const fnList = functions.sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="app-layout">
      <style>{`
        .fn-card {
          position: absolute;
          width: 120px;
          min-height: 50px;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius-md);
          padding: 10px;
          cursor: grab;
          font-size: 12px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          touch-action: none;
          user-select: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .fn-card:active { cursor: grabbing; }
        .fn-card.active {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-ring);
        }
        .fn-card.long-press-pulse {
          animation: pulseLongPress 0.6s ease-in-out infinite;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-ring);
        }
        .fn-card-icon { font-size: 18px; }
        .fn-card-name {
          font-weight: 600;
          color: var(--text-primary);
          text-align: center;
          word-break: break-word;
          font-size: 11px;
          line-height: 1.3;
        }
        .fn-card-desc {
          font-size: 9px;
          color: var(--text-muted);
          text-align: center;
          word-break: break-word;
          line-height: 1.4;
          white-space: pre-wrap;
          max-width: 110px;
          max-height: 32px;
          overflow: hidden;
        }
        .fn-delete-btn {
          position: absolute;
          top: -6px;
          right: -6px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--danger);
          color: #fff;
          border: none;
          cursor: pointer;
          font-size: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          line-height: 1;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .fn-card:hover .fn-delete-btn,
        .fn-card.active .fn-delete-btn { opacity: 1; }

        /* Edge label pill */
        .edge-label-pill {
          position: absolute;
          font-size: 9px;
          padding: 2px 6px;
          border-radius: 10px;
          background: var(--accent-bg);
          color: var(--accent);
          white-space: nowrap;
          pointer-events: auto;
          cursor: pointer;
          border: 1px solid var(--border-accent);
          font-weight: 500;
        }
      `}</style>

      {/* Topbar */}
      <div className="topbar">
        <button onClick={onBack} className="btn btn-ghost btn-sm">
          ← {projectName}
        </button>
        <span className="topbar-name" style={{ maxWidth: 180 }}>{node.name}</span>
        <div style={{ flex: 1 }} />
        <div className="topbar-actions desktop">
          <button onClick={() => setCreateModal(true)} className="btn btn-ghost btn-sm">+ Function</button>
          <button onClick={exportPlan} className="btn btn-primary btn-sm">📋 Export</button>
        </div>
      </div>

      {/* Mobile toolbar */}
      <div className="mobile-toolbar">
        <button onClick={() => setCreateModal(true)} className="btn btn-ghost btn-sm">+ Function</button>
        <button onClick={exportPlan} className="btn btn-primary btn-sm">📋 Export</button>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div
          className="canvas"
          onClick={() => { setSelectedFn(null); if (edgeWizard) setEdgeWizard(null); }}
        >
          <div className="canvas-grid" />

          {/* SVG edges */}
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', minWidth: 2000, minHeight: 2000 }}>
            {/* Hit areas for tap-to-delete */}
            {internalEdges.map(e => {
              const ff = functions.find(f => f.id === e.from_function_id);
              const tf = functions.find(f => f.id === e.to_function_id);
              if (!ff || !tf) return null;
              const fi = fnList.findIndex(f => f.id === ff.id);
              const ti = fnList.findIndex(f => f.id === tf.id);
              const fp = getFnPos(ff.id, fi);
              const tp = getFnPos(tf.id, ti);
              return (
                <line
                  key={`hit-${e.id}`}
                  x1={fp.x + 60} y1={fp.y + 25}
                  x2={tp.x + 60} y2={tp.y + 25}
                  stroke="transparent"
                  strokeWidth={16} strokeLinecap="round"
                  style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                  onClick={(ev) => { ev.stopPropagation(); setDeleteEdgeTarget(e); }}
                />
              );
            })}
            {/* Internal edges */}
            {internalEdges.map(e => {
              const ff = functions.find(f => f.id === e.from_function_id);
              const tf = functions.find(f => f.id === e.to_function_id);
              if (!ff || !tf) return null;
              const fi = fnList.findIndex(f => f.id === ff.id);
              const ti = fnList.findIndex(f => f.id === tf.id);
              const fp = getFnPos(ff.id, fi);
              const tp = getFnPos(tf.id, ti);
              return (
                <line
                  key={e.id}
                  x1={fp.x + 60} y1={fp.y + 25}
                  x2={tp.x + 60} y2={tp.y + 25}
                  stroke="var(--accent)"
                  strokeWidth={2} strokeLinecap="round"
                />
              );
            })}
            {/* Cross-node edges (dotted) */}
            {crossEdges.map(e => {
              const ff = functions.find(f => f.id === e.from_function_id);
              if (!ff) return null;
              const fi = fnList.findIndex(f => f.id === ff.id);
              const fp = getFnPos(ff.id, fi);
              const tgtNode = allNodes.find(n => n.id === e.to_node_id);
              const tgtFn = allFunctions.find(f => f.id === e.to_function_id);
              // Point edge to the right side of canvas
              const x2 = fp.x + 300;
              const y2 = fp.y + 25;
              return (
                <g key={e.id}>
                  <line
                    x1={fp.x + 120} y1={fp.y + 25}
                    x2={x2} y2={y2}
                    stroke="var(--warning)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                  />
                  <text
                    x={fp.x + 130} y={fp.y + 20}
                    fill="var(--warning)"
                    fontSize={9}
                    fontFamily="inherit"
                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    onClick={(ev) => { ev.stopPropagation(); setDeleteEdgeTarget(e); }}
                  >
                    → {tgtFn?.icon || ''}{tgtFn?.name || tgtNode?.name || '?'}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Function cards */}
          {fnList.map((f, i) => {
            const pos = getFnPos(f.id, i);
            const active = selectedFn === f.id;
            return (
              <div
                key={f.id}
                className={`fn-card${active ? ' active' : ''}${longPressFn === f.id ? ' long-press-pulse' : ''}`}
                style={{ left: pos.x, top: pos.y }}
                onClick={(e) => { e.stopPropagation(); setSelectedFn(f.id); }}
                onDoubleClick={(e) => { e.stopPropagation(); openEditFn(f); }}
                onPointerDown={(e) => handleFnPointerDown(e, f.id, i)}
                onPointerMove={(e) => handleFnPointerMove(e, f.id)}
                onPointerUp={(e) => handleFnPointerUp(e, f.id)}
              >
                <button
                  className="fn-delete-btn"
                  onClick={(e) => { e.stopPropagation(); deleteFunction(f.id); }}
                >×</button>
                <div className="fn-card-icon">{f.icon || '⚙️'}</div>
                <div className="fn-card-name">{f.name}</div>
                {f.description && <div className="fn-card-desc">{f.description}</div>}
              </div>
            );
          })}

          {!fnList.length && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>⚙️</div>
              <div>No functions yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Click &quot;+ Function&quot; to add one</div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Create Function Modal ─── */}
      {createModal && (
        <div className="modal-overlay fade-in mobile-sheet" onClick={() => setCreateModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text-primary)' }}>⚙️ New Function</h3>
            <div style={{ marginBottom: 12 }}>
              <label className="fn-create-label">Function Name *</label>
              <input
                value={newFnName}
                onChange={e => setNewFnName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addFunction(); } }}
                placeholder="e.g., userLogin"
                className="input"
                autoFocus
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="fn-create-label">Description (markdown, optional)</label>
              <textarea
                value={newFnDesc}
                onChange={e => setNewFnDesc(e.target.value)}
                placeholder="Describe what this function does..."
                className="textarea-desc"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setCreateModal(false)} className="btn btn-ghost btn-sm">Cancel</button>
              <button onClick={addFunction} disabled={!newFnName.trim()} className="btn btn-primary btn-sm">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Function Modal ─── */}
      {editingFn && (
        <div className="modal-overlay fade-in mobile-sheet" onClick={() => setEditingFn(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ 
            maxWidth: 700, 
            width: '100%', 
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text-primary)', flexShrink: 0 }}>✏️ Edit Function</h3>
            <div style={{ marginBottom: 12, flexShrink: 0 }}>
              <label className="fn-create-label">Name</label>
              <input
                value={editFnName}
                onChange={e => setEditFnName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditFn(); } }}
                className="input"
                autoFocus
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: 16, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <label className="fn-create-label">Description</label>
              <textarea
                value={editFnDesc}
                onChange={e => setEditFnDesc(e.target.value)}
                style={{
                  flex: 1,
                  width: '100%',
                  minHeight: 200,
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg)',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  lineHeight: 1.6,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setEditingFn(null)} className="btn btn-ghost btn-sm">Cancel</button>
              <button onClick={saveEditFn} disabled={!editFnName.trim()} className="btn btn-primary btn-sm">Save</button>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12, flexShrink: 0 }}>
              <button
                onClick={() => { deleteFunction(editingFn); setEditingFn(null); }}
                className="btn btn-sm"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', width: '100%' }}
              >🗑️ Delete Function</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edge Wizard ─── */}
      {edgeWizard && (
        <div className="modal-overlay fade-in mobile-sheet">
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {edgeWizard.fromFunctionName || edgeWizard.fromNodeName}
              </span>
              <span>→</span>
              <span style={edgeWizard.step >= 3 ? { fontWeight: 600, color: 'var(--text-primary)' } : { opacity: 0.4 }}>
                {edgeWizard.toNodeName || '?'}
              </span>
            </div>

            {edgeWizard.step === 2 && (
              <>
                <h3 style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text-primary)' }}>
                  ⚙️ {edgeWizard.fromFunctionName}
                </h3>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>Select target node:</p>
                {allNodes.map(n => {
                  const count = allFunctions.filter(f => f.node_id === n.id).length;
                  return (
                    <button key={n.id} className="fn-selector-item" onClick={() => selectTargetNode(n)}>
                      <span style={{ fontSize: 15 }}>📦</span>
                      <span style={{ flex: 1, textAlign: 'left' }}>{n.name}{n.id === node.id ? ' (self)' : ''}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{count} fn{count !== 1 ? 's' : ''}</span>
                    </button>
                  );
                })}
              </>
            )}

            {edgeWizard.step === 3 && edgeWizard.toNodeId && (
              <>
                <h3 style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text-primary)' }}>
                  ⚙️ {edgeWizard.fromFunctionName} → {edgeWizard.toNodeName}
                </h3>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>Select target function:</p>
                {(() => {
                  const isSelf = edgeWizard.toNodeId === node.id;
                  const targetFns = allFunctions.filter(f => f.node_id === edgeWizard.toNodeId);
                  const available = isSelf
                    ? targetFns.filter(f => f.id !== edgeWizard.fromFunctionId)
                    : targetFns;
                  return available.map(f => (
                    <button key={f.id} className="fn-selector-item" onClick={() => selectTargetFunction(f)}>
                      <span style={{ fontSize: 15 }}>{f.icon || '⚙️'}</span>
                      <span style={{ flex: 1, textAlign: 'left' }}>{f.name}</span>
                    </button>
                  ));
                })()}
                {edgeWizard.toNodeId !== node.id && (
                  <>
                    <div style={{ borderTop: '2px dashed var(--border)', margin: '10px 0' }} />
                    <button className="fn-selector-item" onClick={selectTargetNodeWhole}>
                      <span style={{ fontSize: 15 }}>📦</span>
                      <span style={{ flex: 1, textAlign: 'left' }}>Whole node (no function)</span>
                    </button>
                  </>
                )}
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              {edgeWizard.step > 2
                ? <button onClick={() => setEdgeWizard(prev => prev ? { ...prev, step: 2 } : null)} className="btn btn-ghost btn-sm">← Back</button>
                : <div />}
              <button onClick={() => setEdgeWizard(null)} className="btn btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edge delete confirmation */}
      {deleteEdgeTarget && (
        <div className="modal-overlay fade-in" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setDeleteEdgeTarget(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: 'var(--text-primary)' }}>Delete connection?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)' }}>
              {deleteEdgeTarget.label || '(unnamed edge)'}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => setDeleteEdgeTarget(null)} className="btn btn-ghost btn-sm">Cancel</button>
              <button
                onClick={() => deleteEdge(deleteEdgeTarget.id)}
                className="btn btn-sm"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
