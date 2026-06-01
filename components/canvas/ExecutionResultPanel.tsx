'use client';

import React, { useState } from 'react';
import { Button } from '@/components/Button';
import { flattenPaths, leafKey, valueToTagString } from '@/lib/path-utils';
import type { Tag } from './TagsPanel';

// Mirrors lib/node-executor.ts ExecutionResult (client-side copy).
export interface ExecHttpMeta {
  request: { method: string; url: string };
  statusCode?: number;
  statusText?: string;
  ok?: boolean;
  headers?: Record<string, string>;
  contentType?: string;
  bodyType?: 'json' | 'text';
  durationMs: number;
}

// Mirrors lib/node-executor.ts ServerMeta (health-check result).
export interface ExecServerMeta {
  reachable: boolean;
  url: string;
  statusCode?: number;
  durationMs: number;
}

// Mirrors lib/node-executor.ts MockMeta (internal mock-route call).
export interface ExecMockMeta {
  virtual: true;
  serverNodeId: string;
  serverNodeName?: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}

// Mirrors lib/node-executor.ts RealtimeMeta (internal mock realtime event).
export interface ExecRealtimeMeta {
  virtual: true;
  serverNodeId: string;
  serverNodeName?: string;
  transport: string;
  channel?: string;
  event: string;
  durationMs: number;
}

export interface ExecResult {
  nodeId: string;
  nodeName?: string;
  nodeType?: string;
  status: 'success' | 'error';
  output?: any;
  error?: string;
  http?: ExecHttpMeta;
  server?: ExecServerMeta;
  mock?: ExecMockMeta;
  realtime?: ExecRealtimeMeta;
}

export interface MissingBinding {
  nodeId: string;
  nodeName?: string;
  path: string;
  tagId: string;
  tagKey?: string;
}

// A binding the panel can show as already-configured for a node.
export interface NodeBinding {
  path: string;
  tagId: string;
  tagKey?: string;
}

export interface BindRequest {
  nodeId: string;
  path: string;
  // Either bind to an existing tag id, or create a new tag with this key.
  mode: 'existing' | 'new';
  tagId?: string;
  newKey?: string;
  // Resolved value at bind time (used to seed/update the tag immediately).
  value: string;
}

function StatusBadge({ result }: { result: ExecResult }) {
  const code = result.http?.statusCode;
  const ok = result.status === 'success';
  const bg = ok ? 'var(--color-success)' : 'var(--color-danger)';
  const label = code
    ? `${code} ${result.http?.statusText ?? ''}`.trim()
    : ok
      ? 'Success'
      : 'Error';
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
      style={{ background: bg }}
    >
      {label}
    </span>
  );
}

