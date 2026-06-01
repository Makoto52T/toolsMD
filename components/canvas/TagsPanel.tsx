'use client';

import { useState } from 'react';
import { Button } from '@/components/Button';
import { detectTagType, TAG_TYPES, type TagType } from '@/lib/path-utils';

export interface Tag {
  id: string;
  key: string;
  value: string;
  type: TagType;
}

// Visual treatment per tag type: icon + colour + label. Used by the badge and
// the type selector chips so the two stay in sync.
export const TAG_TYPE_META: Record<TagType, { icon: string; label: string; cls: string }> = {
  domain: { icon: '🌐', label: 'domain', cls: 'bg-blue-100 text-blue-700' },
  pathname: { icon: '📁', label: 'pathname', cls: 'bg-green-100 text-green-700' },
  param: { icon: '🔑', label: 'param', cls: 'bg-orange-100 text-orange-700' },
  body: { icon: '📦', label: 'body', cls: 'bg-purple-100 text-purple-700' },
  generic: { icon: '🏷️', label: 'generic', cls: 'bg-neutral-100 text-neutral-600' },
};

function TypeBadge({ type }: { type: TagType }) {
  const m = TAG_TYPE_META[type] ?? TAG_TYPE_META.generic;
  return (
    <span
      data-testid={`tag-type-badge-${type}`}
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${m.cls}`}
      title={`Type: ${m.label}`}
    >
      {m.icon} {m.label}
    </span>
  );
}

// A masked value cell with a per-row show/hide toggle. DB stores plaintext and
// the API returns plaintext; masking is purely a screen-level affordance so the
// secret isn't shoulder-surfed.
function MaskedValue({ value }: { value: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="flex min-w-0 items-center gap-1">
      <code className="truncate font-mono text-xs text-[var(--color-neutral-700)]">
        {show ? value || '(empty)' : '••••••••'}
      </code>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide value' : 'Show value'}
        className="shrink-0 rounded p-0.5 text-[var(--color-neutral-400)] hover:text-[var(--color-neutral-700)]"
      >
        {show ? '🙈' : '👁️'}
      </button>
    </span>
  );
}

export function TagsPanel({
  tags,
  isMobile,
  onChange,
  autoInfo = {},
}: {
  tags: Tag[];
  isMobile: boolean;
  onChange: (tags: Tag[]) => void;
  // tagId -> list of "{node}·{path}" sources that auto-write this tag.
  autoInfo?: Record<string, string[]>;
}) {
  // Mobile only: the panel is a collapsible overlay (narrow screens can't fit a
  // pinned column). On desktop the panel is always pinned — there is no toggle.
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');
  // null = "auto" (use detected type); a TagType = manual override.
  const [draftType, setDraftType] = useState<TagType | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Filter box: matches against key, value, or type (case-insensitive).
  const [filter, setFilter] = useState('');

  const detectedType = detectTagType(draftValue);
  const effectiveType: TagType = draftType ?? detectedType;

  const resetForm = () => {
    setEditingId(null);
    setDraftKey('');
    setDraftValue('');
    setDraftType(null);
    setError(null);
  };

  const startAdd = () => {
    resetForm();
    setEditingId('__new__');
  };

  const startEdit = (t: Tag) => {
    setEditingId(t.id);
    setDraftKey(t.key);
    setDraftValue(t.value);
    // Editing an existing tag: start in override mode pinned to its stored type
    // (so re-saving without touching the value preserves an explicit choice).
    setDraftType(t.type ?? null);
    setError(null);
  };

  const commit = () => {
    const key = draftKey.trim();
    if (!key) {
      setError('Key is required');
      return;
    }
    const dup = tags.some((t) => t.key === key && t.id !== editingId);
    if (dup) {
      setError(`Key "${key}" already exists`);
      return;
    }
    if (editingId === '__new__') {
      onChange([
        ...tags,
        {
          id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          key,
          value: draftValue,
          type: effectiveType,
        },
      ]);
    } else {
      onChange(
        tags.map((t) =>
          t.id === editingId ? { ...t, key, value: draftValue, type: effectiveType } : t,
        ),
      );
    }
    resetForm();
  };

  const remove = (id: string) => {
    onChange(tags.filter((t) => t.id !== id));
    if (editingId === id) resetForm();
  };

  // Filtered view: match the query against key, value, or type label.
  const q = filter.trim().toLowerCase();
  const visibleTags = q
    ? tags.filter((t) => {
        const typeLabel = (TAG_TYPE_META[t.type ?? 'generic'] ?? TAG_TYPE_META.generic).label;
        return (
          t.key.toLowerCase().includes(q) ||
          t.value.toLowerCase().includes(q) ||
          typeLabel.toLowerCase().includes(q)
        );
      })
    : tags;

  const form =
    editingId !== null ? (
      <div className="mt-2 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-3">
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="key (e.g. apiKey)"
            value={draftKey}
            data-testid="tag-key-input"
            onChange={(e) => setDraftKey(e.target.value)}
            className="w-full rounded-md border border-[var(--color-neutral-300)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
          <input
            type="text"
            placeholder="value"
            value={draftValue}
            data-testid="tag-value-input"
            onChange={(e) => setDraftValue(e.target.value)}
            className="w-full rounded-md border border-[var(--color-neutral-300)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
          {/* Type selector: ● auto [detected: x] + override chips. */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-neutral-400)]">
              Type
            </span>
            <div className="flex flex-wrap gap-1" data-testid="tag-type-selector">
              <button
                type="button"
                data-testid="tag-type-auto"
                onClick={() => setDraftType(null)}
                className={`rounded-full border px-2 py-0.5 text-[10px] ${
                  draftType === null
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'border-[var(--color-neutral-300)] bg-white text-[var(--color-neutral-600)]'
                }`}
                title="Auto-detect type from the value"
              >
                ● auto{draftType === null ? ` [${detectedType}]` : ''}
              </button>
              {TAG_TYPES.map((tt) => {
                const m = TAG_TYPE_META[tt];
                return (
                  <button
                    key={tt}
                    type="button"
                    data-testid={`tag-type-chip-${tt}`}
                    onClick={() => setDraftType(tt)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${
                      draftType === tt
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                        : 'border-[var(--color-neutral-300)] bg-white text-[var(--color-neutral-600)]'
                    }`}
                  >
                    {m.icon} {m.label}
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={commit} data-testid="tag-save" className="flex-1">
              {editingId === '__new__' ? 'Add' : 'Save'}
            </Button>
            <Button size="sm" variant="secondary" onClick={resetForm} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </div>
    ) : (
      <Button size="sm" variant="secondary" onClick={startAdd} data-testid="tag-add" className="mt-2 w-full">
        + Add Tag
      </Button>
    );

  const panelBody = (
    <>
      <div className="flex items-center justify-between border-b border-[var(--color-neutral-200)] px-4 py-3">
        <h2 className="text-sm font-bold text-[var(--color-neutral-900)]">🏷️ Tags</h2>
        {/* Close button exists only on mobile (overlay). Desktop is pinned. */}
        {isMobile ? (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setMobileOpen(false);
            }}
            aria-label="Close tags panel"
            data-testid="tags-close"
            className="rounded-lg p-1 text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-100)]"
          >
            ✕
          </button>
        ) : null}
      </div>
      {/* Filter box — gates the list below by key / value / type. */}
      <div className="border-b border-[var(--color-neutral-200)] px-4 py-2.5">
        <div className="relative">
          <input
            type="text"
            value={filter}
            data-testid="tag-filter"
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tags…"
            className="w-full rounded-md border border-[var(--color-neutral-300)] py-1.5 pl-7 pr-7 text-xs focus:border-[var(--color-primary)] focus:outline-none"
          />
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--color-neutral-400)]">
            🔍
          </span>
          {filter ? (
            <button
              type="button"
              onClick={() => setFilter('')}
              aria-label="Clear filter"
              data-testid="tag-filter-clear"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-xs text-[var(--color-neutral-400)] hover:text-[var(--color-neutral-700)]"
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="mb-2 text-xs text-[var(--color-neutral-400)]">
          Reusable key/value pairs. Reference them from HTTP nodes; edit here once and every node
          updates.
        </p>
        {tags.length === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--color-neutral-400)]">No tags yet.</p>
        ) : visibleTags.length === 0 ? (
          <p
            data-testid="tag-filter-empty"
            className="py-4 text-center text-xs text-[var(--color-neutral-400)]"
          >
            No tags match “{filter}”.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {visibleTags.map((t) => (
              <div
                key={t.id}
                data-testid="tag-row"
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-neutral-200)] px-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-[var(--color-neutral-900)]">
                      {t.key}
                    </span>
                    <TypeBadge type={t.type ?? 'generic'} />
                    {(() => {
                      const sources = autoInfo[t.id];
                      if (!sources || sources.length === 0) return null;
                      const multi = sources.length > 1;
                      return (
                        <span
                          data-testid="tag-auto-badge"
                          title={`Auto-written by ${sources.join(', ')}`}
                          className="shrink-0 rounded-full bg-[var(--color-success)]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-success)]"
                        >
                          🔗 auto{multi ? ' ⚠' : ''}
                        </span>
                      );
                    })()}
                  </span>
                  {autoInfo[t.id]?.length ? (
                    <span className="truncate text-[9px] text-[var(--color-neutral-400)]">
                      from {autoInfo[t.id].join(', ')}
                    </span>
                  ) : null}
                  <MaskedValue value={t.value} />
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    aria-label={`Edit ${t.key}`}
                    className="rounded p-1 text-xs text-[var(--color-primary)] hover:underline"
                  >
                    edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    aria-label={`Delete ${t.key}`}
                    className="rounded p-1 text-xs text-[var(--color-danger)] hover:underline"
                  >
                    del
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {form}
      </div>
    </>
  );

  // Mobile: collapsible full-screen overlay (User Rule #4). A launcher tab on
  // the left edge opens it; closed by default to keep the canvas usable.
  if (isMobile) {
    if (!mobileOpen) {
      return (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open tags panel"
          data-testid="tags-tab"
          className="absolute left-0 top-1/2 z-20 -translate-y-1/2 rounded-r-lg border border-l-0 border-[var(--color-neutral-200)] bg-white px-2 py-3 text-lg shadow-md hover:bg-[var(--color-neutral-50)]"
        >
          🏷️
        </button>
      );
    }
    return (
      <div className="absolute inset-0 z-30 flex flex-col bg-white">{panelBody}</div>
    );
  }

  // Desktop: pinned left column, always visible (no toggle). Rendered in-flow as
  // a flex child of the 3-panel layout.
  return (
    <div
      data-testid="tags-panel"
      className="flex h-full w-72 shrink-0 flex-col border-r border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)]"
    >
      {panelBody}
    </div>
  );
}
