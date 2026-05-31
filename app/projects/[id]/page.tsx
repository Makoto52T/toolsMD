'use client';

import { useState, useEffect, useCallback, useMemo, use } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const [editingNode, setEditingNode] = useState<ApiNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiNode | null>(null);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<string | null>(null);

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
      setProject(await projRes.json());
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

  // ---- Execute ----
  const execute = async () => {
    setExecuting(true);
    try {
      const res = await fetch(`/api/projects/${id}/execute`, { method: 'POST' });
      const data = await res.json();
      setExecResult(JSON.stringify(data, null, 2));
      if (res.ok) toast.success('Execution finished');
      else toast.error('Execution returned an error');
    } catch {
      toast.error('Execution failed');
      setExecResult('Network error during execution.');
    } finally {
      setExecuting(false);
    }
  };

  // ---- React Flow mapping ----
  const rfNodes: RFNode<FlowNodeData>[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: 'tmd',
        position: { x: n.positionX, y: n.positionY },
        data: {
          name: n.name,
          type: n.type,
          description: n.description,
          onEdit: (nid: string) => setEditingNode(nodes.find((x) => x.id === nid) ?? null),
          onDelete: (nid: string) => setDeleteTarget(nodes.find((x) => x.id === nid) ?? null),
        },
      })),
    [nodes],
  );

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
      setNodes((prev) => {
        const rf = applyNodeChanges(
          changes,
          prev.map((n) => ({
            id: n.id,
            type: 'tmd',
            position: { x: n.positionX, y: n.positionY },
            data: { name: n.name, type: n.type } as FlowNodeData,
          })),
        );
        const posById = new Map(rf.map((r) => [r.id, r.position]));
        return prev.map((n) => {
          const p = posById.get(n.id);
          return p ? { ...n, positionX: p.x, positionY: p.y } : n;
        });
      });
      changes.forEach((c) => {
        if (c.type === 'position' && c.dragging === false) {
          setNodes((prev) => {
            const node = prev.find((n) => n.id === c.id);
            if (node) persistPosition(node);
            return prev;
          });
        }
      });
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
          </div>
        )}
      </Modal>

      {/* Execute result modal */}
      <Modal
        open={execResult !== null}
        onClose={() => setExecResult(null)}
        title="Execution Result"
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setExecResult(null)}>
              Close
            </Button>
          </div>
        }
      >
        <pre className="max-h-[60vh] overflow-auto rounded-lg bg-[var(--color-neutral-900)] p-4 text-xs leading-relaxed text-[var(--color-neutral-100)]">
          {execResult}
        </pre>
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

// ---------- Mobile list editor ----------
function MobileNodeList({
  nodes,
  edges,
  onEdit,
  onDelete,
  onConnect,
  onDeleteEdge,
}: {
  nodes: ApiNode[];
  edges: ApiEdge[];
  onEdit: (n: ApiNode) => void;
  onDelete: (n: ApiNode) => void;
  onConnect: (source: string, target: string) => void;
  onDeleteEdge: (edgeId: string) => void;
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
