'use client';

import React from 'react';

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

export interface ExecResult {
  nodeId: string;
  nodeName?: string;
  nodeType?: string;
  status: 'success' | 'error';
  output?: any;
  error?: string;
  http?: ExecHttpMeta;
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

function ResultCard({ result }: { result: ExecResult }) {
  const http = result.http;
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
          {http ? (
            <span className="text-xs text-[var(--color-neutral-500)]">{http.durationMs} ms</span>
          ) : null}
          <StatusBadge result={result} />
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
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
    </div>
  );
}

export function ExecutionResultPanel({ results }: { results: ExecResult[] }) {
  if (!results.length) {
    return <p className="text-sm text-[var(--color-neutral-500)]">No result.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {results.map((r, i) => (
        <ResultCard key={`${r.nodeId}-${i}`} result={r} />
      ))}
    </div>
  );
}
