'use client';

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';

/**
 * Edge with an always-visible ✕ button rendered at its midpoint so users can
 * delete a connection with a single click — no need to select the edge first
 * and press Delete/Backspace (which is undiscoverable, especially on trackpads
 * and touch). The button calls `data.onDelete(id)`, wired up by the canvas.
 */
export type DeletableEdgeData = {
  onDelete?: (edgeId: string) => void;
};

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style,
  markerEnd,
  data,
}: EdgeProps<DeletableEdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute flex items-center gap-1"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
        >
          {label ? (
            <span className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-neutral-600)] shadow-sm">
              {label}
            </span>
          ) : null}
          <button
            type="button"
            title="Delete connection"
            aria-label="Delete connection"
            onClick={(e) => {
              e.stopPropagation();
              data?.onDelete?.(id);
            }}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-danger)] bg-white text-[11px] font-bold leading-none text-[var(--color-danger)] shadow-sm transition hover:bg-[var(--color-danger)] hover:text-white"
          >
            ✕
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
