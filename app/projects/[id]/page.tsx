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
  ConnectionMode,
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
import { DeletableEdge } from '@/components/canvas/DeletableEdge';
import { NODE_TYPES, metaFor, nodeDisplayMeta } from '@/components/canvas/nodeMeta';
import {
  FRONTEND_FRAMEWORKS,
  BACKEND_FRAMEWORKS,
  BACKEND_LANGUAGES,
  suggestTransports,
} from '@/components/canvas/stackCatalog';
import { TagsPanel, type Tag } from '@/components/canvas/TagsPanel';
import {
  ExecutionResultPanel,
  type ExecResult,
  type MissingBinding,
  type NodeBinding,
  type BindRequest,
} from '@/components/canvas/ExecutionResultPanel';
import {
  interpolateTags,
  interpolateDeep,
  hasTagPlaceholder,
  detectTagType,
} from '@/lib/path-utils';

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
  sourceHandle?: string | null;
  targetHandle?: string | null;
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
  // Desktop output column collapse (default expanded).
  const [outputCollapsed, setOutputCollapsed] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auto-expand the desktop output column whenever a new result arrives, so a
  // collapsed panel doesn't silently swallow the result the user just ran.
  useEffect(() => {
    if (execPanel !== null) setOutputCollapsed(false);
  }, [execPanel]);

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
    async (
      sourceNodeId: string,
      targetNodeId: string,
      sourceHandle: string | null = null,
      targetHandle: string | null = null,
    ) => {
      try {
        const res = await fetch(`/api/projects/${id}/edges`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceNodeId,
            targetNodeId,
            label: '',
            sourceHandle,
            targetHandle,
          }),
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
        nextTags = [...nextTags, { id: tagId, key, value: req.value, type: detectTagType(req.value) }];
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
      config: n.config as Record<string, any> | undefined,
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
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
        label: e.label || undefined,
        type: 'deletable',
        animated: true,
        style: { strokeWidth: 2, stroke: '#94a3b8' },
        data: { onDelete: deleteEdge },
      })),
    [edges, deleteEdge],
  );

  const nodeTypes = useMemo(() => ({ tmd: FlowNode }), []);
  const edgeTypes = useMemo(() => ({ deletable: DeletableEdge }), []);

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
        void createEdge(
          conn.source,
          conn.target,
          conn.sourceHandle ?? null,
          conn.targetHandle ?? null,
        );
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

      {/* 3-panel layout: [Tags left · pinned] [Canvas center · flex-1] [Output right · pinned].
          On mobile both side panels collapse to overlays (User Rule #4). */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop: pinned left tags column. */}
        {!isMobile && (
          <TagsPanel
            tags={tags}
            isMobile={false}
            onChange={onTagsChange}
            autoInfo={tagAutoInfo}
          />
        )}

        {/* Canvas / Mobile list */}
        <div className="relative flex-1 overflow-hidden bg-white">
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
              edgeTypes={edgeTypes}
              connectionMode={ConnectionMode.Loose}
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
                maskColor="rgba(148, 163, 184, 0.25)"
                style={{ backgroundColor: 'var(--color-neutral-100)' }}
                className="!hidden sm:!block !border !border-[color:var(--color-neutral-300)] !rounded-[var(--radius-card)] !shadow-[var(--shadow-card)]"
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

          {/* Mobile: tags as a collapsible overlay inside the canvas region. */}
          {isMobile && (
            <TagsPanel
              tags={tags}
              isMobile
              onChange={onTagsChange}
              autoInfo={tagAutoInfo}
            />
          )}
        </div>

        {/* Desktop: pinned right output column (collapsible). */}
        {!isMobile && (
          <OutputColumn
            collapsed={outputCollapsed}
            onToggleCollapse={() => setOutputCollapsed((c) => !c)}
            execPanel={execPanel}
            onClear={() => setExecPanel(null)}
            tags={tags}
            bindingsByNode={bindingsByNode}
            onBind={onBind}
            onResolveMissing={onResolveMissing}
          />
        )}
      </div>

      {/* Edit Node modal — dismissable={false}: long config form, so it only
          closes via the X button or the Cancel action (not backdrop / Esc). */}
      <Modal
        open={!!editingNode}
        onClose={() => setEditingNode(null)}
        title="Edit Node"
        dismissable={false}
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

            {(editingNode.type === 'function' || editingNode.type === 'http-request') && (
              <CallRoutePicker
                node={editingNode}
                nodes={nodes}
                edges={edges}
                onChange={setEditingNode}
              />
            )}

            {editingNode.type === 'http-request' && (
              <HttpNodeFields node={editingNode} tags={tags} onChange={setEditingNode} />
            )}

            {editingNode.type === 'server' && (
              <ServerNodeFields node={editingNode} tags={tags} onChange={setEditingNode} />
            )}
          </div>
        )}
      </Modal>

      {/* Execute result — desktop shows it in the pinned right OutputColumn.
          On mobile only, it renders as a full-width bottom-sheet Modal. */}
      {isMobile && (
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
      )}

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

