'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  MarkerType,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { WikiGraphNode, type WikiNodeData } from './WikiGraphNode';
import { layeredLayout } from './graphLayout';
import { colorForType, labelForType } from './typeColors';

interface ApiNode {
  id: string;
  label: string;
  type: string;
  tags: string[];
  repoPath: string;
  githubUrl: string;
  size: number;
}
interface ApiEdge {
  source: string;
  target: string;
}
interface ApiResponse {
  nodes: ApiNode[];
  edges: ApiEdge[];
  generatedAt: string;
  source: string;
}

const nodeTypes = { wiki: WikiGraphNode };

function WikiGraphInner() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<WikiNodeData>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/wiki/graph');
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Request failed: ${res.status}`);
        }
        const json: ApiResponse = await res.json();
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load graph');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Connection count per node (degree), for sizing + the side panel.
  const degreeMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    for (const n of data.nodes) m.set(n.id, 0);
    for (const e of data.edges) {
      m.set(e.source, (m.get(e.source) || 0) + 1);
      m.set(e.target, (m.get(e.target) || 0) + 1);
    }
    return m;
  }, [data]);

  // All distinct types present, for the filter checkboxes.
  const allTypes = useMemo(() => {
    if (!data) return [] as string[];
    return [...new Set(data.nodes.map((n) => n.type))].sort();
  }, [data]);

  // Precompute base positions once from the full graph so filtering/search
  // never reshuffles the layout.
  const positions = useMemo(() => {
    if (!data) return {} as Record<string, { x: number; y: number }>;
    return layeredLayout(
      data.nodes.map((n) => ({ id: n.id, degree: degreeMap.get(n.id) || 0 })),
      data.edges
    );
  }, [data, degreeMap]);

  // Which nodes pass the search + type filters.
  const matchSet = useMemo(() => {
    const s = new Set<string>();
    if (!data) return s;
    const q = search.trim().toLowerCase();
    for (const n of data.nodes) {
      if (hiddenTypes.has(n.type)) continue;
      if (q) {
        const inName = n.label.toLowerCase().includes(q);
        const inTags = n.tags.some((t) => t.toLowerCase().includes(q));
        if (!inName && !inTags) continue;
      }
      s.add(n.id);
    }
    return s;
  }, [data, search, hiddenTypes]);

  // Neighbors of the selected node — used to highlight the local subgraph.
  const neighborSet = useMemo(() => {
    const s = new Set<string>();
    if (!data || !selectedId) return s;
    for (const e of data.edges) {
      if (e.source === selectedId) s.add(e.target);
      if (e.target === selectedId) s.add(e.source);
    }
    return s;
  }, [data, selectedId]);

  // Build React Flow nodes/edges whenever data or any filter/selection changes.
  useEffect(() => {
    if (!data) return;

    const nodes: Node<WikiNodeData>[] = data.nodes
      .filter((n) => !hiddenTypes.has(n.type))
      .map((n) => {
        const pos = positions[n.id] || { x: 0, y: 0 };
        const matched = matchSet.has(n.id);
        const isSelected = selectedId === n.id;
        const isNeighbor = neighborSet.has(n.id);
        // Dim when a search is active and this node doesn't match, or when a
        // node is selected and this one isn't in its neighborhood.
        const dimmedBySearch = search.trim().length > 0 && !matched;
        const dimmedBySelection = selectedId != null && !isSelected && !isNeighbor;
        return {
          id: n.id,
          type: 'wiki',
          position: pos,
          data: {
            label: n.label,
            type: n.type,
            size: n.size,
            connections: degreeMap.get(n.id) || 0,
            color: colorForType(n.type),
            dimmed: dimmedBySearch || dimmedBySelection,
            selected: isSelected,
          },
        };
      });

    const visibleIds = new Set(nodes.map((n) => n.id));
    const edges: Edge[] = data.edges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => {
        const active =
          selectedId != null && (e.source === selectedId || e.target === selectedId);
        return {
          id: `${e.source}->${e.target}`,
          source: e.source,
          target: e.target,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          style: {
            stroke: active ? '#cf3a1e' : '#c2c4c9',
            strokeWidth: active ? 2 : 1,
            opacity: selectedId != null && !active ? 0.25 : 0.7,
          },
        };
      });

    setRfNodes(nodes);
    setRfEdges(edges);
  }, [
    data,
    positions,
    matchSet,
    neighborSet,
    hiddenTypes,
    search,
    selectedId,
    degreeMap,
    setRfNodes,
    setRfEdges,
  ]);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelectedId((cur) => (cur === node.id ? null : node.id));
  }, []);

  const toggleType = useCallback((type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const selectedNode = useMemo(
    () => data?.nodes.find((n) => n.id === selectedId) || null,
    [data, selectedId]
  );

  const selectedConnections = useMemo(() => {
    if (!data || !selectedId) return [] as ApiNode[];
    const ids = new Set<string>();
    for (const e of data.edges) {
      if (e.source === selectedId) ids.add(e.target);
      if (e.target === selectedId) ids.add(e.source);
    }
    return data.nodes.filter((n) => ids.has(n.id)).sort((a, b) => a.label.localeCompare(b.label));
  }, [data, selectedId]);

  return (
    <div className="flex h-screen flex-col bg-[var(--color-neutral-50)]">
      {/* Header */}
      <header className="z-10 flex items-center justify-between border-b border-[var(--color-neutral-200)] bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-[var(--color-neutral-500)] hover:text-[var(--color-neutral-900)]"
          >
            ← Dashboard
          </Link>
          <h1 className="text-base font-semibold text-[var(--color-neutral-900)]">
            🕸️ Knowledge Graph
          </h1>
          {data && (
            <span className="hidden text-xs text-[var(--color-neutral-400)] sm:inline">
              {data.nodes.length} pages · {data.edges.length} links
            </span>
          )}
        </div>
        <Link
          href="/docs"
          className="text-sm font-medium text-[var(--color-neutral-500)] hover:text-[var(--color-neutral-900)]"
        >
          Docs
        </Link>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        {/* Left control rail */}
        <aside className="z-10 flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--color-neutral-200)] bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-neutral-500)]">
              Search
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="name or tag…"
              className="w-full rounded-lg border border-[var(--color-neutral-300)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-[var(--color-neutral-500)]">
              Filter by type
            </div>
            <div className="flex flex-col gap-1.5">
              {allTypes.map((type) => {
                const visible = !hiddenTypes.has(type);
                const count = data?.nodes.filter((n) => n.type === type).length || 0;
                return (
                  <label
                    key={type}
                    className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-neutral-700)]"
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggleType(type)}
                      className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                    />
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: colorForType(type) }}
                    />
                    <span className="flex-1">{labelForType(type)}</span>
                    <span className="text-xs text-[var(--color-neutral-400)]">{count}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {data && (
            <p className="mt-auto text-[11px] leading-relaxed text-[var(--color-neutral-400)]">
              Source: {data.source}. Click a node to inspect its connections.
            </p>
          )}
        </aside>

        {/* Canvas */}
        <main className="relative flex-1">
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center text-sm text-[var(--color-neutral-500)]">
              Loading knowledge graph…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
              <div className="max-w-sm rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-4 text-sm text-[var(--color-danger)]">
                {error}
              </div>
            </div>
          )}
          {!loading && !error && (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.15}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#dcdde0" gap={20} />
              <Controls />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) => colorForType((n.data as WikiNodeData)?.type || 'unknown')}
                maskColor="rgba(247,247,248,0.7)"
              />
            </ReactFlow>
          )}
        </main>

        {/* Right detail panel */}
        {selectedNode && (
          <aside className="z-10 flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-[var(--color-neutral-200)] bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: colorForType(selectedNode.type) }}
                />
                <h2 className="text-sm font-semibold text-[var(--color-neutral-900)]">
                  {selectedNode.label}
                </h2>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="text-[var(--color-neutral-400)] hover:text-[var(--color-neutral-700)]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div>
              <span
                className="rounded px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: `${colorForType(selectedNode.type)}22`,
                  color: colorForType(selectedNode.type),
                }}
              >
                {labelForType(selectedNode.type)}
              </span>
            </div>

            {selectedNode.tags.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-[var(--color-neutral-500)]">
                  Tags
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedNode.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-[var(--color-neutral-100)] px-1.5 py-0.5 text-[11px] text-[var(--color-neutral-600)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--color-neutral-500)]">
                Connections ({selectedConnections.length})
              </div>
              {selectedConnections.length === 0 ? (
                <p className="text-xs text-[var(--color-neutral-400)]">No backlinks.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {selectedConnections.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelectedId(c.id)}
                        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-100)]"
                      >
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: colorForType(c.type) }}
                        />
                        <span className="truncate">{c.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <a
              href={selectedNode.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-neutral-300)] px-3 py-2 text-sm font-medium text-[var(--color-neutral-700)] transition-colors hover:bg-[var(--color-neutral-100)]"
            >
              View on GitHub ↗
            </a>
          </aside>
        )}
      </div>
    </div>
  );
}

export default function WikiGraphClient() {
  return (
    <ReactFlowProvider>
      <WikiGraphInner />
    </ReactFlowProvider>
  );
}
