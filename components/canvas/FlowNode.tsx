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
  const runLabel = isServer ? '▶ Ping' : '▶ Run';

  return (
    <div
      className={[
        'w-[180px] rounded-xl border-2 bg-white shadow-sm transition-shadow',
        selected ? 'shadow-lg' : 'hover:shadow-md',
      ].join(' ')}
      style={{ borderColor: selected ? meta.color : '#e2e8f0' }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-white"
        style={{ background: meta.color }}
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
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-white"
        style={{ background: meta.color }}
      />
    </div>
  );
}

export const FlowNode = memo(FlowNodeComponent);
