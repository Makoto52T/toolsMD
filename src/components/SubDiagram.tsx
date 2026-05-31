'use client';

import { useState, useRef, useCallback } from 'react';

interface NodeItem { id: string; name: string; description?: string; notes?: string; x: number; y: number; w: number; h: number; fnCount: number; }
interface FunctionItem { id: string; node_id: string; name: string; description?: string; fn_type?: string; schema?: any; icon: string; category: string; sort_order: number; }
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
  const [editFnType, setEditFnType] = useState('custom');
  const [editFnSchema, setEditFnSchema] = useState<any>({ config: {}, outputs: [] });
  const updateSchemaConfig = (key: string, value: any) => {
    setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, [key]: value } }));
  };
  const [activeTab, setActiveTab] = useState<'desc' | 'config' | 'outputs'>('desc');
  const [toast, setToast] = useState('');
  const [deleteEdgeTarget, setDeleteEdgeTarget] = useState<EdgeItem | null>(null);

  // Execute function state
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<any>(null);

  // Chain execution state
  const [chainExecuting, setChainExecuting] = useState(false);
  const [chainResult, setChainResult] = useState<any>(null);

  // Dot connection state (click output dot → click input dot = create edge)
  const [dotSource, setDotSource] = useState<{ fnId: string; fnName: string } | null>(null);

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
    if (!confirm('Delete this function? All connected edges will also be removed.')) return;
    await api('DELETE', `/functions/${fnId}`);
    setSelectedFn(null);
    setEditingFn(null);
    onUpdate();
  };

  const updateFunction = async (fnId: string, fields: { name?: string; description?: string; fn_type?: string; schema?: any }) => {
    try {
      await api('PATCH', `/functions/${fnId}`, fields);
      onUpdate();
    } catch (err: any) {
      setToast(err?.message || 'Failed to update');
      setTimeout(() => setToast(''), 2000);
    }
  };

  const runFunction = async () => {
    if (!editingFn) return;
    setExecuting(true);
    setExecResult(null);
    setChainResult(null);
    try {
      const res = await fetch(`/api/functions/${editingFn}/execute`, { method: 'POST' });
      const data = await res.json();
      setExecResult(data);
    } catch (err: any) {
      setExecResult({ success: false, message: err.message || 'Execution failed' });
    } finally {
      setExecuting(false);
    }
  };

  // Check if editing function has downstream connections (for chain run button)
  const hasDownstreamEdges = editingFn
    ? edges.some(e => e.from_function_id === editingFn)
    : false;

  const runChain = async () => {
    if (!editingFn) return;
    setChainExecuting(true);
    setChainResult(null);
    setExecResult(null);
    try {
      const res = await fetch(`/api/functions/${editingFn}/execute?chain=true`, { method: 'POST' });
      const data = await res.json();
      setChainResult(data);
    } catch (err: any) {
      setChainResult({ success: false, message: err.message || 'Chain execution failed' });
    } finally {
      setChainExecuting(false);
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
    // Reset all state FIRST before setting new values
    setEditFnName('');
    setEditFnDesc('');
    setEditFnType('custom');
    setEditFnSchema({ config: {}, outputs: [] });
    setEditingFn(fn.id);
    setEditFnName(fn.name);
    setEditFnDesc(fn.description || '');
    setEditFnType(fn.fn_type || 'custom');
    // Convert serialized headers/body back to list format for editor
    const schema = fn.schema && typeof fn.schema === 'object' ? JSON.parse(JSON.stringify(fn.schema)) : { config: {}, outputs: [] };
    if (!schema.config) schema.config = {};
    if (schema.config?.headers && typeof schema.config.headers === 'object' && !Array.isArray(schema.config.headers)) {
      schema.config.headersList = Object.entries(schema.config.headers as Record<string,string>).map(([k,v]) => ({ key: k, value: v }));
    }
    if (schema.config?.body && typeof schema.config.body === 'string') {
      try {
        const parsed = JSON.parse(schema.config.body);
        schema.config.bodyParams = Object.entries(parsed).map(([k,v]) => ({ key: k, value: String(v) }));
      } catch {}
    }
    setEditFnSchema(schema);
    setActiveTab('desc');
  };

  const saveEditFn = () => {
    if (!editingFn || !editFnName.trim()) return;
    const schema = { ...editFnSchema };
    // Serialize headersList → headers (object)
    if (schema.config?.headersList?.length) {
      const headers: Record<string, string> = {};
      schema.config.headersList.forEach((h: any) => { if (h.key) headers[h.key] = h.value; });
      schema.config.headers = headers;
    }
    // Serialize bodyParams → body (JSON string)
    if (schema.config?.bodyParams?.length) {
      const body: Record<string, any> = {};
      schema.config.bodyParams.forEach((p: any) => { if (p.key) body[p.key] = p.value; });
      schema.config.body = JSON.stringify(body);
    }
    const finalSchema = editFnType === 'custom' ? null : { config: schema.config, outputs: schema.outputs };
    updateFunction(editingFn, {
      name: editFnName.trim(),
      description: editFnDesc.trim() || undefined as any,
      fn_type: editFnType,
      schema: finalSchema || undefined as any,
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

        /* n8n-style input/output dots */
        .fn-dot {
          position: absolute;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: 2px solid var(--bg);
          z-index: 5;
          cursor: crosshair;
          transition: transform 0.15s;
        }
        .fn-dot:hover { transform: scale(1.4); }
        .fn-dot-input { background: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.3); }
        .fn-dot-output { background: #22c55e; box-shadow: 0 0 0 2px rgba(34,197,94,0.3); }
        .dot-active-source { animation: dotPulse 0.8s ease-in-out infinite; box-shadow: 0 0 0 4px rgba(34,197,94,0.6); }
        .dot-active-target { animation: dotPulse 0.8s ease-in-out infinite; box-shadow: 0 0 0 4px rgba(59,130,246,0.6); cursor: pointer; }
        @keyframes dotPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.5); }
        }

        /* n8n-style arrow indicator on connected functions */
        .fn-arrow-indicator {
          position: absolute;
          bottom: -18px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 14px;
          color: var(--accent);
          pointer-events: none;
        }

        .modal-card:focus-within {
          outline: 3px solid var(--accent);
          outline-offset: 2px;
        }

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
            const fnType = f.fn_type || 'custom';
            const typeBadge = fnType === 'http' ? '⚡ HTTP' : fnType === 'puppeteer' ? '🎭 Puppeteer' : '';
            const schema = f.schema || {};
            const outputs = schema.outputs || [];
            // Inputs derived from description {{var}} or schema inputs
            const descInputs = [...(f.description || '').matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
            const inputs = [...new Set([...(schema.inputs || []).map((i: any) => i.name || i), ...descInputs])];
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
                {/* Input dots (left side, blue) — click to finish edge from dotSource */}
                {inputs.map((inp: string, ii: number) => (
                  <div
                    key={`in-${ii}`}
                    className={`fn-dot fn-dot-input${dotSource && dotSource.fnId !== f.id ? ' dot-active-target' : ''}`}
                    style={{ left: -6, top: 24 + ii * 16 }}
                    title={`Input: ${inp}${dotSource ? ' — Click to connect from ' + dotSource.fnName : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dotSource && dotSource.fnId !== f.id) {
                        // Create edge: dotSource.fnId → this function
                        doCreateEdge(
                          node.id,
                          dotSource.fnId,
                          dotSource.fnName,
                          node.id,
                          f.id
                        );
                        setDotSource(null);
                      }
                    }}
                  />
                ))}
                {/* Output dots (right side, green) — click to start edge */}
                {outputs.map((out: any, oi: number) => (
                  <div
                    key={`out-${oi}`}
                    className={`fn-dot fn-dot-output${dotSource?.fnId === f.id ? ' dot-active-source' : ''}`}
                    style={{ right: -6, top: 24 + oi * 16 }}
                    title={`Output: ${out.name || '?'} (${out.type || 'string'})${out.extract ? ' ← ' + out.extract : ''}${dotSource ? '' : ' — Click to start connection'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dotSource) {
                        // Cancel if clicking same dot
                        setDotSource(null);
                      } else {
                        // Start edge creation from this output
                        setDotSource({ fnId: f.id, fnName: f.name });
                      }
                    }}
                  />
                ))}
                <div className="fn-card-icon">{f.icon || '⚙️'}</div>
                {typeBadge && <div style={{ fontSize: 8, color: 'var(--accent)', fontWeight: 600, opacity: 0.8 }}>{typeBadge}</div>}
                <div className="fn-card-name">{f.name}</div>
                {f.description && <div className="fn-card-desc">{f.description}</div>}
                {/* Arrow indicator when function has downstream connections */}
                {edges.some(e => e.from_function_id === f.id) && (
                  <div className="fn-arrow-indicator" title="Has downstream connections">↓</div>
                )}
                {edges.some(e => e.to_function_id === f.id) && (
                  <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 14, color: '#3b82f6', pointerEvents: 'none' }} title="Has upstream connections">↑</div>
                )}
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

      {/* ─── Edit Function Modal (Tabbed) ─── */}
      {editingFn && (
        <div className="modal-overlay fade-in mobile-sheet" onClick={() => setEditingFn(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ 
            width: '95vw',
            maxWidth: 800, 
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 12,
            paddingBottom: 16,
          }}>
            {/* Header: name + type */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>✏️ Edit Function</h3>
              <select
                value={editFnType}
                onChange={e => setEditFnType(e.target.value)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                }}
              >
                <option value="custom">📝 Custom</option>
                <option value="http">⚡ HTTP</option>
                <option value="puppeteer">🎭 Puppeteer</option>
              </select>
            </div>

            {/* Name field */}
            <div style={{ marginBottom: 12, flexShrink: 0 }}>
              <label className="fn-create-label">Name</label>
              <input
                value={editFnName}
                onChange={e => setEditFnName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditFn(); } }}
                className="input"
                style={{ width: '100%' }}
              />
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 0, flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
              {(['desc', ...(editFnType !== 'custom' ? ['config' as const] : []), 'outputs'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    background: 'transparent',
                    color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                    borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: activeTab === tab ? 600 : 400,
                  }}
                >
                  {tab === 'desc' ? '📝 Description' : tab === 'config' ? '⚙️ Config' : '📤 Outputs'}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingTop: 12 }}>
              {/* Description tab */}
              {activeTab === 'desc' && (
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
                  <label className="fn-create-label">Description (markdown)</label>
                  <textarea
                    value={editFnDesc}
                    onChange={e => setEditFnDesc(e.target.value)}
                    style={{
                      flex: 1,
                      width: '100%',
                      minHeight: 180,
                      padding: '12px 14px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg)',
                      color: 'var(--text-primary)',
                      fontSize: 15,
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      lineHeight: 1.7,
                    }}
                  />
                </div>
              )}

              {/* Config tab — HTTP */}
              {activeTab === 'config' && editFnType === 'http' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label className="fn-create-label">Method</label>
                    <select
                      value={editFnSchema.config?.method || 'GET'}
                      onChange={e => setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, method: e.target.value } }))}
                      style={{
                        width: '100%', padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                        background: 'var(--bg)', color: 'var(--text-primary)', fontSize: 14,
                      }}
                    >
                      {['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="fn-create-label">URL</label>
                    <input
                      value={editFnSchema.config?.url || ''}
                      onChange={e => setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, url: e.target.value } }))}
                      placeholder="https://example.com/api"
                      className="input" style={{ width: '100%' }}
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Use {'{{variable}}'} for dynamic values</div>
                  </div>
                  <div>
                    <label className="fn-create-label" style={{ marginBottom: 4 }}>Headers</label>
                    {(editFnSchema.config?.headersList || []).map((h: any, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                        <input
                          value={h.key || ''}
                          onChange={e => {
                            const next = [...(editFnSchema.config?.headersList || [])];
                            next[i] = { ...next[i], key: e.target.value };
                            updateSchemaConfig('headersList', next);
                          }}
                          placeholder="Key"
                          className="input" style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
                        />
                        <input
                          value={h.value || ''}
                          onChange={e => {
                            const next = [...(editFnSchema.config?.headersList || [])];
                            next[i] = { ...next[i], value: e.target.value };
                            updateSchemaConfig('headersList', next);
                          }}
                          placeholder="Value"
                          className="input" style={{ flex: 2, fontSize: 12, padding: '5px 8px' }}
                        />
                        <button
                          onClick={() => {
                            const next = [...(editFnSchema.config?.headersList || [])];
                            next.splice(i, 1);
                            updateSchemaConfig('headersList', next);
                          }}
                          style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, cursor: 'pointer', fontSize: 14, padding: '0 8px' }}
                        >✕</button>
                      </div>
                    ))}
                    <button
                      onClick={() => updateSchemaConfig('headersList', [...(editFnSchema.config?.headersList || []), { key: '', value: '' }])}
                      style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: '1px dashed var(--border)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', width: '100%', marginTop: 2 }}
                    >+ Add Header</button>
                  </div>
                  <div>
                    <label className="fn-create-label" style={{ marginBottom: 4 }}>Body Parameters</label>
                    {(editFnSchema.config?.bodyParams || []).map((p: any, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                        <input
                          value={p.key || ''}
                          onChange={e => {
                            const next = [...(editFnSchema.config?.bodyParams || [])];
                            next[i] = { ...next[i], key: e.target.value };
                            updateSchemaConfig('bodyParams', next);
                          }}
                          placeholder="Key"
                          className="input" style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
                        />
                        <input
                          value={p.value || ''}
                          onChange={e => {
                            const next = [...(editFnSchema.config?.bodyParams || [])];
                            next[i] = { ...next[i], value: e.target.value };
                            updateSchemaConfig('bodyParams', next);
                          }}
                          placeholder="Value (use {'{{var}}'})"
                          className="input" style={{ flex: 2, fontSize: 12, padding: '5px 8px' }}
                        />
                        <button
                          onClick={() => {
                            const next = [...(editFnSchema.config?.bodyParams || [])];
                            next.splice(i, 1);
                            updateSchemaConfig('bodyParams', next);
                          }}
                          style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, cursor: 'pointer', fontSize: 14, padding: '0 8px' }}
                        >✕</button>
                      </div>
                    ))}
                    <button
                      onClick={() => updateSchemaConfig('bodyParams', [...(editFnSchema.config?.bodyParams || []), { key: '', value: '' }])}
                      style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: '1px dashed var(--border)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', width: '100%', marginTop: 2 }}
                    >+ Add Parameter</button>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      Content-Type: application/json unless overridden
                    </div>
                  </div>
                </div>
              )}

              {/* Config tab — Puppeteer */}
              {activeTab === 'config' && editFnType === 'puppeteer' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={editFnSchema.config?.launch?.headless !== false}
                      onChange={e => setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, launch: { ...s.config?.launch, headless: e.target.checked } } }))}
                    />
                    Headless mode
                  </label>
                  <div>
                    <label className="fn-create-label" style={{ marginBottom: 8, display: 'block' }}>Steps</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(editFnSchema.config?.steps || []).map((step: any, i: number) => (
                        <div key={i} style={{
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          padding: 10,
                          background: 'var(--bg)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, minWidth: 40 }}>Step {i + 1}</span>
                            <select
                              value={step.action || 'goto'}
                              onChange={e => {
                                const newSteps = [...(editFnSchema.config?.steps || [])];
                                newSteps[i] = { action: e.target.value };
                                setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, steps: newSteps } }));
                              }}
                              style={{
                                flex: 1, padding: '4px 8px',
                                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                                background: 'var(--bg)', color: 'var(--text-primary)', fontSize: 12,
                              }}
                            >
                              {['goto','click','type','waitFor','waitForFn','sleep','extract','screenshot'].map(a => (
                                <option key={a} value={a}>{a}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                const newSteps = [...(editFnSchema.config?.steps || [])];
                                newSteps.splice(i, 1);
                                setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, steps: newSteps } }));
                              }}
                              style={{
                                background: 'rgba(239,68,68,0.15)', color: '#f87171',
                                border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4,
                                cursor: 'pointer', fontSize: 11, padding: '2px 8px',
                              }}
                            >✕</button>
                          </div>
                          {/* Step-specific fields */}
                          {(step.action === 'goto' || !step.action || step.action === 'goto') && (
                            <div style={{ marginTop: 4 }}>
                              <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>URL</label>
                              <input
                                value={step.url || ''}
                                onChange={e => {
                                  const newSteps = [...(editFnSchema.config?.steps || [])];
                                  newSteps[i] = { ...newSteps[i], url: e.target.value };
                                  setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, steps: newSteps } }));
                                }}
                                placeholder="https://..."
                                className="input" style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}
                              />
                            </div>
                          )}
                          {(step.action === 'click' || step.action === 'type' || step.action === 'waitFor') && (
                            <div>
                              <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Selector</label>
                              <input
                                value={step.selector || ''}
                                onChange={e => {
                                  const newSteps = [...(editFnSchema.config?.steps || [])];
                                  newSteps[i] = { ...newSteps[i], selector: e.target.value };
                                  setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, steps: newSteps } }));
                                }}
                                placeholder="input[name='username']"
                                className="input" style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}
                              />
                            </div>
                          )}
                          {step.action === 'type' && (
                            <div style={{ marginTop: 4 }}>
                              <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Value (use {'{{var}}'} for templates)</label>
                              <input
                                value={step.value || ''}
                                onChange={e => {
                                  const next = [...(editFnSchema.config?.steps || [])];
                                  next[i] = { ...next[i], value: e.target.value };
                                  setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, steps: next } }));
                                }}
                                placeholder="{{password}}"
                                className="input" style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}
                              />
                            </div>
                          )}
                          {step.action === 'waitForFn' && (
                            <div style={{ marginTop: 4 }}>
                              <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>JS Function</label>
                              <textarea
                                value={step.fn || ''}
                                onChange={e => {
                                  const next = [...(editFnSchema.config?.steps || [])];
                                  next[i] = { ...next[i], fn: e.target.value };
                                  setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, steps: next } }));
                                }}
                                placeholder="() => document.readyState === 'complete'"
                                rows={2}
                                style={{ width: '100%', fontSize: 11, fontFamily: 'monospace', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', color: 'var(--text-primary)', resize: 'vertical' }}
                              />
                            </div>
                          )}
                          {step.action === 'sleep' && (
                            <div style={{ marginTop: 4 }}>
                              <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Milliseconds</label>
                              <input
                                type="number"
                                value={step.ms || 1000}
                                onChange={e => {
                                  const next = [...(editFnSchema.config?.steps || [])];
                                  next[i] = { ...next[i], ms: parseInt(e.target.value) || 0 };
                                  setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, steps: next } }));
                                }}
                                className="input" style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}
                              />
                            </div>
                          )}
                          {(step.action === 'extract' || step.action === 'screenshot') && (
                            <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
                              {step.action === 'extract' && (
                                <>
                                  <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Name</label>
                                    <input
                                      value={step.name || ''}
                                      onChange={e => {
                                        const next = [...(editFnSchema.config?.steps || [])];
                                        next[i] = { ...next[i], name: e.target.value };
                                        setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, steps: next } }));
                                      }}
                                      placeholder="cookie"
                                      className="input" style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}
                                    />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>From</label>
                                    <select
                                      value={step.from || 'cookies'}
                                      onChange={e => {
                                        const next = [...(editFnSchema.config?.steps || [])];
                                        next[i] = { ...next[i], from: e.target.value };
                                        setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, steps: next } }));
                                      }}
                                      style={{ width: '100%', fontSize: 12, padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)' }}
                                    >
                                      <option value="cookies">cookies</option>
                                      <option value="url">url</option>
                                      <option value="title">title</option>
                                      <option value="text:selector">text:selector</option>
                                      <option value="html:selector">html:selector</option>
                                    </select>
                                  </div>
                                </>
                              )}
                              {step.action === 'screenshot' && (
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Name</label>
                                  <input
                                    value={step.name || ''}
                                    onChange={e => {
                                      const next = [...(editFnSchema.config?.steps || [])];
                                      next[i] = { ...next[i], name: e.target.value };
                                      setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, steps: next } }));
                                    }}
                                    placeholder="screenshot1"
                                    className="input" style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const steps = editFnSchema.config?.steps || [];
                          setEditFnSchema((s: any) => ({ ...s, config: { ...s.config, steps: [...steps, { action: 'goto' }] } }));
                        }}
                        style={{
                          padding: '8px 16px',
                          border: '1px dashed var(--accent)',
                          borderRadius: 'var(--radius-md)',
                          background: 'transparent',
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          fontSize: 13,
                          width: '100%',
                        }}
                      >+ Add Step</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Outputs tab */}
              {activeTab === 'outputs' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label className="fn-create-label" style={{ marginBottom: 4 }}>Output Variables</label>
                  {(editFnSchema.outputs || []).map((out: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        value={out.name || ''}
                        onChange={e => {
                          const next = [...(editFnSchema.outputs || [])];
                          next[i] = { ...next[i], name: e.target.value };
                          setEditFnSchema((s: any) => ({ ...s, schema: s.schema, config: s.config, outputs: next }));
                        }}
                        placeholder="var name"
                        className="input" style={{ flex: 2, minWidth: 100, fontSize: 12, padding: '6px 8px' }}
                      />
                      <select
                        value={out.type || 'string'}
                        onChange={e => {
                          const next = [...(editFnSchema.outputs || [])];
                          next[i] = { ...next[i], type: e.target.value };
                          setEditFnSchema((s: any) => ({ ...s, config: s.config, outputs: next }));
                        }}
                        style={{ flex: 1, minWidth: 80, fontSize: 12, padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)' }}
                      >
                        {['string','number','boolean','json','array'].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <input
                        value={out.extract || ''}
                        onChange={e => {
                          const next = [...(editFnSchema.outputs || [])];
                          next[i] = { ...next[i], extract: e.target.value };
                          setEditFnSchema((s: any) => ({ ...s, config: s.config, outputs: next }));
                        }}
                        placeholder="lodash path"
                        className="input" style={{ flex: 2, minWidth: 100, fontSize: 12, padding: '6px 8px' }}
                      />
                      <button
                        onClick={() => {
                          const next = [...(editFnSchema.outputs || [])];
                          next.splice(i, 1);
                          setEditFnSchema((s: any) => ({ ...s, config: s.config, outputs: next }));
                        }}
                        style={{
                          background: 'rgba(239,68,68,0.15)', color: '#f87171',
                          border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4,
                          cursor: 'pointer', fontSize: 14, padding: '4px 8px',
                        }}
                      >✕</button>
                    </div>
                  ))}
                  <button
                    onClick={() => setEditFnSchema((s: any) => ({ ...s, config: s.config, outputs: [...(s.outputs || []), { name: '', type: 'string', extract: '' }] }))}
                    style={{
                      padding: '8px 16px', border: '1px dashed var(--accent)',
                      borderRadius: 'var(--radius-md)', background: 'transparent',
                      color: 'var(--accent)', cursor: 'pointer', fontSize: 13,
                    }}
                  >+ Add Output</button>
                </div>
              )}
            </div>

            {/* Output panel (appears after execution) */}
            {execResult && (
              <div style={{ flexShrink: 0, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>📊 Output</span>
                  {execResult.success !== false ? (
                    <span style={{
                      background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600
                    }}>✅ {execResult.status || 'OK'}</span>
                  ) : (
                    <span style={{
                      background: 'rgba(239,68,68,0.15)', color: '#f87171',
                      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600
                    }}>❌ {execResult.message || 'Error'}</span>
                  )}
                  {execResult.duration_ms != null && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{execResult.duration_ms}ms</span>
                  )}
                </div>
                {execResult.extracts && Object.keys(execResult.extracts).length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Extracted values:</div>
                    {Object.entries(execResult.extracts).map(([k, v]) => (
                      <div key={k} style={{
                        display: 'inline-block',
                        background: 'rgba(59,130,246,0.12)',
                        color: '#60a5fa',
                        padding: '2px 8px',
                        borderRadius: 8,
                        fontSize: 11,
                        margin: '2px 4px 2px 0',
                        fontFamily: 'monospace',
                      }}>{k}: {String(v)}</div>
                    ))}
                  </div>
                )}
                <pre style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: 'var(--text-primary)',
                  maxHeight: 200,
                  overflow: 'auto',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>{JSON.stringify(execResult.body !== undefined ? execResult.body : execResult, null, 2)}</pre>
              </div>
            )}

            {/* Chain results panel */}
            {chainResult && chainResult.steps && (
              <div style={{ flexShrink: 0, marginTop: 12, borderTop: '1px solid var(--accent)', paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>🔗 Chain Run ({chainResult.total_steps || chainResult.steps.length} steps)</span>
                  {chainResult.success !== false ? (
                    <span style={{
                      background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600
                    }}>✅ Complete</span>
                  ) : (
                    <span style={{
                      background: 'rgba(239,68,68,0.15)', color: '#f87171',
                      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600
                    }}>❌ Failed</span>
                  )}
                </div>
                {chainResult.steps.map((step: any) => (
                  <div key={step.step} style={{
                    border: `1px solid ${step.success !== false ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    marginBottom: 8,
                    background: step.success !== false ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        background: 'var(--accent-bg)', color: 'var(--accent)',
                        padding: '1px 6px', borderRadius: 6, fontSize: 10, fontWeight: 700
                      }}>Step {step.step}</span>
                      <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>{step.function_name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{step.fn_type}</span>
                      {step.status && (
                        <span style={{
                          background: step.success !== false ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                          color: step.success !== false ? '#22c55e' : '#f87171',
                          padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 600
                        }}>{step.status}</span>
                      )}
                      {step.duration_ms != null && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{step.duration_ms}ms</span>
                      )}
                    </div>
                    {step.extracts && Object.keys(step.extracts).length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        {Object.entries(step.extracts).map(([k, v]) => (
                          <span key={k} style={{
                            display: 'inline-block',
                            background: 'rgba(59,130,246,0.1)',
                            color: '#60a5fa',
                            padding: '1px 6px',
                            borderRadius: 6,
                            fontSize: 10,
                            margin: '1px 3px 1px 0',
                            fontFamily: 'monospace',
                          }}>{k}: {String(v)}</span>
                        ))}
                      </div>
                    )}
                    {/* Show body preview */}
                    {step.body !== undefined && (
                      <pre style={{
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        padding: '6px 8px',
                        fontSize: 10,
                        fontFamily: 'monospace',
                        color: 'var(--text-primary)',
                        maxHeight: 80,
                        overflow: 'auto',
                        margin: '4px 0 0 0',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>{JSON.stringify(step.body, null, 2)}</pre>
                    )}
                    {step.message && (
                      <div style={{ fontSize: 10, color: '#f87171', marginTop: 2 }}>{step.message}</div>
                    )}
                  </div>
                ))}
                {chainResult.final_extracts && Object.keys(chainResult.final_extracts).length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>🏁 Final accumulated values:</div>
                    {Object.entries(chainResult.final_extracts).map(([k, v]) => (
                      <span key={k} style={{
                        display: 'inline-block',
                        background: 'rgba(34,197,94,0.12)',
                        color: '#4ade80',
                        padding: '2px 8px',
                        borderRadius: 8,
                        fontSize: 11,
                        margin: '2px 4px 2px 0',
                        fontFamily: 'monospace',
                      }}>{k}: {String(v)}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0, paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 12 }}>
              <button onClick={() => setEditingFn(null)} className="btn btn-ghost btn-sm">Cancel</button>
              {(editFnType === 'http' || editFnType === 'puppeteer') && (
                <>
                  <button
                    onClick={runFunction}
                    disabled={executing || chainExecuting}
                    className="btn btn-sm"
                    style={{
                      background: executing ? 'var(--border)' : 'rgba(34,197,94,0.15)',
                      color: executing ? 'var(--text-muted)' : '#22c55e',
                      border: executing ? '1px solid var(--border)' : '1px solid rgba(34,197,94,0.3)',
                    }}
                  >{executing ? '⏳ Running...' : '▶ Run'}</button>
                  {hasDownstreamEdges && (
                    <button
                      onClick={runChain}
                      disabled={executing || chainExecuting}
                      className="btn btn-sm"
                      style={{
                        background: chainExecuting ? 'var(--border)' : 'rgba(59,130,246,0.15)',
                        color: chainExecuting ? 'var(--text-muted)' : '#3b82f6',
                        border: chainExecuting ? '1px solid var(--border)' : '1px solid rgba(59,130,246,0.3)',
                      }}
                      title="Run all connected functions in chain"
                    >{chainExecuting ? '⏳ Chain...' : '▶ Run Chain'}</button>
                  )}
                </>
              )}
              <button onClick={saveEditFn} disabled={!editFnName.trim()} className="btn btn-primary btn-sm">Save</button>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, flexShrink: 0 }}>
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