// ---------- Output column (desktop, pinned right) ----------
// Always-visible right panel that hosts execution results. Replaces the old
// result modal on desktop. Collapsible to a thin rail; default expanded. Shows
// an empty state until the first run.
function OutputColumn({
  collapsed,
  onToggleCollapse,
  execPanel,
  onClear,
  tags,
  bindingsByNode,
  onBind,
  onResolveMissing,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  execPanel: { title: string; results: ExecResult[]; missingBindings: MissingBinding[] } | null;
  onClear: () => void;
  tags: Tag[];
  bindingsByNode: Record<string, NodeBinding[]>;
  onBind: (req: BindRequest) => void;
  onResolveMissing: (m: MissingBinding, action: 'drop' | 'keep') => void;
}) {
  // Collapsed: thin rail with a re-open button on the right edge.
  if (collapsed) {
    return (
      <div className="flex h-full w-10 shrink-0 flex-col items-center border-l-2 border-[var(--color-neutral-300)] bg-[var(--color-neutral-100)] py-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand output panel"
          data-testid="output-expand"
          className="rounded-lg p-1.5 text-lg hover:bg-[var(--color-neutral-100)]"
          title="Output"
        >
          📤
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="output-panel"
      className="flex h-full w-96 shrink-0 flex-col border-l-2 border-[var(--color-neutral-300)] bg-[var(--color-neutral-100)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--color-neutral-200)] px-4 py-3">
        <h2 className="truncate text-sm font-bold text-[var(--color-neutral-900)]">
          📤 Output{execPanel ? ` · ${execPanel.title}` : ''}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {execPanel ? (
            <button
              type="button"
              onClick={onClear}
              data-testid="output-clear"
              aria-label="Clear output"
              className="rounded-lg px-2 py-1 text-xs text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-100)]"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse output panel"
            data-testid="output-collapse"
            className="rounded-lg p-1 text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-100)]"
            title="Collapse"
          >
            ⟩
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {execPanel === null ? (
          <div
            data-testid="output-empty"
            className="flex h-full flex-col items-center justify-center text-center"
          >
            <div className="mb-2 text-3xl">▶️</div>
            <p className="text-sm font-medium text-[var(--color-neutral-600)]">No results yet</p>
            <p className="mt-1 text-xs text-[var(--color-neutral-400)]">
              Press Execute on a node or run the workflow to see results here.
            </p>
          </div>
        ) : (
          <ExecutionResultPanel
            results={execPanel.results}
            tags={tags}
            bindingsByNode={bindingsByNode}
            missingBindings={execPanel.missingBindings}
            onBind={onBind}
            onResolveMissing={onResolveMissing}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Server node config fields (Edit Node modal) ----------
// A server node = a running frontend/backend process. The user picks a stack
// (category -> language -> framework) and a host/port for the health-check.
const CUSTOM_FRAMEWORK = '__custom__';

function ServerNodeFields({
  node,
  tags,
  onChange,
}: {
  node: ApiNode;
  tags: Tag[];
  onChange: (n: ApiNode) => void;
}) {
  const cfg = (node.config ?? {}) as Record<string, any>;
  const category: 'frontend' | 'backend' =
    cfg.category === 'frontend' ? 'frontend' : 'backend';
  const language = String(cfg.language ?? '');
  const framework = String(cfg.framework ?? '');
  const host = String(cfg.host ?? '');
  const port = cfg.port != null ? String(cfg.port) : '';
  const healthPath = String(cfg.healthPath ?? '');

  const setCfg = (patch: Record<string, any>) =>
    onChange({ ...node, config: { ...cfg, ...patch } });

  // Framework options for the current category/language.
  const frameworkOptions =
    category === 'frontend'
      ? (FRONTEND_FRAMEWORKS as readonly string[])
      : language && BACKEND_FRAMEWORKS[language]
        ? BACKEND_FRAMEWORKS[language]
        : [];

  // Is the stored framework a custom (off-catalog) value?
  const isCustomFramework =
    framework !== '' && !frameworkOptions.includes(framework);
  // Explicit "custom mode" flag: needed because an empty custom framework looks
  // identical to "no framework picked", so a stored '' can't tell us which.
  // Seed it from an off-catalog stored value.
  const [customMode, setCustomMode] = useState(isCustomFramework);
  // The select shows CUSTOM when in custom mode (or the value is off-catalog).
  const frameworkSelectValue =
    customMode || isCustomFramework ? CUSTOM_FRAMEWORK : framework;

  const switchCategory = (next: 'frontend' | 'backend') => {
    if (next === category) return;
    setCustomMode(false);
    // Reset language + framework when toggling category (they don't carry over).
    if (next === 'frontend') {
      setCfg({ category: 'frontend', language: undefined, framework: '' });
    } else {
      setCfg({ category: 'backend', framework: '' });
    }
  };

  const switchLanguage = (lang: string) => {
    // Changing language always resets the framework (cascade) + leaves custom mode.
    setCustomMode(false);
    setCfg({ language: lang, framework: '' });
  };

  const onFrameworkSelect = (value: string) => {
    if (value === CUSTOM_FRAMEWORK) {
      // Enter custom mode with an empty string the user then types into.
      setCustomMode(true);
      setCfg({ framework: '' });
    } else {
      setCustomMode(false);
      setCfg({ framework: value });
    }
  };

  // Live preview of the health-check URL.
  const previewHost = host.trim() || 'localhost';
  const previewPort = port.trim();
  const previewScheme = previewPort === '443' ? 'https' : 'http';
  let previewPath = healthPath.trim() || '/';
  if (!previewPath.startsWith('/')) previewPath = '/' + previewPath;
  const previewUrl = `${previewScheme}://${previewHost}${
    previewPort ? ':' + previewPort : ''
  }${previewPath}`;

  // Whether to show the custom framework text input: user is in custom mode.
  const showCustomInput = frameworkSelectValue === CUSTOM_FRAMEWORK;

  return (
    <div
      data-testid="server-fields"
      className="flex flex-col gap-4 rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-4"
    >
      {/* Category toggle */}
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
          Category
        </label>
        <div className="flex gap-2">
          {(['frontend', 'backend'] as const).map((c) => (
            <button
              key={c}
              type="button"
              data-testid={`server-category-${c}`}
              onClick={() => switchCategory(c)}
              className={[
                'flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors',
                category === c
                  ? 'border-transparent text-white'
                  : 'border-[var(--color-neutral-300)] bg-white text-[var(--color-neutral-700)]',
              ].join(' ')}
              style={
                category === c
                  ? { background: c === 'frontend' ? '#06b6d4' : '#0d9488' }
                  : undefined
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Language (backend only) */}
      {category === 'backend' && (
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
            Language
          </label>
          <select
            data-testid="server-language"
            value={language}
            onChange={(e) => switchLanguage(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-neutral-300)] bg-white px-4 py-2.5 text-base focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          >
            <option value="">Select language…</option>
            {BACKEND_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Framework */}
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
          Framework
        </label>
        <select
          data-testid="server-framework"
          value={frameworkSelectValue}
          disabled={category === 'backend' && !language}
          onChange={(e) => onFrameworkSelect(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-neutral-300)] bg-white px-4 py-2.5 text-base focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 disabled:opacity-50"
        >
          <option value="">
            {category === 'backend' && !language
              ? 'Pick a language first…'
              : 'Select framework…'}
          </option>
          {frameworkOptions.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
          <option value={CUSTOM_FRAMEWORK}>+ Custom…</option>
        </select>
        {showCustomInput && (
          <input
            type="text"
            data-testid="server-framework-custom"
            value={framework}
            onChange={(e) => setCfg({ framework: e.target.value })}
            placeholder="Custom framework name"
            className="mt-2 w-full rounded-lg border border-[var(--color-neutral-300)] px-4 py-2.5 text-base focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          />
        )}
      </div>

      {/* Host + Port + Health path */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
            Host
          </label>
          <input
            type="text"
            data-testid="server-host"
            value={host}
            onChange={(e) => setCfg({ host: e.target.value })}
            placeholder="localhost"
            className="w-full rounded-lg border border-[var(--color-neutral-300)] px-3 py-2.5 text-base focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
            Port
          </label>
          <input
            type="number"
            data-testid="server-port"
            value={port}
            onChange={(e) =>
              setCfg({ port: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            placeholder="3000"
            className="w-full rounded-lg border border-[var(--color-neutral-300)] px-3 py-2.5 text-base focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
          Health path <span className="text-[var(--color-neutral-400)]">(optional)</span>
        </label>
        <input
          type="text"
          data-testid="server-health-path"
          value={healthPath}
          onChange={(e) => setCfg({ healthPath: e.target.value })}
          placeholder="/health"
          className="w-full rounded-lg border border-[var(--color-neutral-300)] px-3 py-2.5 text-base focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
        />
      </div>

      {/* Health-check URL preview */}
      <div className="rounded-lg bg-[var(--color-neutral-900)] px-3 py-2">
        <span className="text-[10px] uppercase tracking-wide text-[var(--color-neutral-400)]">
          Health-check
        </span>
        <div
          data-testid="server-url-preview"
          className="break-all font-mono text-xs text-[var(--color-neutral-100)]"
        >
          {previewUrl}
        </div>
      </div>

      {/* Mock API routes — define routes this server "serves" so a connected
          function/http node can fire one and get a mock response (no network). */}
      <RoutesEditor node={node} tags={tags} onChange={onChange} />

      {/* Mock realtime events — channel/event + payload a connected node can
          "subscribe" to and get back in-process (Vercel can't run a socket). */}
      <RealtimeEditor node={node} tags={tags} onChange={onChange} />
    </div>
  );
}

// ---------- Mock route editor (server node) ----------
// A server node in mock mode defines API routes (method + path + status +
// JSON response). A function/http node wired to this server can call a route
// and get the response resolved entirely in-process. {{tag}} placeholders in
// the response are interpolated at execute time.
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

interface MockRouteDraft {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  response: unknown;
}

function genRouteId(): string {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRoutes(raw: unknown): MockRouteDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => r != null && typeof r === 'object')
    .map((r) => ({
      id: typeof r.id === 'string' && r.id ? r.id : genRouteId(),
      method: String(r.method ?? 'GET').toUpperCase(),
      path: typeof r.path === 'string' ? r.path : '/',
      statusCode:
        typeof r.statusCode === 'number' && r.statusCode > 0 ? r.statusCode : 200,
      response: r.response,
    }));
}

function RoutesEditor({
  node,
  tags,
  onChange,
}: {
  node: ApiNode;
  tags: Tag[];
  onChange: (n: ApiNode) => void;
}) {
  const cfg = (node.config ?? {}) as Record<string, any>;
  const routes = normalizeRoutes(cfg.routes);
  const serveMode = cfg.serveMode === 'proxy' ? 'proxy' : 'mock';

  // Which route row is expanded for editing (id) or 'new' for the add form.
  const [editingId, setEditingId] = useState<string | null>(null);

  const writeRoutes = (next: MockRouteDraft[]) =>
    onChange({ ...node, config: { ...cfg, serveMode, routes: next } });

  const addRoute = () => {
    const r: MockRouteDraft = {
      id: genRouteId(),
      method: 'GET',
      path: '/',
      statusCode: 200,
      response: {},
    };
    writeRoutes([...routes, r]);
    setEditingId(r.id);
  };

  const updateRoute = (id: string, patch: Partial<MockRouteDraft>) =>
    writeRoutes(routes.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const deleteRoute = (id: string) => {
    writeRoutes(routes.filter((r) => r.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const methodColor = (m: string) =>
    ({
      GET: '#0d9488',
      POST: '#2563eb',
      PUT: '#d97706',
      PATCH: '#7c3aed',
      DELETE: '#dc2626',
    })[m] ?? '#64748b';

  return (
    <div
      data-testid="routes-editor"
      className="flex flex-col gap-2 rounded-xl border border-[var(--color-neutral-200)] bg-white p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-neutral-500)]">
          API Routes
        </span>
        <span className="rounded-full bg-[var(--color-neutral-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-neutral-600)]">
          {serveMode} · {routes.length} route{routes.length === 1 ? '' : 's'}
        </span>
      </div>

      {routes.length === 0 ? (
        <p className="text-[11px] text-[var(--color-neutral-400)]">
          No routes yet. Add a route so a connected node can call it and get a mock response.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {routes.map((r) => (
            <div key={r.id} data-testid="route-row" className="rounded-lg border border-[var(--color-neutral-200)]">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                  style={{ background: methodColor(r.method) }}
                >
                  {r.method}
                </span>
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--color-neutral-800)]">
                  {r.path || '/'}
                </code>
                <span className="font-mono text-[10px] text-[var(--color-neutral-400)]">
                  {r.statusCode}
                </span>
                <button
                  type="button"
                  data-testid="route-edit"
                  onClick={() => setEditingId(editingId === r.id ? null : r.id)}
                  className="rounded px-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
                >
                  {editingId === r.id ? 'close' : 'edit'}
                </button>
                <button
                  type="button"
                  data-testid="route-delete"
                  onClick={() => deleteRoute(r.id)}
                  className="rounded px-1 text-xs font-medium text-[var(--color-danger)] hover:underline"
                  aria-label="Delete route"
                >
                  ✕
                </button>
              </div>
              {editingId === r.id && (
                <RouteForm route={r} tags={tags} onPatch={(p) => updateRoute(r.id, p)} />
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        data-testid="route-add"
        onClick={addRoute}
        className="self-start rounded-lg border border-dashed border-[var(--color-neutral-300)] px-2 py-1 text-[11px] text-[var(--color-neutral-600)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
      >
        + add route
      </button>
    </div>
  );
}

function RouteForm({
  route,
  tags,
  onPatch,
}: {
  route: MockRouteDraft;
  tags: Tag[];
  onPatch: (patch: Partial<MockRouteDraft>) => void;
}) {
  // Response JSON edited as text (uncontrolled) — committed on blur. Tag picker
  // splices {{key}} at the caret, same pattern as the http body editor.
  const responseText =
    route.response != null ? JSON.stringify(route.response, null, 2) : '';
  const respRef = useRef<HTMLTextAreaElement | null>(null);

  const parseMaybeJson = (text: string): unknown => {
    const t = text.trim();
    if (!t) return undefined;
    try {
      return JSON.parse(t);
    } catch {
      return text;
    }
  };

  const insertToken = (key: string) => {
    const el = respRef.current;
    const token = `{{${key}}}`;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    el.value = next;
    const caret = start + token.length;
    el.focus();
    el.setSelectionRange(caret, caret);
    onPatch({ response: parseMaybeJson(next) });
  };

  return (
    <div
      data-testid="route-form"
      className="flex flex-col gap-2 border-t border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] px-2 py-2"
    >
      <div className="grid grid-cols-[100px_1fr_80px] gap-2">
        <select
          value={route.method}
          data-testid="route-method"
          onChange={(e) => onPatch({ method: e.target.value })}
          className="rounded-lg border border-[var(--color-neutral-300)] px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={route.path}
          data-testid="route-path"
          placeholder="/users"
          onChange={(e) => onPatch({ path: e.target.value })}
          className="min-w-0 rounded-lg border border-[var(--color-neutral-300)] px-2 py-1.5 font-mono text-xs focus:border-[var(--color-primary)] focus:outline-none"
        />
        <input
          type="number"
          value={route.statusCode}
          data-testid="route-status"
          onChange={(e) =>
            onPatch({ statusCode: Number(e.target.value) || 200 })
          }
          className="rounded-lg border border-[var(--color-neutral-300)] px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
        />
      </div>

      <label className="block text-[10px] font-medium uppercase tracking-wide text-[var(--color-neutral-500)]">
        Response (JSON)
      </label>
      <textarea
        ref={respRef}
        rows={4}
        defaultValue={responseText}
        data-testid="route-response"
        placeholder='{ "access_token": "mock-123" }'
        onBlur={(e) => onPatch({ response: parseMaybeJson(e.target.value) })}
        className="w-full rounded-lg border border-[var(--color-neutral-300)] px-2 py-1.5 font-mono text-xs focus:border-[var(--color-primary)] focus:outline-none"
      />
      <div className="flex flex-wrap gap-1.5" data-testid="route-response-tag-picker">
        {tags.length === 0 ? (
          <span className="text-[10px] text-[var(--color-neutral-400)]">No tags defined yet.</span>
        ) : (
          tags.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => insertToken(t.key)}
              data-testid={`route-insert-tag-${t.key}`}
              className="rounded-full border border-[var(--color-neutral-300)] bg-white px-2 py-0.5 font-mono text-[10px] text-[var(--color-neutral-700)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              title={`Insert {{${t.key}}}`}
            >
              {'{{'}{t.key}{'}}'}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---------- Realtime mock editor (server node) ----------
// A server node can define mock realtime events (channel + event name + JSON
// payload). A connected function/http node "subscribes" to one and gets the
// payload back in-process — Vercel can't run a real socket, so this is a mock.
interface RealtimeEventDraft {
  id: string;
  channel: string;
  event: string;
  payload: unknown;
}

function genEventId(): string {
  return `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEvents(raw: unknown): RealtimeEventDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => e != null && typeof e === 'object')
    .map((e) => ({
      id: typeof e.id === 'string' && e.id ? e.id : genEventId(),
      channel: typeof e.channel === 'string' ? e.channel : '',
      event: typeof e.event === 'string' ? e.event : '',
      payload: e.payload,
    }));
}

const REALTIME_CUSTOM = '__custom__';

function RealtimeEditor({
  node,
  tags,
  onChange,
}: {
  node: ApiNode;
  tags: Tag[];
  onChange: (n: ApiNode) => void;
}) {
  const cfg = (node.config ?? {}) as Record<string, any>;
  const rt = (cfg.realtime ?? {}) as Record<string, any>;
  const events = normalizeEvents(rt.events);
  const transport = String(rt.transport ?? '');
  const suggestions = suggestTransports({
    category: cfg.category,
    language: cfg.language,
  });
  const isCustomTransport = transport !== '' && !suggestions.includes(transport);
  const [customMode, setCustomMode] = useState(isCustomTransport);

  const [editingId, setEditingId] = useState<string | null>(null);

  const writeRealtime = (patch: Record<string, any>) =>
    onChange({
      ...node,
      config: { ...cfg, realtime: { ...rt, ...patch } },
    });

  const writeEvents = (next: RealtimeEventDraft[]) => writeRealtime({ events: next });

  const setTransport = (value: string) => {
    if (value === REALTIME_CUSTOM) {
      setCustomMode(true);
      writeRealtime({ transport: '' });
    } else {
      setCustomMode(false);
      writeRealtime({ transport: value });
    }
  };

  const addEvent = () => {
    const e: RealtimeEventDraft = {
      id: genEventId(),
      channel: '',
      event: 'message',
      payload: {},
    };
    writeEvents([...events, e]);
    setEditingId(e.id);
  };

  const updateEvent = (id: string, patch: Partial<RealtimeEventDraft>) =>
    writeEvents(events.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const deleteEvent = (id: string) => {
    writeEvents(events.filter((e) => e.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const transportSelectValue =
    customMode || isCustomTransport ? REALTIME_CUSTOM : transport;

  return (
    <div
      data-testid="realtime-editor"
      className="flex flex-col gap-2 rounded-xl border border-[var(--color-neutral-200)] bg-white p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-neutral-500)]">
          Realtime
        </span>
        <span className="rounded-full bg-[var(--color-neutral-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-neutral-600)]">
          {events.length} event{events.length === 1 ? '' : 's'}
        </span>
      </div>

      <p
        data-testid="realtime-mock-note"
        className="rounded-md bg-[var(--color-info)]/10 px-2 py-1 text-[10px] text-[var(--color-info)]"
      >
        ⚡ Mock — Vercel can’t run a real socket. Execute returns this payload
        in-process (resolving {`{{tags}}`}).
      </p>

      {/* Transport (suggested by stack; custom allowed) */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-[var(--color-neutral-600)]">
          Transport
        </label>
        <select
          data-testid="realtime-transport"
          value={transportSelectValue}
          onChange={(e) => setTransport(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-neutral-300)] bg-white px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
        >
          <option value="">Select transport…</option>
          {suggestions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value={REALTIME_CUSTOM}>+ Custom…</option>
        </select>
        {transportSelectValue === REALTIME_CUSTOM && (
          <input
            type="text"
            data-testid="realtime-transport-custom"
            value={transport}
            onChange={(e) => writeRealtime({ transport: e.target.value })}
            placeholder="Custom transport name"
            className="mt-1.5 w-full rounded-lg border border-[var(--color-neutral-300)] px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
          />
        )}
      </div>

      {/* Events list */}
      {events.length === 0 ? (
        <p className="text-[11px] text-[var(--color-neutral-400)]">
          No events yet. Add one so a connected node can subscribe and get its mock payload.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {events.map((e) => (
            <div
              key={e.id}
              data-testid="event-row"
              className="rounded-lg border border-[var(--color-neutral-200)]"
            >
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="rounded bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-primary)]">
                  📡
                </span>
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--color-neutral-800)]">
                  {e.event || '(no event)'}
                  {e.channel ? (
                    <span className="text-[var(--color-neutral-400)]"> @ {e.channel}</span>
                  ) : null}
                </code>
                <button
                  type="button"
                  data-testid="event-edit"
                  onClick={() => setEditingId(editingId === e.id ? null : e.id)}
                  className="rounded px-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
                >
                  {editingId === e.id ? 'close' : 'edit'}
                </button>
                <button
                  type="button"
                  data-testid="event-delete"
                  onClick={() => deleteEvent(e.id)}
                  className="rounded px-1 text-xs font-medium text-[var(--color-danger)] hover:underline"
                  aria-label="Delete event"
                >
                  ✕
                </button>
              </div>
              {editingId === e.id && (
                <EventForm event={e} tags={tags} onPatch={(p) => updateEvent(e.id, p)} />
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        data-testid="event-add"
        onClick={addEvent}
        className="self-start rounded-lg border border-dashed border-[var(--color-neutral-300)] px-2 py-1 text-[11px] text-[var(--color-neutral-600)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
      >
        + add event
      </button>
    </div>
  );
}

function EventForm({
  event,
  tags,
  onPatch,
}: {
  event: RealtimeEventDraft;
  tags: Tag[];
  onPatch: (patch: Partial<RealtimeEventDraft>) => void;
}) {
  const payloadText =
    event.payload != null ? JSON.stringify(event.payload, null, 2) : '';
  const payloadRef = useRef<HTMLTextAreaElement | null>(null);
  const channelRef = useRef<HTMLInputElement | null>(null);

  const parseMaybeJson = (text: string): unknown => {
    const t = text.trim();
    if (!t) return undefined;
    try {
      return JSON.parse(t);
    } catch {
      return text;
    }
  };

  const insertPayloadToken = (key: string) => {
    const el = payloadRef.current;
    const token = `{{${key}}}`;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    el.value = next;
    const caret = start + token.length;
    el.focus();
    el.setSelectionRange(caret, caret);
    onPatch({ payload: parseMaybeJson(next) });
  };

  return (
    <div
      data-testid="event-form"
      className="flex flex-col gap-2 border-t border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] px-2 py-2"
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[var(--color-neutral-500)]">
            Channel (optional)
          </label>
          <input
            ref={channelRef}
            type="text"
            value={event.channel}
            data-testid="event-channel"
            placeholder="room-{{roomId}}"
            onChange={(ev) => onPatch({ channel: ev.target.value })}
            className="w-full rounded-lg border border-[var(--color-neutral-300)] px-2 py-1.5 font-mono text-xs focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[var(--color-neutral-500)]">
            Event name
          </label>
          <input
            type="text"
            value={event.event}
            data-testid="event-name"
            placeholder="chat:message"
            onChange={(ev) => onPatch({ event: ev.target.value })}
            className="w-full rounded-lg border border-[var(--color-neutral-300)] px-2 py-1.5 font-mono text-xs focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>
      </div>

      <label className="block text-[10px] font-medium uppercase tracking-wide text-[var(--color-neutral-500)]">
        Payload (JSON)
      </label>
      <textarea
        ref={payloadRef}
        rows={4}
        defaultValue={payloadText}
        data-testid="event-payload"
        placeholder='{ "user": "{{username}}", "text": "hello" }'
        onBlur={(e) => onPatch({ payload: parseMaybeJson(e.target.value) })}
        className="w-full rounded-lg border border-[var(--color-neutral-300)] px-2 py-1.5 font-mono text-xs focus:border-[var(--color-primary)] focus:outline-none"
      />
      <div className="flex flex-wrap gap-1.5" data-testid="event-payload-tag-picker">
        {tags.length === 0 ? (
          <span className="text-[10px] text-[var(--color-neutral-400)]">No tags defined yet.</span>
        ) : (
          tags.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => insertPayloadToken(t.key)}
              data-testid={`event-insert-tag-${t.key}`}
              className="rounded-full border border-[var(--color-neutral-300)] bg-white px-2 py-0.5 font-mono text-[10px] text-[var(--color-neutral-700)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              title={`Insert {{${t.key}}}`}
            >
              {'{{'}{t.key}{'}}'}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---------- Internal call (mock server route) picker ----------
// Shown for function / http nodes. When the node has an outgoing edge to a
// server node, the user can switch it to "call a mock route" mode and pick one
// of the target server's routes. Stored as callMode/targetServerId/
// targetMethod/targetPath in the node config; the executor resolves it.
function CallRoutePicker({
  node,
  nodes,
  edges,
  onChange,
}: {
  node: ApiNode;
  nodes: ApiNode[];
  edges: ApiEdge[];
  onChange: (n: ApiNode) => void;
}) {
  const cfg = (node.config ?? {}) as Record<string, any>;
  const callMode: 'normal' | 'internal' =
    cfg.callMode === 'internal' ? 'internal' : 'normal';

  // Server nodes reachable by an outgoing edge from this node.
  const serverTargets = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return edges
      .filter((e) => e.sourceNodeId === node.id)
      .map((e) => byId.get(e.targetNodeId))
      .filter((n): n is ApiNode => !!n && n.type === 'server');
  }, [nodes, edges, node.id]);

  const setCfg = (patch: Record<string, any>) =>
    onChange({ ...node, config: { ...cfg, ...patch } });

  if (serverTargets.length === 0) {
    return (
      <div
        data-testid="call-route-picker"
        className="rounded-lg border border-dashed border-[var(--color-neutral-300)] bg-[var(--color-neutral-50)] p-3 text-[11px] text-[var(--color-neutral-500)]"
      >
        🔌 Connect this node to a <strong>server node</strong> (draw an edge) to call one of its
        mock API routes.
      </div>
    );
  }

  // Selected server (default: first target). Routes + realtime events of it.
  const selectedServerId =
    typeof cfg.targetServerId === 'string' &&
    serverTargets.some((s) => s.id === cfg.targetServerId)
      ? (cfg.targetServerId as string)
      : serverTargets[0].id;
  const selectedServer = serverTargets.find((s) => s.id === selectedServerId)!;
  const selectedCfg = (selectedServer.config as Record<string, any> | undefined) ?? {};
  const routes = normalizeRoutes(selectedCfg.routes);
  const events = normalizeEvents(selectedCfg.realtime?.events);
  const transport = String(selectedCfg.realtime?.transport ?? '');

  // rest (default) = call a mock route; realtime = subscribe to a mock event.
  const targetKind: 'rest' | 'realtime' =
    cfg.targetKind === 'realtime' ? 'realtime' : 'rest';

  const currentRouteKey =
    callMode === 'internal'
      ? `${String(cfg.targetMethod ?? 'GET').toUpperCase()} ${String(cfg.targetPath ?? '/')}`
      : '';

  return (
    <div
      data-testid="call-route-picker"
      className="flex flex-col gap-2 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-3"
    >
      <label className="flex items-center gap-2 text-xs font-medium text-[var(--color-neutral-700)]">
        <input
          type="checkbox"
          data-testid="call-internal-toggle"
          checked={callMode === 'internal'}
          onChange={(e) =>
            setCfg(
              e.target.checked
                ? {
                    callMode: 'internal',
                    targetKind: cfg.targetKind === 'realtime' ? 'realtime' : 'rest',
                    targetServerId: selectedServerId,
                    targetMethod:
                      cfg.targetMethod ?? routes[0]?.method ?? 'GET',
                    targetPath: cfg.targetPath ?? routes[0]?.path ?? '/',
                  }
                : { callMode: 'normal' },
            )
          }
        />
        Call a mock server (route or realtime)
        <span className="rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
          virtual
        </span>
      </label>

      {callMode === 'internal' && (
        <>
          {serverTargets.length > 1 && (
            <select
              value={selectedServerId}
              data-testid="call-server-select"
              onChange={(e) =>
                setCfg({ targetServerId: e.target.value, targetMethod: 'GET', targetPath: '' })
              }
              className="rounded-lg border border-[var(--color-neutral-300)] bg-white px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
            >
              {serverTargets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          {/* Kind toggle: REST route vs realtime event. */}
          <div
            className="flex gap-1 rounded-lg bg-[var(--color-neutral-100)] p-1"
            data-testid="call-kind-toggle"
          >
            {([
              { id: 'rest', label: 'REST route' },
              { id: 'realtime', label: 'Realtime event' },
            ] as { id: 'rest' | 'realtime'; label: string }[]).map((k) => (
              <button
                key={k.id}
                type="button"
                data-testid={`call-kind-${k.id}`}
                onClick={() =>
                  setCfg(
                    k.id === 'realtime'
                      ? {
                          targetKind: 'realtime',
                          targetEventId: cfg.targetEventId ?? events[0]?.id ?? '',
                          targetEventName: cfg.targetEventName ?? events[0]?.event ?? '',
                        }
                      : { targetKind: 'rest' },
                  )
                }
                className={
                  'flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition ' +
                  (targetKind === k.id
                    ? 'bg-white text-[var(--color-primary)] shadow-sm'
                    : 'text-[var(--color-neutral-500)] hover:text-[var(--color-neutral-700)]')
                }
              >
                {k.label}
              </button>
            ))}
          </div>

          {targetKind === 'rest' ? (
            routes.length === 0 ? (
              <p className="text-[11px] text-[var(--color-warning)]">
                ⚠ <strong>{selectedServer.name}</strong> has no routes defined. Add routes on that
                server node first.
              </p>
            ) : (
              <select
                value={currentRouteKey}
                data-testid="call-route-select"
                onChange={(e) => {
                  const [m, ...rest] = e.target.value.split(' ');
                  setCfg({
                    targetServerId: selectedServerId,
                    targetMethod: m,
                    targetPath: rest.join(' '),
                  });
                }}
                className="rounded-lg border border-[var(--color-neutral-300)] bg-white px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
              >
                <option value="">(select a route)</option>
                {routes.map((r) => (
                  <option key={r.id} value={`${r.method} ${r.path}`}>
                    {r.method} {r.path}
                  </option>
                ))}
              </select>
            )
          ) : events.length === 0 ? (
            <p className="text-[11px] text-[var(--color-warning)]">
              ⚠ <strong>{selectedServer.name}</strong> has no realtime events defined. Add events in
              the server node’s Realtime section first.
            </p>
          ) : (
            <>
              {transport ? (
                <span className="self-start rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
                  {transport}
                </span>
              ) : null}
              <select
                value={typeof cfg.targetEventId === 'string' ? cfg.targetEventId : ''}
                data-testid="call-event-select"
                onChange={(e) => {
                  const ev = events.find((x) => x.id === e.target.value);
                  setCfg({
                    targetServerId: selectedServerId,
                    targetEventId: e.target.value,
                    targetEventName: ev?.event ?? '',
                  });
                }}
                className="rounded-lg border border-[var(--color-neutral-300)] bg-white px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
              >
                <option value="">(select an event)</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.event}
                    {ev.channel ? ` @ ${ev.channel}` : ''}
                  </option>
                ))}
              </select>
            </>
          )}
          <p className="text-[10px] text-[var(--color-neutral-500)]">
            Resolved in-process from the mock server — no real network/socket is used.
          </p>
        </>
      )}
    </div>
  );
}

// ---------- HTTP node config fields (Edit Node modal) ----------
// Organised into tabs (Request / Headers / Body / Output) so a node with a long
// config is easy to scan. Each tab renders only its slice of config.
type HttpTab = 'request' | 'headers' | 'body' | 'preview' | 'output';

// Postman-style body mode. 'raw' is the back-compat default for old nodes.
type BodyMode = 'raw' | 'form' | 'none';

// A single key/value row in form-body mode.
interface BodyFormRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  // The tag a "add from tag" row references (so we can show the source); null
  // for hand-typed rows. The actual value is a live {{tagKey}} string.
  tagId: string | null;
}

function genBodyRowId(): string {
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeBodyForm(raw: unknown): BodyFormRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => r != null && typeof r === 'object')
    .map((r) => ({
      id: typeof r.id === 'string' && r.id ? r.id : genBodyRowId(),
      key: typeof r.key === 'string' ? r.key : '',
      value: typeof r.value === 'string' ? r.value : String(r.value ?? ''),
      enabled: r.enabled !== false,
      tagId: typeof r.tagId === 'string' ? r.tagId : null,
    }));
}

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
  const isGet = method === 'GET';

  const [tab, setTab] = useState<HttpTab>('request');

  const setCfg = (patch: Record<string, any>) =>
    onChange({ ...node, config: { ...cfg, ...patch } });

  // ---- URL: a single text field with {{tag}} interpolation (like a header) ----
  // Back-compat: older nodes stored the URL three different ways —
  //   * urlMode==='builder' / urlParts: an ordered list of typed-tag ids
  //   * urlMode==='tag' / a bare urlTagId: a single tag id
  //   * urlMode==='manual' / config.url: a plain typed string
  // We migrate the first two shapes into a plain `{{tagKey}}` text url ONCE on
  // mount (so the user can keep editing it as text), then drop the legacy keys.
  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    // Already a plain text url (new shape) — nothing to migrate.
    const hasText = typeof cfg.url === 'string' && cfg.url !== '';
    const legacyParts: string[] = Array.isArray(cfg.urlParts)
      ? cfg.urlParts.filter((x: unknown): x is string => typeof x === 'string')
      : [];
    const legacyTagId = typeof cfg.urlTagId === 'string' ? cfg.urlTagId : '';
    const isLegacyBuilder =
      !hasText &&
      (legacyParts.length > 0 ||
        cfg.urlMode === 'builder' ||
        cfg.urlMode === 'tag' ||
        !!legacyTagId);
    if (!isLegacyBuilder) {
      migratedRef.current = true;
      return;
    }
    // Rebuild a `{{tagKey}}` text url from the ordered tag ids. Prefer urlParts;
    // fall back to a single urlTagId.
    const ids = legacyParts.length > 0 ? legacyParts : legacyTagId ? [legacyTagId] : [];
    const text = ids
      .map((pid) => {
        const t = byId.get(pid);
        return t ? `{{${t.key}}}` : '';
      })
      .filter(Boolean)
      .join('');
    migratedRef.current = true;
    // Drop legacy keys so the executor + UI use the new text shape only.
    const next: Record<string, any> = { ...cfg, url: text };
    delete next.urlMode;
    delete next.urlParts;
    delete next.urlTagId;
    onChange({ ...node, config: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const url = String(cfg.url ?? '');

  // URL textarea/input is uncontrolled (defaultValue + onBlur) so a tag-picker
  // chip can splice {{key}} at the caret without fighting React state.
  const urlRef = useRef<HTMLInputElement | null>(null);
  const insertUrlToken = (key: string) => {
    const el = urlRef.current;
    const token = `{{${key}}}`;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    el.value = next;
    const caret = start + token.length;
    el.focus();
    el.setSelectionRange(caret, caret);
    setCfg({ url: next });
  };

  // headers / body are edited as raw JSON text.
  const headersText = cfg.headers != null ? JSON.stringify(cfg.headers, null, 2) : '';
  const bodyText = cfg.body != null ? JSON.stringify(cfg.body, null, 2) : '';

  const parseMaybeJson = (text: string): any => {
    const t = text.trim();
    if (!t) return undefined;
    try {
      return JSON.parse(t);
    } catch {
      return text;
    }
  };

  // Body picker shows only body + generic tags (domain/pathname/param don't
  // belong inside a JSON body string).
  const bodyPickerTags = tags.filter((t) => {
    const ty = t.type ?? 'generic';
    return ty === 'body' || ty === 'generic';
  });

  // ---- Body mode (Postman-style: raw | form | none) ----
  // Absent => 'raw' (back-compat: old nodes only ever stored config.body).
  const bodyMode: BodyMode =
    cfg.bodyMode === 'form' || cfg.bodyMode === 'none' ? cfg.bodyMode : 'raw';
  const bodyForm = useMemo(() => normalizeBodyForm(cfg.bodyForm), [cfg.bodyForm]);

  const writeBodyForm = (next: BodyFormRow[]) => setCfg({ bodyForm: next });

  const addBodyRow = () =>
    writeBodyForm([
      ...bodyForm,
      { id: genBodyRowId(), key: '', value: '', enabled: true, tagId: null },
    ]);

  // "Add from tag": new row whose value is a LIVE {{tagKey}} reference (not a
  // snapshot), key seeded from the tag key.
  const addBodyRowFromTag = (t: Tag) =>
    writeBodyForm([
      ...bodyForm,
      {
        id: genBodyRowId(),
        key: t.key,
        value: `{{${t.key}}}`,
        enabled: true,
        tagId: t.id,
      },
    ]);

  const updateBodyRow = (id: string, patch: Partial<BodyFormRow>) =>
    writeBodyForm(bodyForm.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeBodyRow = (id: string) =>
    writeBodyForm(bodyForm.filter((r) => r.id !== id));

  // Headers textarea ref + token insert (caret splice).
  const headersRef = useRef<HTMLTextAreaElement | null>(null);
  const insertTagToken = (key: string) => {
    const el = headersRef.current;
    const token = `{{${key}}}`;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    el.value = next;
    const caret = start + token.length;
    el.focus();
    el.setSelectionRange(caret, caret);
    setCfg({ headers: parseMaybeJson(next) });
  };

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const insertBodyToken = (key: string) => {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    el.value = next;
    const caret = start + token.length;
    el.focus();
    el.setSelectionRange(caret, caret);
    setCfg({ body: parseMaybeJson(next) });
  };

  // Mask a tag value for previews (params/secrets shouldn't be shoulder-surfed;
  // domain/pathname stay visible since they're structural).
  const maskValue = (t: Tag) =>
    t.type === 'param' || t.type === 'generic'
      ? '•'.repeat(Math.max(3, Math.min(8, t.value.length || 3)))
      : t.value;

  // Resolved (masked) preview of the assembled form body — mirrors the executor
  // (enabled rows only, key+value interpolated). Defined after maskValue so the
  // useMemo factory doesn't close over it before initialization (TDZ).
  const formBodyPreview = useMemo(() => {
    const maskTags = tags.map((t) => ({ key: t.key, value: maskValue(t) }));
    const obj: Record<string, string> = {};
    for (const r of bodyForm) {
      if (!r.enabled) continue;
      const k = interpolateTags(r.key.trim(), maskTags).result;
      if (!k) continue;
      obj[k] = interpolateTags(r.value, maskTags).result;
    }
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return '{}';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyForm, tags]);

  // ---- Resolved URL preview (masked + auto-scheme, mirrors the executor) ----
  const urlPreview = (() => {
    if (!url) return { text: '(no url)', missing: [] as string[], scheme: false };
    const maskTags = tags.map((t) => ({ key: t.key, value: maskValue(t) }));
    const r = interpolateTags(url, maskTags);
    let resolved = r.result.trim();
    let added = false;
    if (resolved && !/^https?:\/\//i.test(resolved)) {
      resolved = 'https://' + resolved.replace(/^\/+/, '');
      added = true;
    }
    return { text: resolved || '(no url)', missing: r.missing, scheme: added };
  })();

  // ---- Resolved-headers preview (masked) ----
  const headersPreview = (() => {
    const h = cfg.headers;
    if (!h || typeof h !== 'object' || Array.isArray(h)) return null;
    const maskTags = tags.map((t) => ({
      key: t.key,
      value: '•'.repeat(Math.max(3, Math.min(8, t.value.length || 3))),
    }));
    const rows: { k: string; v: string; missing: string[] }[] = [];
    for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
      if (typeof v !== 'string') {
        rows.push({ k, v: String(v), missing: [] });
        continue;
      }
      const r = interpolateTags(v, maskTags);
      rows.push({ k, v: r.result, missing: r.missing });
    }
    const anyTag = Object.values(h as Record<string, unknown>).some(hasTagPlaceholder);
    return anyTag ? rows : null;
  })();

  const previewBody = (() => {
    if (isGet) return null;
    if (cfg.body == null || cfg.body === '') return '(empty body)';
    const maskTags = tags.map((t) => ({ key: t.key, value: maskValue(t) }));
    const text = typeof cfg.body === 'string' ? cfg.body : JSON.stringify(cfg.body, null, 2);
    return interpolateTags(text, maskTags).result || '(empty body)';
  })();

  // ---- Combined request-config preview (mirrors the executor exactly) ----
  // The user wants ONE place that shows the full request the executor will send
  // (method / url / every header / data) — like an axios config object — so they
  // can debug why a call fails (empty token? wrong url? missing header?). A
  // "Reveal values" toggle un-masks secret tag values for that debugging.
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Build the config the same way lib/node-executor.ts does, collecting any tag
  // placeholders that don't resolve (missing) or resolve to an empty string
  // (emptyTags) so we can flag them — those are the usual "why did it fail".
  const configPreview = useMemo(() => {
    // When revealing, show the real tag value; otherwise mask param/generic.
    const previewTags = tags.map((t) => ({
      key: t.key,
      value: reveal ? (t.value ?? '') : maskValue(t),
    }));
    const missingSet = new Set<string>();
    const emptySet = new Set<string>();
    // A tag whose *real* value is empty/whitespace — flagged regardless of mask.
    const emptyByKey = new Map(
      tags.map((t) => [t.key, !((t.value ?? '').trim())] as const),
    );
    const noteMissing = (keys: string[]) => keys.forEach((k) => missingSet.add(k));
    // Record which referenced keys resolve to an empty real value.
    const noteRefs = (raw: string) => {
      if (typeof raw !== 'string') return;
      const re = /\{\{\s*([^{}]+?)\s*\}\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw)) !== null) {
        const k = m[1];
        if (emptyByKey.get(k)) emptySet.add(k);
      }
    };

    // url: interpolate + auto-scheme https:// (mirrors executor).
    let url = '';
    let schemeAdded = false;
    {
      noteRefs(String(cfg.url ?? ''));
      const r = interpolateTags(String(cfg.url ?? ''), previewTags);
      noteMissing(r.missing);
      let resolved = r.result.trim();
      if (resolved && !/^https?:\/\//i.test(resolved)) {
        resolved = 'https://' + resolved.replace(/^\/+/, '');
        schemeAdded = true;
      }
      url = resolved;
    }

    // headers: Content-Type default + each value interpolated (mirrors executor).
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const h = cfg.headers;
    if (h && typeof h === 'object' && !Array.isArray(h)) {
      for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
        if (typeof v === 'string') {
          noteRefs(v);
          const r = interpolateTags(v, previewTags);
          noteMissing(r.missing);
          headers[k] = r.result;
        } else {
          headers[k] = String(v);
        }
      }
    }

    // data: built per body mode (mirrors the executor) — only for non-GET.
    //   none -> no data; form -> assemble from enabled rows; raw -> config.body.
    let data: string | undefined;
    if (!isGet && bodyMode !== 'none') {
      if (bodyMode === 'form') {
        const obj: Record<string, unknown> = {};
        for (const row of bodyForm) {
          if (!row.enabled) continue;
          noteRefs(row.key);
          noteRefs(row.value);
          const kr = interpolateTags(row.key.trim(), previewTags);
          noteMissing(kr.missing);
          if (!kr.result) continue;
          const vr = interpolateTags(row.value, previewTags);
          noteMissing(vr.missing);
          obj[kr.result] = vr.result;
        }
        try {
          data = JSON.stringify(obj);
        } catch {
          data = String(obj);
        }
      } else if (cfg.body != null && cfg.body !== '') {
        // raw mode (and back-compat default).
        noteRefs(typeof cfg.body === 'string' ? cfg.body : JSON.stringify(cfg.body));
        if (typeof cfg.body === 'string') {
          const r = interpolateTags(cfg.body, previewTags);
          noteMissing(r.missing);
          data = r.result;
        } else {
          const r = interpolateDeep(cfg.body, previewTags);
          noteMissing(r.missing);
          try {
            data = JSON.stringify(r.value);
          } catch {
            data = String(r.value);
          }
        }
      }
    }

    return {
      method: method.toLowerCase(),
      url,
      schemeAdded,
      headers,
      data,
      missing: Array.from(missingSet),
      emptyTags: Array.from(emptySet),
    };
  }, [tags, reveal, cfg.url, cfg.headers, cfg.body, method, isGet, bodyMode, bodyForm]);

  // Render the config as a copy-pastable JS object literal (axios-style).
  const configText = useMemo(() => {
    const lines: string[] = ['const config = {'];
    lines.push(`  method: ${JSON.stringify(configPreview.method)},`);
    lines.push(`  url: ${JSON.stringify(configPreview.url)},`);
    lines.push('  headers: {');
    for (const [k, v] of Object.entries(configPreview.headers)) {
      lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
    }
    lines.push('  },');
    if (configPreview.data !== undefined) {
      lines.push(`  data: ${JSON.stringify(configPreview.data)},`);
    }
    lines.push('};');
    return lines.join('\n');
  }, [configPreview]);

  const copyConfig = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(configText);
      } else {
        const ta = document.createElement('textarea');
        ta.value = configText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  // ---- Output bindings (Response → Tag), saved on this node ----
  const outputBindings: NodeBinding[] = Array.isArray(cfg.outputBindings)
    ? (cfg.outputBindings as NodeBinding[])
    : [];
  const tagKeyById = (tid: string) => byId.get(tid)?.key ?? null;
  const removeBinding = (path: string) => {
    setCfg({ outputBindings: outputBindings.filter((b) => b.path !== path) });
  };

  const TABS: { id: HttpTab; label: string }[] = [
    { id: 'request', label: 'Request' },
    { id: 'headers', label: 'Headers' },
    { id: 'body', label: 'Body' },
    { id: 'preview', label: 'Preview' },
    { id: 'output', label: 'Output' },
  ];

  // Shared tag-picker chip renderer.
  const TagChips = ({
    pool,
    onInsert,
    testid,
    empty,
  }: {
    pool: Tag[];
    onInsert: (key: string) => void;
    testid: string;
    empty: string;
  }) => (
    <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid={testid}>
      {pool.length === 0 ? (
        <span className="text-[10px] text-[var(--color-neutral-400)]">{empty}</span>
      ) : (
        pool.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onInsert(t.key)}
            data-testid={`${testid}-insert-${t.key}`}
            className="rounded-full border border-[var(--color-neutral-300)] bg-white px-2 py-0.5 font-mono text-[10px] text-[var(--color-neutral-700)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            title={`Insert {{${t.key}}}`}
          >
            {'{{'}{t.key}{'}}'}
          </button>
        ))
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-neutral-500)]">
        HTTP Request
      </p>

      {/* Tab bar */}
      <div
        className="flex gap-1 rounded-lg bg-[var(--color-neutral-100)] p-1"
        data-testid="http-tabs"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`http-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={
              'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ' +
              (tab === t.id
                ? 'bg-white text-[var(--color-primary)] shadow-sm'
                : 'text-[var(--color-neutral-500)] hover:text-[var(--color-neutral-700)]')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- Request tab: method + url ---- */}
      {tab === 'request' && (
        <div className="flex flex-col gap-3" data-testid="http-tab-panel-request">
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
            <input
              ref={urlRef}
              type="text"
              placeholder="https://{{domain}}/api/v1/endpoint"
              defaultValue={url}
              key={url}
              data-testid="http-url"
              onBlur={(e) => setCfg({ url: e.target.value })}
              className="rounded-lg border border-[var(--color-neutral-300)] px-3 py-2.5 font-mono text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
          <div>
            <p className="text-[10px] text-[var(--color-neutral-500)]">
              Type the URL and embed tags with{' '}
              <code className="font-mono">{'{{tagKey}}'}</code> — e.g.{' '}
              <code className="font-mono">https://{'{{domain}}'}/api</code>. No scheme? https:// is
              added automatically. Click a tag to insert it at the cursor.
            </p>
            <TagChips
              pool={tags}
              onInsert={insertUrlToken}
              testid="url-tag-picker"
              empty="No tags defined yet."
            />
          </div>
          {/* Resolved URL preview (masked + shows auto-added scheme). */}
          <div
            data-testid="http-url-preview"
            className="rounded-lg bg-[var(--color-neutral-900)] p-2"
          >
            <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-neutral-400)]">
              Resolved URL
            </p>
            <code className="block break-all font-mono text-[11px] text-[var(--color-neutral-100)]">
              {method} {urlPreview.text}
            </code>
            {urlPreview.scheme && (
              <span className="mt-1 block text-[10px] text-[var(--color-info)]">
                ↳ https:// added automatically
              </span>
            )}
            {urlPreview.missing.length > 0 && (
              <span className="mt-1 block text-[10px] text-[var(--color-warning)]">
                ⚠ unknown tag: {urlPreview.missing.join(', ')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ---- Headers tab ---- */}
      {tab === 'headers' && (
        <div data-testid="http-tab-panel-headers">
          <label className="mb-1 block text-xs font-medium text-[var(--color-neutral-600)]">
            Headers (JSON)
          </label>
          <textarea
            ref={headersRef}
            rows={4}
            placeholder='{ "Authorization": "Bearer {{access_token}}" }'
            defaultValue={headersText}
            data-testid="http-headers"
            onBlur={(e) => setCfg({ headers: parseMaybeJson(e.target.value) })}
            className="w-full rounded-lg border border-[var(--color-neutral-300)] px-3 py-2 font-mono text-xs focus:border-[var(--color-primary)] focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-[var(--color-neutral-500)]">
            Insert a tag with <code className="font-mono">{'{{tagKey}}'}</code> — e.g.{' '}
            <code className="font-mono">Bearer {'{{access_token}}'}</code>. Click a tag below to
            insert it at the cursor.
          </p>
          <TagChips
            pool={tags}
            onInsert={insertTagToken}
            testid="header-tag-picker"
            empty="No tags defined yet."
          />
          {headersPreview && (
            <div
              data-testid="http-headers-preview"
              className="mt-2 rounded-lg bg-[var(--color-neutral-900)] p-2"
            >
              <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-neutral-400)]">
                Resolved headers
              </p>
              {headersPreview.map((r) => (
                <code
                  key={r.k}
                  className="block break-all font-mono text-[11px] text-[var(--color-neutral-100)]"
                >
                  {r.k}: {r.v}
                  {r.missing.length > 0 && (
                    <span className="ml-2 text-[var(--color-warning)]">
                      ⚠ unknown tag: {r.missing.join(', ')}
                    </span>
                  )}
                </code>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- Body tab (Postman-style: raw / form / none) ---- */}
      {tab === 'body' && (
        <div data-testid="http-tab-panel-body" className="flex flex-col gap-2">
          {/* Mode toggle */}
          <div
            className="flex gap-1 rounded-lg bg-[var(--color-neutral-100)] p-1"
            data-testid="body-mode-toggle"
          >
            {([
              { id: 'raw', label: 'raw (JSON)' },
              { id: 'form', label: 'form (key-value)' },
              { id: 'none', label: 'none' },
            ] as { id: BodyMode; label: string }[]).map((m) => (
              <button
                key={m.id}
                type="button"
                data-testid={`body-mode-${m.id}`}
                disabled={isGet}
                onClick={() => setCfg({ bodyMode: m.id })}
                className={
                  'flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition disabled:opacity-50 ' +
                  (bodyMode === m.id
                    ? 'bg-white text-[var(--color-primary)] shadow-sm'
                    : 'text-[var(--color-neutral-500)] hover:text-[var(--color-neutral-700)]')
                }
              >
                {m.label}
              </button>
            ))}
          </div>

          {isGet ? (
            <p className="rounded-lg bg-[var(--color-neutral-100)] px-3 py-2 text-[11px] text-[var(--color-neutral-500)]">
              GET requests don’t send a body.
            </p>
          ) : bodyMode === 'none' ? (
            <p
              data-testid="body-none-note"
              className="rounded-lg bg-[var(--color-neutral-100)] px-3 py-3 text-center text-[11px] text-[var(--color-neutral-500)]"
            >
              No body will be sent with this request.
            </p>
          ) : bodyMode === 'form' ? (
            <div className="flex flex-col gap-2" data-testid="body-form">
              {bodyForm.length === 0 ? (
                <p className="text-[11px] text-[var(--color-neutral-400)]">
                  No fields yet. Add a key/value row, or add one from a tag.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {bodyForm.map((row) => (
                    <div
                      key={row.id}
                      data-testid="body-form-row"
                      data-row-key={row.key}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="checkbox"
                        data-testid={`body-row-enabled-${row.key}`}
                        checked={row.enabled}
                        onChange={(e) => updateBodyRow(row.id, { enabled: e.target.checked })}
                        title={row.enabled ? 'Enabled — included in body' : 'Disabled — skipped'}
                      />
                      <input
                        type="text"
                        value={row.key}
                        data-testid="body-row-key"
                        placeholder="key"
                        onChange={(e) => updateBodyRow(row.id, { key: e.target.value })}
                        className="min-w-0 flex-1 rounded-lg border border-[var(--color-neutral-300)] px-2 py-1.5 font-mono text-xs focus:border-[var(--color-primary)] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={row.value}
                        data-testid="body-row-value"
                        placeholder="value or {{tag}}"
                        onChange={(e) =>
                          updateBodyRow(row.id, { value: e.target.value, tagId: null })
                        }
                        className="min-w-0 flex-1 rounded-lg border border-[var(--color-neutral-300)] px-2 py-1.5 font-mono text-xs focus:border-[var(--color-primary)] focus:outline-none"
                      />
                      {/* ↹tag: replace this row's value with a live {{tag}} ref */}
                      <select
                        value=""
                        data-testid={`body-row-tag-${row.key}`}
                        onChange={(e) => {
                          const t = tags.find((x) => x.id === e.target.value);
                          if (t)
                            updateBodyRow(row.id, { value: `{{${t.key}}}`, tagId: t.id });
                        }}
                        className="shrink-0 rounded-lg border border-[var(--color-neutral-300)] bg-white px-1 py-1.5 text-[11px] focus:border-[var(--color-primary)] focus:outline-none"
                        title="Insert a tag reference as the value"
                      >
                        <option value="">↹</option>
                        {tags.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.key}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        data-testid={`body-row-remove-${row.key}`}
                        onClick={() => removeBodyRow(row.id)}
                        className="shrink-0 rounded px-1 text-xs text-[var(--color-danger)] hover:underline"
                        aria-label="Remove row"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="body-row-add"
                  onClick={addBodyRow}
                  className="rounded-lg border border-dashed border-[var(--color-neutral-300)] px-2 py-1 text-[11px] text-[var(--color-neutral-600)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  + add field
                </button>
                {/* Add a row whose value is a LIVE {{tagKey}} reference. */}
                <select
                  value=""
                  data-testid="body-add-from-tag"
                  onChange={(e) => {
                    const t = tags.find((x) => x.id === e.target.value);
                    if (t) addBodyRowFromTag(t);
                  }}
                  className="rounded-lg border border-[var(--color-neutral-300)] bg-white px-2 py-1 text-[11px] text-[var(--color-neutral-600)] focus:border-[var(--color-primary)] focus:outline-none"
                >
                  <option value="">+ add from tag…</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.key}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-1 rounded-lg bg-[var(--color-neutral-900)] p-2">
                <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-neutral-400)]">
                  Resolved body
                </p>
                <pre
                  data-testid="body-form-preview"
                  className="whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--color-neutral-300)]"
                >
                  {formBodyPreview}
                </pre>
              </div>
            </div>
          ) : (
            /* raw mode (default) */
            <>
              <textarea
                ref={bodyRef}
                rows={5}
                placeholder='{ "hello": "{{bodyTag}}" }'
                defaultValue={bodyText}
                key={bodyText}
                data-testid="http-body"
                onBlur={(e) => setCfg({ body: parseMaybeJson(e.target.value) })}
                className="w-full rounded-lg border border-[var(--color-neutral-300)] px-3 py-2 font-mono text-xs focus:border-[var(--color-primary)] focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-[var(--color-neutral-500)]">
                Insert a tag with <code className="font-mono">{'{{tagKey}}'}</code>. Click a tag
                below to insert it at the cursor.
              </p>
              <TagChips
                pool={bodyPickerTags}
                onInsert={insertBodyToken}
                testid="body-tag-picker"
                empty="No body/generic tags defined yet."
              />
              {previewBody !== null && (
                <div className="mt-2 rounded-lg bg-[var(--color-neutral-900)] p-2">
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-neutral-400)]">
                    Resolved body
                  </p>
                  <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--color-neutral-300)]">
                    {previewBody}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ---- Preview tab: full request config (mirrors the executor) ---- */}
      {tab === 'preview' && (
        <div className="flex flex-col gap-3" data-testid="http-tab-panel-preview">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-[var(--color-neutral-500)]">
              The exact request the executor sends — resolved {`{{tags}}`}, headers and data in one
              place. Use it to debug a failing call.
            </p>
          </div>

          {/* Controls: reveal toggle + copy. */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="http-preview-reveal"
              onClick={() => setReveal((v) => !v)}
              className={
                'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ' +
                (reveal
                  ? 'border-[var(--color-warning)] bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                  : 'border-[var(--color-neutral-300)] bg-white text-[var(--color-neutral-600)] hover:border-[var(--color-primary)]')
              }
              title={reveal ? 'Hide secret values' : 'Reveal real values (for debugging)'}
            >
              {reveal ? '🙈 Hide values' : '👁️ Reveal values'}
            </button>
            <button
              type="button"
              data-testid="http-preview-copy"
              onClick={copyConfig}
              className="flex items-center gap-1 rounded-lg border border-[var(--color-neutral-300)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-neutral-600)] transition hover:border-[var(--color-primary)]"
            >
              {copied ? '✓ Copied' : '⧉ Copy config'}
            </button>
          </div>

          {reveal && (
            <p
              data-testid="http-preview-reveal-warning"
              className="rounded-md bg-[var(--color-warning)]/10 px-2 py-1 text-[10px] text-[var(--color-warning)]"
            >
              ⚠ Showing real values (tokens, cookies). Don’t share this screen.
            </p>
          )}

          {/* The config object, axios/fetch style. */}
          <div
            data-testid="http-config-preview"
            className="rounded-lg bg-[var(--color-neutral-900)] p-3"
          >
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-[var(--color-neutral-100)]">
              {configText}
            </pre>
            {configPreview.schemeAdded && (
              <span className="mt-2 block text-[10px] text-[var(--color-info)]">
                ↳ https:// added automatically (url had no scheme)
              </span>
            )}
          </div>

          {/* Debug helper: flag unresolved / empty tags. */}
          {(configPreview.missing.length > 0 || configPreview.emptyTags.length > 0) && (
            <div
              data-testid="http-preview-warnings"
              className="flex flex-col gap-1 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 p-2"
            >
              {configPreview.missing.map((k) => (
                <span
                  key={`m-${k}`}
                  data-testid={`http-preview-missing-${k}`}
                  className="text-[10px] text-[var(--color-warning)]"
                >
                  ⚠ {`{{${k}}}`} ไม่มีค่า — ไม่มี tag ชื่อนี้ (สะกดผิด หรือยังไม่ได้สร้าง)
                </span>
              ))}
              {configPreview.emptyTags.map((k) => (
                <span
                  key={`e-${k}`}
                  data-testid={`http-preview-empty-${k}`}
                  className="text-[10px] text-[var(--color-warning)]"
                >
                  ⚠ tag <code className="font-mono">{k}</code> ว่าง — login ก่อน หรือ bind จาก
                  response (tab Output)
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- Output tab: Response → Tag bindings ---- */}
      {tab === 'output' && (
        <div data-testid="http-tab-panel-output" className="flex flex-col gap-2">
          <label className="block text-xs font-medium text-[var(--color-neutral-600)]">
            Response → Tag bindings
          </label>
          <p className="text-[10px] text-[var(--color-neutral-500)]">
            Run this node, then bind a field of the response to a tag from the result panel. Saved
            bindings re-capture that field on every run.
          </p>
          {outputBindings.length === 0 ? (
            <span
              data-testid="http-output-empty"
              className="rounded-lg border border-dashed border-[var(--color-neutral-300)] px-3 py-3 text-center text-[11px] text-[var(--color-neutral-400)]"
            >
              No output bindings yet. Run the node and bind a response field to a tag.
            </span>
          ) : (
            <div className="flex flex-col gap-1.5" data-testid="http-output-bindings">
              {outputBindings.map((b) => {
                const key = b.tagKey ?? tagKeyById(b.tagId);
                return (
                  <div
                    key={b.path}
                    data-testid={`http-output-binding-${b.path}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-neutral-200)] bg-white px-2.5 py-1.5"
                  >
                    <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--color-neutral-700)]">
                      <span className="text-[var(--color-neutral-500)]">{b.path}</span>
                      <span className="mx-1 text-[var(--color-neutral-400)]">→</span>
                      <span className="text-[var(--color-primary)]">
                        {key ? `{{${key}}}` : '(tag deleted)'}
                      </span>
                    </code>
                    <button
                      type="button"
                      data-testid={`http-output-remove-${b.path}`}
                      onClick={() => removeBinding(b.path)}
                      className="shrink-0 rounded px-1 text-xs text-[var(--color-danger)] hover:underline"
                      aria-label="Remove binding"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
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
          const meta = nodeDisplayMeta(n.type, n.config as Record<string, any> | undefined);
          const outgoing = edges.filter((e) => e.sourceNodeId === n.id);
          const sCfg = (n.config ?? {}) as Record<string, any>;
          const sFramework = n.type === 'server' ? String(sCfg.framework ?? '') : '';
          const sPort =
            n.type === 'server' && sCfg.port != null && sCfg.port !== ''
              ? String(sCfg.port)
              : '';
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

              {n.type === 'server' && (sFramework || sPort) ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {sFramework ? (
                    <span
                      className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white"
                      style={{ background: meta.color }}
                    >
                      {sFramework}
                    </span>
                  ) : null}
                  {sPort ? (
                    <span className="rounded-md bg-[var(--color-neutral-100)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--color-neutral-600)]">
                      :{sPort}
                    </span>
                  ) : null}
                </div>
              ) : null}

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
                  {n.type === 'server' ? '▶ Ping' : '▶ Run'}
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
