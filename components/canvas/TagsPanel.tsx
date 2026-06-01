'use client';

import { useState } from 'react';
import { Button } from '@/components/Button';

export interface Tag {
  id: string;
  key: string;
  value: string;
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
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setDraftKey('');
    setDraftValue('');
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
        { id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`, key, value: draftValue },
      ]);
    } else {
      onChange(tags.map((t) => (t.id === editingId ? { ...t, key, value: draftValue } : t)));
    }
    resetForm();
  };

  const remove = (id: string) => {
    onChange(tags.filter((t) => t.id !== id));
    if (editingId === id) resetForm();
  };

  // Closed state: a small tab pinned to the left edge.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open tags panel"
        data-testid="tags-tab"
        className="absolute left-0 top-1/2 z-20 -translate-y-1/2 rounded-r-lg border border-l-0 border-[var(--color-neutral-200)] bg-white px-2 py-3 text-lg shadow-md hover:bg-[var(--color-neutral-50)]"
      >
        🏷️
      </button>
    );
  }

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
        <button
          type="button"
          onClick={() => {
            resetForm();
            setOpen(false);
          }}
          aria-label="Close tags panel"
          data-testid="tags-close"
          className="rounded-lg p-1 text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-100)]"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="mb-2 text-xs text-[var(--color-neutral-400)]">
          Reusable key/value pairs. Reference them from HTTP nodes; edit here once and every node
          updates.
        </p>
        {tags.length === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--color-neutral-400)]">No tags yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {tags.map((t) => (
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

  // Mobile: full-screen overlay (User Rule #4 — modals over drag gestures).
  if (isMobile) {
    return (
      <div className="absolute inset-0 z-30 flex flex-col bg-white">{panelBody}</div>
    );
  }

  // Desktop: slide panel pinned to the left, overlaying the canvas.
  return (
    <div className="absolute left-0 top-0 z-30 flex h-full w-72 flex-col border-r border-[var(--color-neutral-200)] bg-white shadow-xl">
      {panelBody}
    </div>
  );
}
