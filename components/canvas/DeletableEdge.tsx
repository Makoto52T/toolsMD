'use client';

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';

/** Color the whole edge highlights to while hovered. */
const HOVER_STROKE = 'var(--color-primary, #3b82f6)';

/**
 * Edge with an always-visible ✕ button rendered at its midpoint so users can
 * delete a connection with a single click — no need to select the edge first
 * and press Delete/Backspace (which is undiscoverable, especially on trackpads
 * and touch). The button calls `data.onDelete(id)`, wired up by the canvas.
 *
 * Hover state is driven by the canvas via `onEdgeMouseEnter/Leave` (React Flow
 * fires those on its own interaction overlay path, which sits above ours), and
 * handed back to us through `data.hovered`. When hovered we recolor the *whole*
 * stroke + add a glow. We resolve this inline (rather than via a
 * `.react-flow__edge:hover` CSS rule) because the canvas passes an inline
 * `stroke`/`strokeWidth`, which would win the CSS-specificity fight — only an
 * inline override beats an inline value.
 */
export type DeletableEdgeData = {
  onDelete?: (edgeId: string) => void;
  hovered?: boolean;
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
  const hovered = data?.hovered ?? false;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeStyle: React.CSSProperties = {
    ...style,
    transition: 'stroke 0.15s ease, stroke-width 0.15s ease, filter 0.15s ease',
    ...(hovered
      ? {
          stroke: HOVER_STROKE,
          strokeWidth: 3,
          filter: 'drop-shadow(0 0 5px rgba(59, 130, 246, 0.6))',
        }
      : null),
  };

  return (
    <>
      {/* interactionWidth renders React Flow's wide transparent hit-path, which
          makes the (thin) edge easy to hover/click and is what drives the
          onEdgeMouseEnter/Leave handlers wired up by the canvas. */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={edgeStyle}
        markerEnd={markerEnd}
        interactionWidth={24}
      />
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
