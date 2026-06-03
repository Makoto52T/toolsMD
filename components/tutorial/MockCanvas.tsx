'use client';

import { useEffect, useRef, useState } from 'react';
import { nodeDisplayMeta } from '@/components/canvas/nodeMeta';
import type { Scene, MockNode, MockEdge } from './types';

// Simplified, fully-controllable canvas for the tutorial. Coordinates are
// percentages (0..100) of the canvas box so the demo scales responsively.
// Position/opacity changes between scenes are tweened by CSS transitions;
// transient effects (edge draw, click ripple, typed text) key off the step
// index via the `stepKey` prop so they replay each time a step activates.

const NODE_W = 168; // px — card width (used for edge anchor math via ref box)

function NodeCard({ node, anim }: { node: MockNode; anim: boolean }) {
  const meta = nodeDisplayMeta(node.type, node.config);
  const visible = node.visible !== false;
  return (
    <div
      className="absolute"
      style={{
        left: `${node.x}%`,
        top: `${node.y}%`,
        transform: `translate(-50%, -50%) scale(${visible ? 1 : 0.7})`,
        opacity: visible ? 1 : 0,
        transition: anim
          ? 'left 0.55s var(--ease-out-quint), top 0.55s var(--ease-out-quint), opacity 0.4s ease, transform 0.45s var(--ease-out-quint)'
          : 'none',
        width: NODE_W,
        zIndex: node.glow || node.selected ? 5 : 2,
      }}
    >
      <div
        className="rounded-xl border bg-white px-3 py-2.5 shadow-sm"
        style={{
          borderColor: node.selected ? 'var(--color-primary)' : 'var(--color-neutral-200)',
          borderWidth: node.selected ? 2 : 1,
          boxShadow: node.glow
            ? '0 0 0 0 rgba(207,58,30,0.5)'
            : node.selected
              ? '0 4px 14px rgba(207,58,30,0.18)'
              : '0 1px 3px rgba(17,20,24,0.08)',
          animation: node.glow ? 'tut-node-glow 1.5s ease-out infinite' : undefined,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm"
            style={{ background: `${meta.color}1a`, color: meta.color }}
          >
            {meta.icon}
          </span>
          <span className="truncate text-[13px] font-semibold text-[var(--color-neutral-800)]">
            {node.label ?? meta.label}
          </span>
        </div>
        {node.subtitle && (
          <div className="mt-1.5 truncate rounded bg-[var(--color-neutral-100)] px-1.5 py-1 font-mono text-[10px] text-[var(--color-neutral-600)]">
            {node.subtitle}
          </div>
        )}
        {node.badge && (
          <div
            className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: 'rgba(207,58,30,0.1)', color: 'var(--color-primary)' }}
          >
            <span className="tut-badge-pop">{node.badge}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Map a node's percentage centre to pixel coordinates inside the canvas box.
function centerPx(node: MockNode, box: { w: number; h: number }) {
  return { x: (node.x / 100) * box.w, y: (node.y / 100) * box.h };
}

function Edges({
  edges,
  nodes,
  box,
  stepKey,
}: {
  edges: MockEdge[];
  nodes: MockNode[];
  box: { w: number; h: number };
  stepKey: number;
}) {
  const byId = (id: string) => nodes.find((n) => n.id === id);
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 1 }}>
      <defs>
        <marker
          id="tut-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="var(--color-neutral-400)" />
        </marker>
      </defs>
      {edges.map((e) => {
        const a = byId(e.from);
        const b = byId(e.to);
        if (!a || !b || a.visible === false || b.visible === false) return null;
        const p1 = centerPx(a, box);
        const p2 = centerPx(b, box);
        // Offset endpoints toward card edges (~half card width / height).
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (dx / len) * 84;
        const oy = (dy / len) * 34;
        const x1 = p1.x + ox;
        const y1 = p1.y + oy;
        const x2 = p2.x - ox;
        const y2 = p2.y - oy;
        const mx = (x1 + x2) / 2;
        const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
        return (
          <g key={e.id}>
            <path
              d={d}
              fill="none"
              stroke="var(--color-neutral-400)"
              strokeWidth={2}
              markerEnd="url(#tut-arrow)"
              className={e.draw ? 'tut-edge-draw' : undefined}
              key={`${e.id}-${stepKey}`}
            />
            {e.label && (
              <g>
                <rect
                  x={mx - e.label.length * 3.4 - 6}
                  y={(y1 + y2) / 2 - 9}
                  width={e.label.length * 6.8 + 12}
                  height={18}
                  rx={9}
                  fill="white"
                  stroke="var(--color-neutral-200)"
                />
                <text
                  x={mx}
                  y={(y1 + y2) / 2 + 3}
                  textAnchor="middle"
                  className="fill-[var(--color-neutral-600)]"
                  style={{ font: '600 10px ui-sans-serif, system-ui' }}
                >
                  {e.label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Cursor({ x, y, click, stepKey }: { x: number; y: number; click?: boolean; stepKey: number }) {
  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transition: 'left 0.7s var(--ease-out-quint), top 0.7s var(--ease-out-quint)',
      }}
    >
      {click && <span key={stepKey} className="tut-click-ripple" />}
      <svg width="22" height="22" viewBox="0 0 24 24" className="drop-shadow-md" style={{ transform: 'translate(-2px,-2px)' }}>
        <path
          d="M4 2 L4 18 L8.5 13.5 L11.5 20 L14 19 L11 12.5 L17 12.5 Z"
          fill="white"
          stroke="var(--color-neutral-900)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// Char-by-char typing for sheet fields.
function TypedValue({ value, typing, stepKey }: { value: string; typing?: boolean; stepKey: number }) {
  const [n, setN] = useState(typing ? 0 : value.length);
  useEffect(() => {
    if (!typing) {
      setN(value.length);
      return;
    }
    setN(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= value.length) clearInterval(id);
    }, 38);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, value, typing]);
  return (
    <span>
      {value.slice(0, n)}
      {typing && n < value.length && <span className="tut-caret">|</span>}
    </span>
  );
}

function Sheet({ scene, stepKey }: { scene: Scene; stepKey: number }) {
  const sheet = scene.sheet;
  if (!sheet) return null;
  const fromBottom = sheet.from === 'bottom';
  return (
    <div
      key={stepKey}
      className={`absolute z-10 overflow-hidden rounded-xl border border-[var(--color-neutral-200)] bg-white shadow-xl ${
        fromBottom ? 'tut-sheet-bottom inset-x-3 bottom-3' : 'tut-sheet-right right-3 top-3 bottom-3 w-[58%] max-w-[330px]'
      }`}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] px-3 py-2">
        <span className="text-[12px] font-semibold text-[var(--color-neutral-800)]">{sheet.title}</span>
        <span className="text-[var(--color-neutral-400)]">✕</span>
      </div>
      {sheet.tabs && (
        <div className="flex gap-1 border-b border-[var(--color-neutral-100)] px-2 py-1.5">
          {sheet.tabs.map((t) => (
            <span
              key={t}
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                t === sheet.activeTab
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-neutral-500)]'
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="space-y-2 p-3">
        {sheet.fields?.map((f, i) => (
          <div key={i}>
            <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-neutral-400)]">
              {f.label}
            </div>
            <div
              className="rounded-md border px-2 py-1.5 font-mono text-[11px] text-[var(--color-neutral-700)]"
              style={{
                borderColor: f.highlight ? 'var(--color-primary)' : 'var(--color-neutral-200)',
                boxShadow: f.highlight ? '0 0 0 3px rgba(207,58,30,0.12)' : undefined,
                background: 'var(--color-neutral-50)',
              }}
            >
              {f.secret ? (
                '•'.repeat(Math.max(6, Math.min(f.value.length, 14)))
              ) : (
                <TypedValue value={f.value} typing={f.typing} stepKey={stepKey} />
              )}
            </div>
          </div>
        ))}
        {sheet.code && (
          <pre className="overflow-x-auto rounded-md bg-[var(--color-neutral-900)] p-2.5 font-mono text-[10.5px] leading-relaxed text-[var(--color-neutral-100)]">
            <code>{sheet.code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

function OutputPanel({ scene, stepKey }: { scene: Scene; stepKey: number }) {
  const out = scene.output;
  if (!out) return null;
  const ok = !out.error && (out.status ?? 200) < 400;
  return (
    <div
      key={stepKey}
      className="absolute right-3 top-3 bottom-3 z-10 w-[52%] max-w-[300px] overflow-hidden rounded-xl border border-[var(--color-neutral-200)] bg-white shadow-xl tut-sheet-right"
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] px-3 py-2">
        <span className="text-[12px] font-semibold text-[var(--color-neutral-800)]">📤 Output</span>
        {out.status != null && (
          <span
            className="tut-badge-pop ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{
              background: ok ? 'rgba(16,185,129,0.12)' : 'rgba(207,58,30,0.12)',
              color: ok ? '#059669' : 'var(--color-primary)',
            }}
          >
            {out.status} {out.statusText ?? (ok ? 'OK' : 'ERR')}
          </span>
        )}
      </div>
      {out.ms != null && (
        <div className="border-b border-[var(--color-neutral-100)] px-3 py-1.5 text-[10px] text-[var(--color-neutral-400)]">
          ⏱ {out.ms} ms
        </div>
      )}
      {out.body && (
        <pre className="overflow-auto p-3 font-mono text-[10.5px] leading-relaxed text-[var(--color-neutral-700)]">
          <code>{out.body}</code>
        </pre>
      )}
    </div>
  );
}

export default function MockCanvas({ scene, stepKey }: { scene: Scene; stepKey: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 560, h: 340 });
  // First paint should not tween node entrances; subsequent steps should.
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBox({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    const t = setTimeout(() => setAnimate(true), 60);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="relative h-full w-full overflow-hidden rounded-2xl border border-[var(--color-neutral-200)]"
      style={{
        background:
          'var(--color-neutral-50) radial-gradient(circle at 1px 1px, rgba(17,20,24,0.05) 1px, transparent 0)',
        backgroundSize: '20px 20px',
      }}
    >
      {scene.hint && (
        <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full bg-[var(--color-neutral-900)] px-3 py-1 text-[11px] font-medium text-white shadow-lg tut-badge-pop" key={`hint-${stepKey}`}>
          {scene.hint}
        </div>
      )}
      {scene.edges && scene.edges.length > 0 && (
        <Edges edges={scene.edges} nodes={scene.nodes} box={box} stepKey={stepKey} />
      )}
      {scene.nodes.map((n) => (
        <NodeCard key={n.id} node={n} anim={animate} />
      ))}
      {scene.marquee && (
        <div
          className="absolute z-[3] rounded border-2 border-dashed border-[var(--color-primary)] bg-[rgba(207,58,30,0.06)]"
          style={{
            left: `${scene.marquee.x}%`,
            top: `${scene.marquee.y}%`,
            width: `${scene.marquee.w}%`,
            height: `${scene.marquee.h}%`,
            transition: 'all 0.5s var(--ease-out-quint)',
          }}
        />
      )}
      <Sheet scene={scene} stepKey={stepKey} />
      <OutputPanel scene={scene} stepKey={stepKey} />
      {scene.cursor && scene.cursor.visible !== false && (
        <Cursor
          x={scene.cursor.x}
          y={scene.cursor.y}
          click={scene.cursor.click}
          stepKey={stepKey}
        />
      )}
    </div>
  );
}
