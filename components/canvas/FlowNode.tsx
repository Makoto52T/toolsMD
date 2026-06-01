'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { nodeDisplayMeta } from './nodeMeta';

export interface FlowNodeData {
  name: string;
  type: string;
  description?: string;
  // Node config — used by server nodes to pick icon/colour + show framework/port.
  config?: Record<string, any>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onExecute: (id: string) => void;
  executing?: boolean;
}

function FlowNodeComponent({ id, data, selected }: NodeProps<FlowNodeData>) {
  const meta = nodeDisplayMeta(data.type, data.config);
  const isServer = data.type === 'server';
  const cfg = data.config ?? {};
  const framework: string = isServer ? String(cfg.framework ?? '') : '';
  const port = isServer && cfg.port != null && cfg.port !== '' ? String(cfg.port) : '';
  const routeCount =
    isServer && Array.isArray(cfg.routes) ? cfg.routes.length : 0;
  // A function/http node firing a mock route shows a small "mock" hint.
  const isInternalCall =
    (data.type === 'function' || data.type === 'http-request') &&
    cfg.callMode === 'internal';
  const runLabel = isServer ? '▶ Ping' : '▶ Run';

  // Four connection handles (top/bottom/left/right). With ConnectionMode.Loose
  // on the canvas, every handle works as BOTH source and target — the edge's
  // direction is decided by drag order (first dragged out = source, released =
  // target), not by the handle's `type`. We still declare type="source" so a
  // freshly dropped node can initiate a drag from any side.
  const handleStyle = { background: meta.color };
  const handleClass = '!h-3 !w-3 !border-2 !border-white';

  return (
    <div
      className={[
        'w-[180px] rounded-xl border-2 bg-white shadow-md transition-shadow',
        selected ? 'shadow-xl' : 'hover:shadow-lg',
      ].join(' ')}
      style={{ borderColor: selected ? meta.color : '#cbd5e1' }}
    >
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        className={handleClass}
        style={handleStyle}
      />
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        className={handleClass}
        style={handleStyle}
      />

      <div
        className="flex items-center gap-2 rounded-t-[10px] px-3 py-2"
        style={{ background: `${meta.color}15` }}
      >
        <span className="text-lg leading-none">{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--color-neutral-900)]">
            {data.name}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-neutral-400)]">
            {meta.label}
          </div>
        </div>
      </div>

      {isServer && (framework || port) ? (
        <div className="flex flex-wrap items-center gap-1 px-3 pt-2">
          {framework ? (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white"
              style={{ background: meta.color }}
            >
              {framework}
            </span>
          ) : null}
          {port ? (
            <span className="rounded-md bg-[var(--color-neutral-100)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--color-neutral-600)]">
              :{port}
            </span>
          ) : null}
          {routeCount > 0 ? (
            <span
              data-testid="route-count-badge"
              className="rounded-md bg-[var(--color-neutral-800)] px-1.5 py-0.5 text-[10px] font-medium text-white"
            >
              {routeCount} route{routeCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      ) : null}

      {isInternalCall ? (
        <div className="px-3 pt-2">
          <span
            data-testid="mock-call-badge"
            className="rounded-md bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]"
          >
            ⚡ mock: {String(cfg.targetMethod ?? 'GET')} {String(cfg.targetPath ?? '/')}
          </span>
        </div>
      ) : null}

      {data.description ? (
        <div className="px-3 pt-1.5 text-xs text-[var(--color-neutral-500)] line-clamp-2">
          {data.description}
        </div>
      ) : null}

      <div className="flex gap-1 px-2 py-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onExecute(id);
          }}
          disabled={data.executing}
          title={isServer ? 'Health-check this server' : 'Execute this node'}
          className="nodrag flex-1 rounded-md py-1 text-xs font-medium text-white transition-colors disabled:opacity-60"
          style={{ background: meta.color }}
        >
          {data.executing ? '…' : runLabel}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onEdit(id);
          }}
          className="nodrag flex-1 rounded-md bg-[var(--color-neutral-100)] py-1 text-xs font-medium text-[var(--color-neutral-700)] transition-colors hover:bg-[var(--color-neutral-200)]"
        >
          Edit
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onDelete(id);
          }}
          className="nodrag flex-1 rounded-md bg-[var(--color-danger)]/10 py-1 text-xs font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/20"
        >
          Delete
        </button>
      </div>

      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className={handleClass}
        style={handleStyle}
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className={handleClass}
        style={handleStyle}
      />
    </div>
  );
}

export const FlowNode = memo(FlowNodeComponent);
