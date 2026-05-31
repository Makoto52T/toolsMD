'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';

const NODE_TYPES = ['function', 'http-request', 'puppeteer', 'sub-project'];

export default function ProjectPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [project, setProject] = useState<any>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<any>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000); // Auto-save every 3s
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    const [projRes, nodesRes, edgesRes] = await Promise.all([
      fetch(`/api/projects/${id}`),
      fetch(`/api/projects/${id}/nodes`),
      fetch(`/api/projects/${id}/edges`),
    ]);

    if (!projRes.ok) return router.push('/dashboard');
    setProject(await projRes.json());
    if (nodesRes.ok) setNodes(await nodesRes.json());
    if (edgesRes.ok) setEdges(await edgesRes.json());
  };

  const addNode = async () => {
    const newNode = {
      type: 'function',
      name: 'New Node',
      description: '',
      positionX: Math.random() * 600,
      positionY: Math.random() * 400,
      config: {},
    };

    const res = await fetch(`/api/projects/${id}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newNode),
    });

    if (res.ok) {
      const node = await res.json();
      setNodes([...nodes, node]);
    }
  };

  const deleteNode = async (nodeId: string) => {
    await fetch(`/api/projects/${id}/nodes/${nodeId}`, { method: 'DELETE' });
    setNodes(nodes.filter((n) => n.id !== nodeId));
    setEdges(edges.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId));
  };

  const connectNodes = async (targetId: string) => {
    if (connecting && connecting !== targetId) {
      const res = await fetch(`/api/projects/${id}/edges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceNodeId: connecting,
          targetNodeId: targetId,
          label: '',
        }),
      });

      if (res.ok) {
        const edge = await res.json();
        setEdges([...edges, edge]);
      }
    }
    setConnecting(null);
  };

  const deleteEdge = async (edgeId: string) => {
    await fetch(`/api/projects/${id}/edges/${edgeId}`, { method: 'DELETE' });
    setEdges(edges.filter((e) => e.id !== edgeId));
  };

  const updateNode = async () => {
    if (!editingNode) return;
    await fetch(`/api/projects/${id}/nodes/${editingNode.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingNode),
    });

    setNodes(nodes.map((n) => (n.id === editingNode.id ? editingNode : n)));
    setEditingNode(null);
  };

  if (!project) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="border-b px-4 py-3 flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            ← Dashboard
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <p className="text-gray-600 text-sm">{project.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={addNode} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold">
            + Add Node
          </button>
          <button
            onClick={() => window.open(`/api/projects/${id}/export`, '_blank')}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold"
          >
            📄 Export .md
          </button>
          <button
            onClick={async () => {
              const res = await fetch(`/api/projects/${id}/execute`, { method: 'POST' });
              const data = await res.json();
              alert(JSON.stringify(data, null, 2));
            }}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 font-semibold"
          >
            ▶️ Execute
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden" ref={canvasRef}>
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {edges.map((edge) => {
            const source = nodes.find((n) => n.id === edge.sourceNodeId);
            const target = nodes.find((n) => n.id === edge.targetNodeId);
            if (!source || !target) return null;

            const x1 = source.positionX + 75;
            const y1 = source.positionY + 40;
            const x2 = target.positionX + 75;
            const y2 = target.positionY + 40;

            return (
              <g key={edge.id}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#333" strokeWidth="2" />
                <circle
                  cx={(x1 + x2) / 2}
                  cy={(y1 + y2) / 2}
                  r="10"
                  fill="white"
                  stroke="#333"
                  strokeWidth="2"
                  className="cursor-pointer hover:fill-red-200"
                  onClick={() => deleteEdge(edge.id)}
                  style={{ pointerEvents: 'auto' }}
                />
              </g>
            );
          })}
        </svg>

        {nodes.map((node) => (
          <div
            key={node.id}
            draggable
            onDragEnd={(e) => {
              const rect = canvasRef.current?.getBoundingClientRect();
              if (rect) {
                const newX = e.clientX - rect.left - 75;
                const newY = e.clientY - rect.top - 40;
                const updated = { ...node, positionX: Math.max(0, newX), positionY: Math.max(0, newY) };
                setNodes(nodes.map((n) => (n.id === node.id ? updated : n)));
                fetch(`/api/projects/${id}/nodes/${node.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updated),
                });
              }
            }}
            onClick={() => setSelectedNode(node.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setEditingNode(node);
            }}
            className={`absolute w-32 bg-white border-2 rounded p-2 cursor-move transition select-none ${
              selectedNode === node.id ? 'border-blue-500 shadow-lg' : 'border-gray-300'
            }`}
            style={{ left: `${node.positionX}px`, top: `${node.positionY}px` }}
          >
            <div className="text-xs font-semibold mb-1 truncate">{node.name}</div>
            <div className="text-xs text-gray-500 mb-2">{node.type}</div>
            <div className="flex gap-1 mb-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConnecting(node.id);
                }}
                className="flex-1 px-1 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
              >
                Link
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNode(node.id);
                }}
                className="flex-1 px-1 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
              >
                Del
              </button>
            </div>
            {connecting === node.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConnecting(null);
                }}
                className="w-full px-1 py-1 text-xs bg-orange-500 text-white rounded"
              >
                Cancel
              </button>
            )}
            {connecting && connecting !== node.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  connectNodes(node.id);
                }}
                className="w-full px-1 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600"
              >
                Connect
              </button>
            )}
          </div>
        ))}
      </div>

      {editingNode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h2 className="text-lg font-bold mb-4">Edit Node</h2>
            <input
              type="text"
              value={editingNode.name}
              onChange={(e) => setEditingNode({ ...editingNode, name: e.target.value })}
              placeholder="Node Name"
              className="w-full px-3 py-2 border rounded mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              value={editingNode.description}
              onChange={(e) => setEditingNode({ ...editingNode, description: e.target.value })}
              placeholder="Description"
              className="w-full px-3 py-2 border rounded mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
            <select
              value={editingNode.type}
              onChange={(e) => setEditingNode({ ...editingNode, type: e.target.value })}
              className="w-full px-3 py-2 border rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {NODE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={updateNode} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold">
                Save
              </button>
              <button onClick={() => setEditingNode(null)} className="flex-1 px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
