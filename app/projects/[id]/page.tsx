'use client';

import { useState, useEffect, useCallback, useMemo, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  Connection,
  Edge as RFEdge,
  Node as RFNode,
  NodeChange,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FullPageSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/components/Toast';
import { FlowNode, FlowNodeData } from '@/components/canvas/FlowNode';
import { NODE_TYPES, metaFor } from '@/components/canvas/nodeMeta';
import { TagsPanel, type Tag } from '@/components/canvas/TagsPanel';
import {
  ExecutionResultPanel,
  type ExecResult,
  type MissingBinding,
  type NodeBinding,
  type BindRequest,
} from '@/components/canvas/ExecutionResultPanel';

interface Project {
  id: string;
  name: string;
  description?: string;
}
interface ApiNode {
  id: string;
  type: string;
  name: string;
  description?: string;
  positionX: number;
  positionY: number;
  config?: Record<string, unknown>;
}
interface ApiEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [nodes, setNodes] = useState<ApiNode[]>([]);
  const [edges, setEdges] = useState<ApiEdge[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const [editingNode, setEditingNode] = useState<ApiNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiNode | null>(null);
  const [executing, setExecuting] = useState(false);
  // Result panel: null = closed. Holds an ordered list of node results plus a
  // title (single node name, or "Workflow").
  const [execPanel, setExecPanel] = useState<{
    title: string;
    results: ExecResult[];
    missingBindings: MissingBinding[];
  } | null>(null);
  // Per-node spinner state (single-node execute).
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [projRes, nodesRes, edgesRes] = await Promise.all([
        fetch(`/api/projects/${id}`),
        fetch(`/api/projects/${id}/nodes`),
        fetch(`/api/projects/${id}/edges`),
      ]);
      if (!projRes.ok) {
        router.push('/dashboard');
        return;
      }
      const projData = await projRes.json();
      setProject(projData);
      if (Array.isArray(projData.tags)) setTags(projData.tags);
      if (nodesRes.ok) setNodes(await nodesRes.json());
      if (edgesRes.ok) setEdges(await edgesRes.json());
    } catch {
      toast.error('Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [id, router, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  // ---- Node CRUD ----
  const addNode = async () => {
    const newNode = {
      type: 'function',
      name: 'New Node',
      description: '',
      positionX: 120 + Math.random() * 240,
      positionY: 80 + Math.random() * 200,
      config: {},
    };
    try {
      const res = await fetch(`/api/projects/${id}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNode),
      });
      if (res.ok) {
        const created: ApiNode = await res.json();
        setNodes((prev) => [...prev, created]);
        toast.success('Node added');
      } else toast.error('Failed to add node');
    } catch {
      toast.error('Network error');
    }
  };

  const persistPosition = useCallback(
    (node: ApiNode) => {
      fetch(`/api/projects/${id}/nodes/${node.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(node),
      }).catch(() => {});
    },
    [id],
  );

  const doDeleteNode = async () => {
    if (!deleteTarget) return;
    const nodeId = deleteTarget.id;
    try {
      await fetch(`/api/projects/${id}/nodes/${nodeId}`, { method: 'DELETE' });
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setEdges((prev) =>
        prev.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId),
      );
      toast.success('Node deleted');
    } catch {
      toast.error('Failed to delete node');
    } finally {
      setDeleteTarget(null);
    }
  };

  const saveNode = async () => {
    if (!editingNode) return;
    if (!editingNode.name.trim()) {
      toast.warning('Node name is required');
      return;
    }
    setSaving(true);
    try {
      await fetch(`/api/projects/${id}/nodes/${editingNode.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingNode),
      });
      setNodes((prev) => prev.map((n) => (n.id === editingNode.id ? editingNode : n)));
      toast.success('Node saved');
      setEditingNode(null);
    } catch {
      toast.error('Failed to save node');
    } finally {
      setSaving(false);
    }
  };

  // ---- Edges ----
  const createEdge = useCallback(
    async (sourceNodeId: string, targetNodeId: string) => {
      try {
        const res = await fetch(`/api/projects/${id}/edges`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceNodeId, targetNodeId, label: '' }),
        });
        if (res.ok) {
          const created: ApiEdge = await res.json();
          setEdges((prev) => [...prev, created]);
        } else toast.error('Failed to connect nodes');
      } catch {
        toast.error('Network error');
      }
    },
    [id, toast],
  );

  const deleteEdge = useCallback(
    async (edgeId: string) => {
      try {
        await fetch(`/api/projects/${id}/edges/${edgeId}`, { method: 'DELETE' });
        setEdges((prev) => prev.filter((e) => e.id !== edgeId));
      } catch {
        toast.error('Failed to delete edge');
      }
    },
    [id, toast],
  );

  // ---- Execute whole workflow ----
  const execute = async () => {
    setExecuting(true);
    try {
      const res = await fetch(`/api/projects/${id}/execute`, { method: 'POST' });
      const data = await res.json();
      const results: ExecResult[] = Array.isArray(data?.results) ? data.results : [];
      const missing: MissingBinding[] = Array.isArray(data?.missingBindings)
        ? data.missingBindings
        : [];
      // Adopt server-canonical tags (output bindings may have written values).
      if (Array.isArray(data?.tags)) setTags(data.tags);
      setExecPanel({ title: 'Workflow', results, missingBindings: missing });
      if (res.ok && results.every((r) => r.status === 'success')) toast.success('Execution finished');
      else toast.warning('Execution finished with errors');
    } catch {
      toast.error('Execution failed');
      setExecPanel({
        title: 'Workflow',
        results: [{ nodeId: '', status: 'error', error: 'Network error during execution.' }],
        missingBindings: [],
      });
    } finally {
      setExecuting(false);
    }
  };

  // ---- Execute a single node (n8n-style: fire one node, see its output) ----
  const executeOne = useCallback(
    async (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      setRunningNodeId(nodeId);
      try {
        const res = await fetch(`/api/projects/${id}/nodes/${nodeId}/execute`, { method: 'POST' });
        const data = await res.json();
        const result: ExecResult | undefined = data?.result;
        if (result) {
          const missing: MissingBinding[] = Array.isArray(data?.missingBindings)
            ? data.missingBindings
            : [];
          if (Array.isArray(data?.tags)) setTags(data.tags);
          setExecPanel({ title: node?.name ?? 'Node', results: [result], missingBindings: missing });
          if (result.status === 'success') toast.success('Node executed');
          else toast.warning('Node returned an error');
        } else {
          toast.error(data?.error || 'Execution failed');
        }
      } catch {
        toast.error('Execution failed');
        setExecPanel({
          title: node?.name ?? 'Node',
          results: [{ nodeId, status: 'error', error: 'Network error during execution.' }],
          missingBindings: [],
        });
      } finally {
        setRunningNodeId(null);
      }
    },
    [id, toast],
  );

  // ---- Tags ----
  // Persist the whole tag array (atomic replace). The PUT response returns the
  // server-canonical tags (with real ids assigned to newly-added rows), so we
  // adopt that back into state — keeps reference ids stable for node configs.
  const tagSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistTags = useCallback(
    (next: Tag[]) => {
      if (tagSaveTimer.current) clearTimeout(tagSaveTimer.current);
      tagSaveTimer.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/projects/${id}/tags`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: next }),
          });
          if (res.ok) {
            const saved: Tag[] = await res.json();
            setTags(saved);
          } else {
            const err = await res.json().catch(() => ({}));
            toast.error(err.error || 'Failed to save tags');
          }
        } catch {
          toast.error('Network error saving tags');
        }
      }, 400);
    },
    [id, toast],
  );

  const onTagsChange = useCallback(
    (next: Tag[]) => {
      setTags(next);
      persistTags(next);
    },
    [persistTags],
  );

  // ---- Output bindings (Response → Tag) ----
  // Persist a node's full config (used when we mutate node.config.outputBindings).
  const persistNodeConfig = useCallback(
    async (nodeId: string, config: Record<string, unknown>) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      const updated = { ...node, config };
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? updated : n)));
      try {
        await fetch(`/api/projects/${id}/nodes/${nodeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        });
      } catch {
        toast.error('Failed to save binding');
      }
    },
    [id, toast],
  );

  // Bind a response field to a tag: (1) ensure the tag exists / gets the value,
  // (2) record { path, tagId } in the node's config.outputBindings.
  const onBind = useCallback(
    async (req: BindRequest) => {
      const node = nodesRef.current.find((n) => n.id === req.nodeId);
      if (!node) return;

      // Resolve target tag id (create a new tag if requested).
      let tagId = req.tagId ?? '';
      let tagKey = '';
      let nextTags = tagsRef.current;
      if (req.mode === 'new') {
        const key = (req.newKey || '').trim();
        if (!key) {
          toast.warning('Tag key is required');
          return;
        }
        if (nextTags.some((t) => t.key === key)) {
          toast.error(`Tag "${key}" already exists`);
          return;
        }
        tagId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        tagKey = key;
        nextTags = [...nextTags, { id: tagId, key, value: req.value }];
      } else {
        const t = nextTags.find((x) => x.id === tagId);
        if (!t) {
          toast.error('Tag not found');
          return;
        }
        tagKey = t.key;
        // Seed the existing tag with the freshly-resolved value.
        nextTags = nextTags.map((x) => (x.id === tagId ? { ...x, value: req.value } : x));
      }

      // Persist tags first (PUT returns canonical ids; adopt them back).
      let savedTags = nextTags;
      try {
        const res = await fetch(`/api/projects/${id}/tags`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: nextTags }),
        });
        if (res.ok) {
          savedTags = await res.json();
          setTags(savedTags);
        } else {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || 'Failed to save tag');
          return;
        }
      } catch {
        toast.error('Network error saving tag');
        return;
      }

      // Map our temp tag id to the server-assigned id (match by key).
      const canonical = savedTags.find((t) => t.key === tagKey);
      const finalTagId = canonical?.id ?? tagId;

      // Update node.config.outputBindings (replace any existing binding for path).
      const cfg = (node.config ?? {}) as Record<string, unknown>;
      const prevBindings: NodeBinding[] = Array.isArray(cfg.outputBindings)
        ? (cfg.outputBindings as NodeBinding[])
        : [];
      const nextBindings = [
        ...prevBindings.filter((b) => b.path !== req.path),
        { path: req.path, tagId: finalTagId, tagKey },
      ];
      await persistNodeConfig(req.nodeId, { ...cfg, outputBindings: nextBindings });
      toast.success(`Bound ${req.path} → ${tagKey}`);
    },
    [id, persistNodeConfig, toast],
  );

  // Resolve a missing-binding alert: 'drop' removes the binding from the node;
  // 'keep' leaves the binding and the old tag value untouched (just dismiss row).
  const onResolveMissing = useCallback(
    async (m: MissingBinding, action: 'drop' | 'keep') => {
      setExecPanel((prev) =>
        prev
          ? {
              ...prev,
              missingBindings: prev.missingBindings.filter(
                (x) => !(x.nodeId === m.nodeId && x.path === m.path && x.tagId === m.tagId),
              ),
            }
          : prev,
      );
      if (action === 'keep') return;
      const node = nodesRef.current.find((n) => n.id === m.nodeId);
      if (!node) return;
      const cfg = (node.config ?? {}) as Record<string, unknown>;
      const prevBindings: NodeBinding[] = Array.isArray(cfg.outputBindings)
        ? (cfg.outputBindings as NodeBinding[])
        : [];
      const nextBindings = prevBindings.filter(
        (b) => !(b.path === m.path && b.tagId === m.tagId),
      );
      await persistNodeConfig(m.nodeId, { ...cfg, outputBindings: nextBindings });
      toast.success('Binding removed');
    },
    [persistNodeConfig, toast],
  );

  // nodeId -> bindings, derived from node configs (for the result panel).
  const bindingsByNode = useMemo(() => {
    const map: Record<string, NodeBinding[]> = {};
    for (const n of nodes) {
      const b = (n.config as Record<string, unknown> | undefined)?.outputBindings;
      if (Array.isArray(b)) map[n.id] = b as NodeBinding[];
    }
    return map;
  }, [nodes]);

  // tagId -> auto-write sources ("{nodeName}·{path}"), derived from all node
  // bindings. Used by TagsPanel to show "🔗 auto" + ⚠ multi-writer badges.
  const tagAutoInfo = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const n of nodes) {
      const b = (n.config as Record<string, unknown> | undefined)?.outputBindings;
      if (!Array.isArray(b)) continue;
      for (const binding of b as NodeBinding[]) {
        if (!binding?.tagId || !binding?.path) continue;
        (map[binding.tagId] ??= []).push(`${n.name}·${binding.path}`);
      }
    }
    return map;
  }, [nodes]);

  // ---- React Flow nodes ----
  // React Flow owns measured dimensions / internal state on each node object.
  // We keep an *independent* RFNode[] state (not a useMemo derived from `nodes`)
  // so that the `dimensions` changes React Flow emits via onNodesChange are
  // preserved across renders. Rebuilding the array from ApiNode[] every render
  // wipes those measurements and leaves freshly-added nodes stuck at
  // `visibility:hidden` forever (they never get marked as measured).
  const [rfNodes, setRfNodes] = useState<RFNode<FlowNodeData>[]>([]);
  const rfNodesRef = useRef<RFNode<FlowNodeData>[]>(rfNodes);
  rfNodesRef.current = rfNodes;

  // Keep the latest ApiNode list in a ref so node-data callbacks always resolve
  // against current state without re-subscribing.
  const nodesRef = useRef<ApiNode[]>(nodes);
  nodesRef.current = nodes;

  // Latest tags in a ref so bind handlers read current state without re-subscribing.
  const tagsRef = useRef<Tag[]>(tags);
  tagsRef.current = tags;

  // executeOne is defined above; keep it in a ref so buildData (deps: runningNodeId)
  // doesn't need to re-subscribe to it.
  const executeOneRef = useRef(executeOne);
  executeOneRef.current = executeOne;

  const buildData = useCallback(
    (n: ApiNode): FlowNodeData => ({
      name: n.name,
      type: n.type,
      description: n.description,
      executing: runningNodeId === n.id,
      onEdit: (nid: string) => setEditingNode(nodesRef.current.find((x) => x.id === nid) ?? null),
      onDelete: (nid: string) =>
        setDeleteTarget(nodesRef.current.find((x) => x.id === nid) ?? null),
      onExecute: (nid: string) => executeOneRef.current(nid),
    }),
    [runningNodeId],
  );

  // Reconcile RFNode[] with the source-of-truth ApiNode[] WITHOUT discarding the
  // per-node internals React Flow attached (width/height/handleBounds/etc).
  // - existing node  -> keep the RFNode object, refresh position + data only
  // - new node       -> append a fresh RFNode (React Flow will measure it)
  // - removed node   -> drop it
  useEffect(() => {
    setRfNodes((prev) => {
      const prevById = new Map(prev.map((r) => [r.id, r]));
      const reconciled = nodes.map((n) => {
        const existing = prevById.get(n.id);
        if (existing) {
          return {
            ...existing,
            position: { x: n.positionX, y: n.positionY },
            data: buildData(n),
          };
        }
        return {
          id: n.id,
          type: 'tmd',
          position: { x: n.positionX, y: n.positionY },
          data: buildData(n),
        };
      });
      rfNodesRef.current = reconciled;
      return reconciled;
    });
  }, [nodes, buildData]);

  const rfEdges: RFEdge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        label: e.label || undefined,
        animated: true,
        style: { strokeWidth: 2, stroke: '#94a3b8' },
      })),
    [edges],
  );

  const nodeTypes = useMemo(() => ({ tmd: FlowNode }), []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Apply ALL changes (including `dimensions`, which mark a node as measured
      // and flip it from visibility:hidden to visible) directly onto the RFNode
      // state React Flow controls.
      const applied = applyNodeChanges(changes, rfNodesRef.current);
      rfNodesRef.current = applied;
      setRfNodes(applied);

      // Mirror finished drags back into the ApiNode source-of-truth + persist.
      // The drag-stop change does not always carry a `position`, so read the
      // canonical position out of the applied RFNode array instead of `c.position`.
      const dragStopIds = changes
        .filter((c) => c.type === 'position' && c.dragging === false)
        .map((c) => (c as { id: string }).id);
      if (dragStopIds.length > 0) {
        const posById = new Map(applied.map((r) => [r.id, r.position]));
        setNodes((prevApi) => {
          const moved: ApiNode[] = [];
          const updated = prevApi.map((n) => {
            if (!dragStopIds.includes(n.id)) return n;
            const p = posById.get(n.id);
            if (!p) return n;
            const m = { ...n, positionX: p.x, positionY: p.y };
            moved.push(m);
            return m;
          });
          moved.forEach(persistPosition);
          return updated;
        });
      }
    },
    [persistPosition],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (conn.source && conn.target && conn.source !== conn.target) {
        void createEdge(conn.source, conn.target);
      }
    },
    [createEdge],
  );

  const onEdgesDelete = useCallback(
    (deleted: RFEdge[]) => {
      deleted.forEach((e) => void deleteEdge(e.id));
    },
    [deleteEdge],
  );

  if (loading) return <FullPageSpinner label="Loading project..." />;

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="shrink-0 text-sm font-medium text-[var(--color-primary)] hover:underline"
          >
            ← Dashboard
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-[var(--color-neutral-900)] sm:text-xl">
              {project?.name}
            </h1>
            {project?.description ? (
              <p className="truncate text-xs text-[var(--color-neutral-500)]">
                {project.description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={addNode} leftIcon={<span className="leading-none">+</span>}>
            Add Node
          </Button>
          <Button
            size="sm"
            variant="success"
            onClick={() => window.open(`/api/projects/${id}/export`, '_blank')}
          >
            📄 Export
          </Button>
          <Button size="sm" variant="primary" onClick={execute} loading={executing}>
            ▶️ Execute
          </Button>
        </div>
      </div>

      {/* Canvas / Mobile list */}
      <div className="relative flex-1 overflow-hidden">
        {isMobile ? (
          <MobileNodeList
            nodes={nodes}
            edges={edges}
            onEdit={(n) => setEditingNode(n)}
            onDelete={(n) => setDeleteTarget(n)}
            onConnect={createEdge}
            onDeleteEdge={deleteEdge}
            onExecute={(n) => executeOne(n.id)}
            runningNodeId={runningNodeId}
          />
        ) : (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            onEdgesDelete={onEdgesDelete}
            fitView
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => metaFor((n.data as FlowNodeData)?.type ?? '').color}
              className="!hidden sm:!block"
            />
          </ReactFlow>
        )}

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="mb-3 text-4xl">🧩</div>
            <p className="text-sm font-medium text-[var(--color-neutral-600)]">No nodes yet</p>
            <p className="text-xs text-[var(--color-neutral-400)]">
              Click “Add Node” to start building your workflow.
            </p>
          </div>
        )}

        <TagsPanel
          tags={tags}
          isMobile={isMobile}
          onChange={onTagsChange}
          autoInfo={tagAutoInfo}
        />
      </div>

      {/* Edit Node modal */}
      <Modal
        open={!!editingNode}
        onClose={() => setEditingNode(null)}
        title="Edit Node"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditingNode(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveNode} loading={saving}>
              Save
            </Button>
          </div>
        }
      >
        {editingNode && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
                Name
              </label>
              <input
                type="text"
                value={editingNode.name}
                onChange={(e) => setEditingNode({ ...editingNode, name: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-neutral-300)] px-4 py-2.5 text-base focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
                Description
              </label>
              <textarea
                value={editingNode.description || ''}
                onChange={(e) => setEditingNode({ ...editingNode, description: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-[var(--color-neutral-300)] px-4 py-2.5 text-base focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
                Type
              </label>
              <select
                value={editingNode.type}
                onChange={(e) => setEditingNode({ ...editingNode, type: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-neutral-300)] px-4 py-2.5 text-base focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
              >
                {NODE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {metaFor(t).icon} {metaFor(t).label}
                  </option>
                ))}
              </select>
            </div>

            {editingNode.type === 'http-request' && (
              <HttpNodeFields node={editingNode} tags={tags} onChange={setEditingNode} />
            )}
          </div>
        )}
      </Modal>

      {/* Execute result panel — n8n-style. On mobile the Modal renders as a
          full-width bottom sheet (overlay), per the mobile-first rule. */}
      <Modal
        open={execPanel !== null}
        onClose={() => setExecPanel(null)}
        title={execPanel ? `Result · ${execPanel.title}` : 'Result'}
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setExecPanel(null)}>
              Close
            </Button>
          </div>
        }
      >
        <ExecutionResultPanel
          results={execPanel?.results ?? []}
          tags={tags}
          bindingsByNode={bindingsByNode}
          missingBindings={execPanel?.missingBindings ?? []}
          onBind={onBind}
          onResolveMissing={onResolveMissing}
        />
      </Modal>

      {/* Delete node confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Node"
        danger
        confirmText="Delete"
        message={
          <>
            Delete <strong>{deleteTarget?.name}</strong> and its connections?
          </>
        }
        onConfirm={doDeleteNode}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ---------- HTTP node config fields (Edit Node modal) ----------
function HttpNodeFields({
  node,
  tags,
  onChange,
}: {
  node: ApiNode;
  tags: Tag[];
  onChange: (n: ApiNode) => void;
}) {
  const cfg = (node.config ?? {}) as Record<string, any>;
  const method = String(cfg.method ?? 'GET').toUpperCase();
  const url = String(cfg.url ?? '');
  const urlMode: 'manual' | 'tag' =
    cfg.urlMode === 'tag' || (cfg.urlMode == null && cfg.urlTagId) ? 'tag' : 'manual';
  const urlTagId = String(cfg.urlTagId ?? '');
  const applyTagQuery = !!cfg.applyTagQuery;
  const applyTagBody = !!cfg.applyTagBody;
  const tagQuery: string[] = Array.isArray(cfg.tagQuery) ? cfg.tagQuery : [];
  const tagBody: string[] = Array.isArray(cfg.tagBody) ? cfg.tagBody : [];
  const isGet = method === 'GET';

  // headers / body are edited as raw JSON text; keep them stringified for the box.
  const headersText =
    cfg.headers != null ? JSON.stringify(cfg.headers, null, 2) : '';
  const bodyText = cfg.body != null ? JSON.stringify(cfg.body, null, 2) : '';

  const setCfg = (patch: Record<string, any>) =>
    onChange({ ...node, config: { ...cfg, ...patch } });

  const parseMaybeJson = (text: string): any => {
    const t = text.trim();
    if (!t) return undefined;
    try {
      return JSON.parse(t);
    } catch {
      return text; // keep raw; preview will reflect it
    }
  };

  const toggleTagIn = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const byId = new Map(tags.map((t) => [t.id, t]));

  // ----- live preview -----
  // Base url: manual text, or the resolved value of the selected url tag (masked).
  const urlTag = urlMode === 'tag' ? byId.get(urlTagId) : undefined;
  const baseForPreview =
    urlMode === 'tag'
      ? urlTag
        ? urlTag.value || '(empty tag value)'
        : '(no tag selected)'
      : url || '(no url)';
  const previewUrl = (() => {
    if (baseForPreview.startsWith('(')) return baseForPreview;
    const selected = applyTagQuery ? tagQuery.map((id) => byId.get(id)).filter(Boolean) : [];
    if (selected.length === 0) return baseForPreview;
    const pairs = selected.map((t) => `${t!.key}=${'•'.repeat(Math.max(3, t!.value.length || 3))}`);
    return baseForPreview + (baseForPreview.includes('?') ? '&' : '?') + pairs.join('&');
  })();

  const previewBody = (() => {
    if (isGet) return null;
    const base =
      cfg.body && typeof cfg.body === 'object' && !Array.isArray(cfg.body) ? { ...cfg.body } : {};
    if (applyTagBody) {
      for (const id of tagBody) {
        const t = byId.get(id);
        if (t && !(t.key in base)) base[t.key] = '••••';
      }
    }
    return Object.keys(base).length ? JSON.stringify(base, null, 2) : '(empty body)';
  })();

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-neutral-500)]">
        HTTP Request
      </p>

      <div className="grid grid-cols-[110px_1fr] gap-2">
        <select
          value={method}
          data-testid="http-method"
          onChange={(e) => setCfg({ method: e.target.value })}
          className="rounded-lg border border-[var(--color-neutral-300)] px-2 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
        >
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <div className="flex flex-col gap-1.5">
          {/* URL source toggle: manual text or resolve from a tag at run time. */}
          <div className="flex gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                data-testid="url-mode-manual"
                checked={urlMode === 'manual'}
                onChange={() => setCfg({ urlMode: 'manual' })}
              />
              Type URL
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                data-testid="url-mode-tag"
                checked={urlMode === 'tag'}
                onChange={() =>
                  setCfg({ urlMode: 'tag', urlTagId: urlTagId || tags[0]?.id || '' })
                }
              />
              From tag
            </label>
          </div>
          {urlMode === 'tag' ? (
            <select
              value={urlTagId}
              data-testid="url-tag-select"
              onChange={(e) => setCfg({ urlTagId: e.target.value })}
              className="rounded-lg border border-[var(--color-neutral-300)] px-3 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            >
              {tags.length === 0 ? <option value="">(no tags)</option> : null}
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.key}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder="https://api.example.com/endpoint"
              value={url}
              data-testid="http-url"
              onChange={(e) => setCfg({ url: e.target.value })}
              className="rounded-lg border border-[var(--color-neutral-300)] px-3 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          )}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-neutral-600)]">
          Headers (JSON)
        </label>
        <textarea
          rows={2}
          placeholder='{ "Authorization": "Bearer ..." }'
          defaultValue={headersText}
          data-testid="http-headers"
          onBlur={(e) => setCfg({ headers: parseMaybeJson(e.target.value) })}
          className="w-full rounded-lg border border-[var(--color-neutral-300)] px-3 py-2 font-mono text-xs focus:border-[var(--color-primary)] focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-neutral-600)]">
          Body (JSON){isGet ? ' — ignored for GET' : ''}
        </label>
        <textarea
          rows={3}
          placeholder='{ "hello": "world" }'
          defaultValue={bodyText}
          data-testid="http-body"
          disabled={isGet}
          onBlur={(e) => setCfg({ body: parseMaybeJson(e.target.value) })}
          className="w-full rounded-lg border border-[var(--color-neutral-300)] px-3 py-2 font-mono text-xs focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
        />
      </div>

      {/* Apply Tags — query */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-neutral-700)]">
          <input
            type="checkbox"
            checked={applyTagQuery}
            data-testid="apply-tag-query"
            onChange={(e) => setCfg({ applyTagQuery: e.target.checked })}
          />
          Apply Tags to query string
        </label>
        {applyTagQuery && (
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.length === 0 && (
              <span className="text-xs text-[var(--color-neutral-400)]">No tags defined yet.</span>
            )}
            {tags.map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-1 rounded-full border border-[var(--color-neutral-300)] bg-white px-2 py-1 text-xs"
              >
                <input
                  type="checkbox"
                  checked={tagQuery.includes(t.id)}
                  onChange={() => setCfg({ tagQuery: toggleTagIn(tagQuery, t.id) })}
                />
                {t.key}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Apply Tags — body */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-neutral-700)]">
          <input
            type="checkbox"
            checked={applyTagBody}
            data-testid="apply-tag-body"
            disabled={isGet}
            onChange={(e) => setCfg({ applyTagBody: e.target.checked })}
          />
          Apply Tags to body{isGet ? ' (disabled for GET)' : ''}
        </label>
        {applyTagBody && !isGet && (
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.length === 0 && (
              <span className="text-xs text-[var(--color-neutral-400)]">No tags defined yet.</span>
            )}
            {tags.map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-1 rounded-full border border-[var(--color-neutral-300)] bg-white px-2 py-1 text-xs"
              >
                <input
                  type="checkbox"
                  checked={tagBody.includes(t.id)}
                  onChange={() => setCfg({ tagBody: toggleTagIn(tagBody, t.id) })}
                />
                {t.key}
              </label>
            ))}
          </div>
        )}
      </div>

      {applyTagBody && isGet && (
        <p className="text-xs text-[var(--color-warning)]">
          ⚠️ GET requests have no body — tag body injection will be ignored on execute.
        </p>
      )}

      {/* Live preview */}
      <div data-testid="http-preview" className="rounded-lg bg-[var(--color-neutral-900)] p-3">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-neutral-400)]">
          Preview
        </p>
        <code className="block break-all font-mono text-xs text-[var(--color-neutral-100)]">
          {method} {previewUrl}
        </code>
        {previewBody !== null && (
          <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-xs text-[var(--color-neutral-300)]">
            {previewBody}
          </pre>
        )}
      </div>
    </div>
  );
}

// ---------- Mobile list editor ----------
function MobileNodeList({
  nodes,
  edges,
  onEdit,
  onDelete,
  onConnect,
  onDeleteEdge,
  onExecute,
  runningNodeId,
}: {
  nodes: ApiNode[];
  edges: ApiEdge[];
  onEdit: (n: ApiNode) => void;
  onDelete: (n: ApiNode) => void;
  onConnect: (source: string, target: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onExecute: (n: ApiNode) => void;
  runningNodeId: string | null;
}) {
  const [linkFrom, setLinkFrom] = useState<ApiNode | null>(null);
  const nameById = useMemo(() => new Map(nodes.map((n) => [n.id, n.name])), [nodes]);

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-neutral-50)] p-4">
      <div className="mb-3 rounded-lg bg-[var(--color-info)]/10 px-3 py-2 text-xs text-[var(--color-info)]">
        Canvas drag isn’t available on small screens — use this list editor instead.
      </div>

      <div className="flex flex-col gap-3">
        {nodes.map((n) => {
          const meta = metaFor(n.type);
          const outgoing = edges.filter((e) => e.sourceNodeId === n.id);
          return (
            <div
              key={n.id}
              className="rounded-xl border-2 bg-white p-3 shadow-sm"
              style={{ borderColor: `${meta.color}40` }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-[var(--color-neutral-900)]">
                    {n.name}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--color-neutral-400)]">
                    {meta.label}
                  </div>
                </div>
              </div>

              {n.description ? (
                <p className="mt-1 text-xs text-[var(--color-neutral-500)]">{n.description}</p>
              ) : null}

              {outgoing.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {outgoing.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between rounded bg-[var(--color-neutral-100)] px-2 py-1 text-xs"
                    >
                      <span className="text-[var(--color-neutral-600)]">
                        → {nameById.get(e.targetNodeId) ?? '?'}
                      </span>
                      <button
                        onClick={() => onDeleteEdge(e.id)}
                        className="text-[var(--color-danger)] hover:underline"
                      >
                        unlink
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onExecute(n)}
                  loading={runningNodeId === n.id}
                  className="flex-1"
                >
                  ▶ Run
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onEdit(n)} className="flex-1">
                  Edit
                </Button>
                {linkFrom?.id === n.id ? (
                  <Button size="sm" variant="ghost" onClick={() => setLinkFrom(null)} className="flex-1">
                    Cancel
                  </Button>
                ) : linkFrom ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      onConnect(linkFrom.id, n.id);
                      setLinkFrom(null);
                    }}
                    className="flex-1"
                  >
                    Connect here
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setLinkFrom(n)} className="flex-1">
                    Link
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={() => onDelete(n)}>
                  Del
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
