import React from 'react';

type Tone = 'dark' | 'light';

/**
 * Geometric brand mark — three wired nodes (two inputs converging on one
 * accent output). The product in one glyph; replaces the old 🗂️ emoji.
 * `tone` adapts the node fills to a dark shell or a light page.
 */
export function BrandMark({
  size = 32,
  tone = 'light',
  className = '',
}: {
  size?: number;
  tone?: Tone;
  className?: string;
}) {
  const wire = tone === 'dark' ? '#3d424c' : '#c2c4c9';
  const nodeFill = tone === 'dark' ? '#21252d' : '#ffffff';
  const nodeStroke = tone === 'dark' ? '#5f636c' : '#8c9099';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M9 9 L23 16 M9 23 L23 16"
        stroke={wire}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="9" cy="9" r="3.5" fill={nodeFill} stroke={nodeStroke} strokeWidth="1.5" />
      <circle cx="9" cy="23" r="3.5" fill={nodeFill} stroke={nodeStroke} strokeWidth="1.5" />
      <circle cx="23" cy="16" r="4" fill="#cf3a1e" stroke="#ff5a36" strokeWidth="1.5" />
    </svg>
  );
}

/** Wordmark lockup: mark + "toolsMD". `href` makes it a link target by caller. */
export function Wordmark({
  tone = 'light',
  className = '',
}: {
  tone?: Tone;
  className?: string;
}) {
  const ink = tone === 'dark' ? 'var(--color-ink-text)' : 'var(--color-neutral-900)';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg border"
        style={{
          borderColor: tone === 'dark' ? 'var(--color-ink-border)' : 'var(--color-neutral-200)',
          background: tone === 'dark' ? 'var(--color-ink-surface)' : '#fff',
        }}
      >
        <BrandMark size={20} tone={tone} />
      </span>
      <span className="text-[1.0625rem] font-bold tracking-tight" style={{ color: ink }}>
        tools<span className="text-[var(--color-primary)]">MD</span>
      </span>
    </span>
  );
}
