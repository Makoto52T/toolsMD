'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

export interface WikiNodeData {
  label: string;
  type: string;
  size: number;
  connections: number;
  color: string;
  dimmed: boolean;
  selected: boolean;
}

// A wiki page rendered as a card. Border/accent color encodes the page type;
// font size scales mildly with the node's connection count so hubs read bigger.
function WikiGraphNodeImpl({ data }: NodeProps<WikiNodeData>) {
  const bigHub = data.connections >= 6;
  return (
    <div
      className="rounded-xl border-2 bg-white px-3 py-2 shadow-sm transition-all"
      style={{
        borderColor: data.color,
        opacity: data.dimmed ? 0.25 : 1,
        boxShadow: data.selected
          ? `0 0 0 3px ${data.color}55, 0 4px 14px rgba(0,0,0,0.12)`
          : undefined,
        minWidth: bigHub ? 180 : 140,
      }}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-[var(--color-neutral-300)]" />
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: data.color }}
        />
        <span
          className="truncate font-semibold text-[var(--color-neutral-900)]"
          style={{ fontSize: bigHub ? 15 : 13 }}
          title={data.label}
        >
          {data.label}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: `${data.color}22`, color: data.color }}
        >
          {data.type}
        </span>
        <span className="text-[10px] text-[var(--color-neutral-400)]">
          {data.connections} link{data.connections === 1 ? '' : 's'}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-[var(--color-neutral-300)]" />
    </div>
  );
}

export const WikiGraphNode = memo(WikiGraphNodeImpl);
