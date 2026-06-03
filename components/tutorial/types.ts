// Shared types for the animated tutorial. The tutorial is *not* React Flow — it
// renders a simplified, fully-controllable "mock canvas" so each chapter can
// drive an exact step-by-step animation.
//
// Animation model: every step of a chapter resolves to a complete `Scene`
// (the full desired state of the canvas at that step). The MockCanvas renders a
// scene and CSS transitions tween node positions / opacity / glow between
// consecutive scenes. Transient effects (typing, flashes, draws) are expressed
// as per-element flags on the scene so they replay when a step becomes active.

import type { NodeTypeName } from '@/components/canvas/nodeMeta';

export type DemoNodeType =
  | NodeTypeName
  | 'function'
  | 'http-request'
  | 'puppeteer'
  | 'server'
  | 'env'
  | 'sub-project';

/** A single node card on the mock canvas. */
export interface MockNode {
  id: string;
  type: DemoNodeType;
  /** Override label (else derived from node meta). */
  label?: string;
  /** Sub-title line under the label (e.g. a method+URL, a stack). */
  subtitle?: string;
  /** Grid-ish coordinates in the mock canvas (0..100 of the canvas box). */
  x: number;
  y: number;
  /** 0 = hidden (not yet placed), 1 = visible. Drives fade+scale in/out. */
  visible?: boolean;
  /** Pulsing vermilion "new node" glow (mirrors the real canvas). */
  glow?: boolean;
  /** Selected ring (multi-select demo). */
  selected?: boolean;
  /** Running badge text, e.g. "running…" or "🔁 loop (3/10)". */
  badge?: string;
  /** Per-server config so the card can show a stack icon/colour. */
  config?: Record<string, unknown>;
}

/** A directed edge between two mock nodes. */
export interface MockEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  /** When true the edge path animates its draw-on at this step. */
  draw?: boolean;
}

/** The mock cursor (a pointer that glides to elements and clicks). */
export interface MockCursor {
  x: number;
  y: number;
  /** Trigger a click ripple at this position on this step. */
  click?: boolean;
  visible?: boolean;
}

/** A faux config field shown in an overlay sheet (e.g. URL input typing). */
export interface MockField {
  label: string;
  /** Final value; if `typing` the value types in char-by-char. */
  value: string;
  typing?: boolean;
  /** Mask the value as bullets (secret env / token). */
  secret?: boolean;
  /** Highlight pulse around the field. */
  highlight?: boolean;
}

/** An overlay editor sheet floating over the canvas (HTTP editor, env table…). */
export interface MockSheet {
  title: string;
  /** Optional tab row shown at the top of the sheet. */
  tabs?: string[];
  activeTab?: string;
  fields?: MockField[];
  /** Free-form code block (Function node body). */
  code?: string;
  /** Slide direction. */
  from?: 'right' | 'bottom';
}

/** The right-hand output panel (n8n-style result). */
export interface MockOutput {
  status?: number;
  statusText?: string;
  ms?: number;
  body?: string;
  /** Slide the panel in on this step. */
  slideIn?: boolean;
  error?: boolean;
}

/** Full canvas state at one step. */
export interface Scene {
  nodes: MockNode[];
  edges?: MockEdge[];
  cursor?: MockCursor;
  sheet?: MockSheet | null;
  output?: MockOutput | null;
  /** Optional dotted selection rectangle (multi-select drag). */
  marquee?: { x: number; y: number; w: number; h: number } | null;
  /** Pan/zoom hint badge text shown briefly (Canvas Basics chapter). */
  hint?: string | null;
}

/** One narrated step of a chapter. */
export interface ChapterStep {
  /** Short caption shown under the player. */
  label: string;
  /** Longer explanation (markdown-ish plain text) shown beside the demo. */
  detail?: string;
  /** The complete scene for this step. */
  scene: Scene;
}

export interface Chapter {
  id: string;
  num: number;
  icon: string;
  title: string;
  /** One-line summary in the sidebar. */
  blurb: string;
  steps: ChapterStep[];
}