function formatBody(output: any): string {
  if (output == null) return '';
  if (typeof output === 'string') return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function previewValue(v: unknown): string {
  const s = valueToTagString(v);
  return s.length > 60 ? s.slice(0, 60) + '…' : s || '(empty)';
}

// ---- Bind popover: pick existing tag or create a new one for one field ----
function BindForm({
  field,
  tags,
  existingBinding,
  onSubmit,
  onCancel,
}: {
  field: { path: string; value: unknown };
  tags: Tag[];
  existingBinding?: NodeBinding;
  onSubmit: (req: Omit<BindRequest, 'nodeId'>) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<'existing' | 'new'>(
    existingBinding ? 'existing' : tags.length > 0 ? 'existing' : 'new',
  );
  const [tagId, setTagId] = useState<string>(existingBinding?.tagId ?? tags[0]?.id ?? '');
  const [newKey, setNewKey] = useState<string>(leafKey(field.path));
  const value = valueToTagString(field.value);

  return (
    <div
      data-testid="bind-form"
      className="mt-2 rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-3"
    >
      <p className="mb-2 text-xs font-semibold text-[var(--color-neutral-700)]">
        Bind <code className="font-mono">{field.path}</code> → tag
      </p>
      <div className="mb-2 flex gap-3 text-xs">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={mode === 'new'}
            onChange={() => setMode('new')}
          />
          New tag
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={mode === 'existing'}
            disabled={tags.length === 0}
            onChange={() => setMode('existing')}
          />
          Existing tag
        </label>
      </div>

      {mode === 'new' ? (
        <input
          type="text"
          value={newKey}
          data-testid="bind-new-key"
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="tag key"
          className="mb-2 w-full rounded-md border border-[var(--color-neutral-300)] px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
        />
      ) : (
        <select
          value={tagId}
          data-testid="bind-existing-tag"
          onChange={(e) => setTagId(e.target.value)}
          className="mb-2 w-full rounded-md border border-[var(--color-neutral-300)] px-2 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
        >
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.key}
            </option>
          ))}
        </select>
      )}

      <p className="mb-2 text-[11px] text-[var(--color-neutral-500)]">
        Auto-updates on every run. Current value:{' '}
        <span className="font-mono">{previewValue(field.value)}</span>
      </p>

      <div className="flex gap-2">
        <Button
          size="sm"
          data-testid="bind-confirm"
          className="flex-1"
          onClick={() =>
            onSubmit(
              mode === 'new'
                ? { path: field.path, mode: 'new', newKey: newKey.trim(), value }
                : { path: field.path, mode: 'existing', tagId, value },
            )
          }
        >
          Bind
        </Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function BindableFields({
  result,
  tags,
  bindings,
  onBind,
}: {
  result: ExecResult;
  tags: Tag[];
  bindings: NodeBinding[];
  onBind: (req: BindRequest) => void;
}) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const entries = flattenPaths(result.output).filter(
    (e) => e.type !== 'object' && e.type !== 'array',
  );
  if (entries.length === 0) return null;

  const bindingByPath = new Map(bindings.map((b) => [b.path, b]));
  const tagById = new Map(tags.map((t) => [t.id, t]));

  return (
    <details className="rounded-lg border border-[var(--color-neutral-200)]" open>
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-[var(--color-neutral-600)]">
        Bindable fields ({entries.length})
      </summary>
      <div className="flex flex-col gap-1 border-t border-[var(--color-neutral-200)] px-3 py-2">
        {entries.map((e) => {
          const bound = bindingByPath.get(e.path);
          const boundTag = bound ? tagById.get(bound.tagId) : undefined;
          return (
            <div key={e.path} data-testid="bindable-field">
              <div className="flex items-center justify-between gap-2 py-0.5">
                <div className="min-w-0">
                  <code className="block truncate font-mono text-xs text-[var(--color-neutral-800)]">
                    {e.path}
                  </code>
                  <span className="text-[10px] text-[var(--color-neutral-400)]">
                    {previewValue(e.value)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {bound ? (
                    <span
                      data-testid="field-bound"
                      className="rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success)]"
                    >
                      🔗 {boundTag?.key ?? bound.tagKey ?? 'tag'}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    data-testid="bind-btn"
                    onClick={() => setOpenPath(openPath === e.path ? null : e.path)}
                    className="rounded p-0.5 text-xs font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {bound ? 'rebind' : 'bind'}
                  </button>
                </div>
              </div>
              {openPath === e.path ? (
                <BindForm
                  field={e}
                  tags={tags}
                  existingBinding={bound}
                  onSubmit={(req) => {
                    onBind({ ...req, nodeId: result.nodeId });
                    setOpenPath(null);
                  }}
                  onCancel={() => setOpenPath(null)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function ResultCard({
  result,
  tags,
  bindings,
  onBind,
}: {
  result: ExecResult;
  tags: Tag[];
  bindings: NodeBinding[];
  onBind: (req: BindRequest) => void;
}) {
  const http = result.http;
  const server = result.server;
  const mock = result.mock;
  const realtime = result.realtime;
  const ok = result.status === 'success';
  return (
    <div className="rounded-xl border border-[var(--color-neutral-200)] bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-neutral-200)] px-4 py-2.5">
        <span className="font-semibold text-[var(--color-neutral-900)]">
          {result.nodeName ?? result.nodeId}
        </span>
        {result.nodeType ? (
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-neutral-400)]">
            {result.nodeType}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {mock ? (
            <span
              data-testid="mock-virtual-badge"
              className="inline-flex items-center rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]"
              title="Resolved from a mock server route — no real network request was made."
            >
              ⚡ virtual / mock
            </span>
          ) : null}
          {mock ? (
            <span className="text-xs text-[var(--color-neutral-500)]">{mock.durationMs} ms</span>
          ) : null}
          {realtime ? (
            <span
              data-testid="realtime-virtual-badge"
              className="inline-flex items-center rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]"
              title="Resolved from a mock realtime event — no real socket was opened."
            >
              📡 virtual / {realtime.transport || 'realtime'}
            </span>
          ) : null}
          {realtime ? (
            <span className="text-xs text-[var(--color-neutral-500)]">{realtime.durationMs} ms</span>
          ) : null}
          {http ? (
            <span className="text-xs text-[var(--color-neutral-500)]">{http.durationMs} ms</span>
          ) : null}
          {server ? (
            <span className="text-xs text-[var(--color-neutral-500)]">{server.durationMs} ms</span>
          ) : null}
          {server ? (
            <span
              data-testid="server-reachable-badge"
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
              style={{
                background: server.reachable
                  ? 'var(--color-success)'
                  : 'var(--color-danger)',
              }}
            >
              {server.reachable ? '● Reachable' : '○ Unreachable'}
            </span>
          ) : (
            <StatusBadge result={result} />
          )}
        </div>
      </div>

      {/* Server health-check detail (distinct from an http response body) */}
      {server ? (
        <div className="flex flex-col gap-1 px-4 py-3" data-testid="server-result">
          <div className="truncate text-xs text-[var(--color-neutral-500)]">
            <span className="font-mono font-semibold text-[var(--color-neutral-700)]">GET</span>{' '}
            <span className="font-mono">{server.url}</span>
          </div>
          <div className="text-sm">
            {server.reachable ? (
              <span className="text-[var(--color-success)]">
                Server responded
                {server.statusCode != null ? ` (HTTP ${server.statusCode})` : ''} in{' '}
                {server.durationMs} ms
              </span>
            ) : (
              <span className="text-[var(--color-danger)]">
                No response — port closed, host unreachable, or timed out ({server.durationMs} ms)
              </span>
            )}
          </div>
        </div>
      ) : null}

      {server ? null : (
      <div className="flex flex-col gap-3 px-4 py-3">
        {/* Mock route line — served in-process by a server node, no network. */}
        {mock ? (
          <div className="truncate text-xs text-[var(--color-neutral-500)]" data-testid="mock-request-line">
            <span className="font-mono font-semibold text-[var(--color-primary)]">
              {mock.method}
            </span>{' '}
            <span className="font-mono">{mock.path}</span>{' '}
            <span className="text-[var(--color-neutral-400)]">
              → mock {mock.serverNodeName ?? 'server'} (HTTP {mock.statusCode})
            </span>
          </div>
        ) : null}

        {/* Realtime line — mock event emitted in-process, no socket. */}
        {realtime ? (
          <div className="truncate text-xs text-[var(--color-neutral-500)]" data-testid="realtime-emit-line">
            <span className="font-mono font-semibold text-[var(--color-primary)]">
              📡 {realtime.event}
            </span>{' '}
            {realtime.channel ? (
              <span className="font-mono">@ {realtime.channel}</span>
            ) : null}{' '}
            <span className="text-[var(--color-neutral-400)]">
              → {realtime.transport || 'realtime'} on {realtime.serverNodeName ?? 'server'} (mock)
            </span>
          </div>
        ) : null}

        {/* Request line for http nodes */}
        {http?.request ? (
          <div className="truncate text-xs text-[var(--color-neutral-500)]">
            <span className="font-mono font-semibold text-[var(--color-neutral-700)]">
              {http.request.method}
            </span>{' '}
            <span className="font-mono">{http.request.url}</span>
          </div>
        ) : null}

        {/* Error */}
        {!ok && result.error ? (
          <div className="rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-sm font-medium text-[var(--color-danger)]">
            {result.error}
          </div>
        ) : null}

        {/* Bindable fields — only meaningful for a successful response */}
        {ok && result.output !== undefined ? (
          <BindableFields
            result={result}
            tags={tags}
            bindings={bindings}
            onBind={onBind}
          />
        ) : null}

        {/* Body */}
        {result.output !== undefined ? (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-neutral-400)]">
              {http?.bodyType === 'text' ? 'Response (text)' : 'Response'}
            </div>
            <pre className="max-h-[40vh] overflow-auto rounded-lg bg-[var(--color-neutral-900)] p-3 text-xs leading-relaxed text-[var(--color-neutral-100)]">
              {formatBody(result.output)}
            </pre>
          </div>
        ) : null}

        {/* Headers (collapsible) */}
        {http?.headers && Object.keys(http.headers).length > 0 ? (
          <details className="rounded-lg border border-[var(--color-neutral-200)]">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-[var(--color-neutral-600)]">
              Response headers ({Object.keys(http.headers).length})
            </summary>
            <div className="border-t border-[var(--color-neutral-200)] px-3 py-2">
              <table className="w-full text-left text-xs">
                <tbody>
                  {Object.entries(http.headers).map(([k, v]) => (
                    <tr key={k} className="align-top">
                      <td className="pr-3 py-0.5 font-mono font-medium text-[var(--color-neutral-700)]">
                        {k}
                      </td>
                      <td className="py-0.5 font-mono text-[var(--color-neutral-500)] break-all">
                        {v}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </div>
      )}
    </div>
  );
}

// Alert shown when configured bindings no longer resolve in the new response.
// The user decides per-binding: drop it, or keep the previous tag value.
function MissingBindingAlert({
  missing,
  onResolve,
}: {
  missing: MissingBinding[];
  onResolve: (m: MissingBinding, action: 'drop' | 'keep') => void;
}) {
  if (missing.length === 0) return null;
  return (
    <div
      data-testid="missing-alert"
      className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning)]/10 px-4 py-3"
    >
      <p className="mb-2 text-sm font-semibold text-[var(--color-warning)]">
        ⚠️ {missing.length} bound field{missing.length > 1 ? 's' : ''} missing in this response
      </p>
      <div className="flex flex-col gap-2">
        {missing.map((m, i) => (
          <div
            key={`${m.nodeId}-${m.path}-${i}`}
            data-testid="missing-row"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs"
          >
            <span className="min-w-0">
              <code className="font-mono">{m.path}</code>{' '}
              <span className="text-[var(--color-neutral-400)]">
                ({m.nodeName ?? m.nodeId} → {m.tagKey ?? m.tagId})
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                data-testid="missing-drop"
                onClick={() => onResolve(m, 'drop')}
                className="rounded px-2 py-0.5 font-medium text-[var(--color-danger)] hover:underline"
              >
                Remove binding
              </button>
              <button
                type="button"
                data-testid="missing-keep"
                onClick={() => onResolve(m, 'keep')}
                className="rounded px-2 py-0.5 font-medium text-[var(--color-neutral-600)] hover:underline"
              >
                Keep old value
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExecutionResultPanel({
  results,
  tags = [],
  bindingsByNode = {},
  missingBindings = [],
  onBind,
  onResolveMissing,
}: {
  results: ExecResult[];
  tags?: Tag[];
  // nodeId -> configured bindings (from node.config.outputBindings)
  bindingsByNode?: Record<string, NodeBinding[]>;
  missingBindings?: MissingBinding[];
  onBind?: (req: BindRequest) => void;
  onResolveMissing?: (m: MissingBinding, action: 'drop' | 'keep') => void;
}) {
  if (!results.length) {
    return <p className="text-sm text-[var(--color-neutral-500)]">No result.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {onResolveMissing ? (
        <MissingBindingAlert missing={missingBindings} onResolve={onResolveMissing} />
      ) : null}
      {results.map((r, i) => (
        <ResultCard
          key={`${r.nodeId}-${i}`}
          result={r}
          tags={tags}
          bindings={bindingsByNode[r.nodeId] ?? []}
          onBind={onBind ?? (() => {})}
        />
      ))}
    </div>
  );
}
