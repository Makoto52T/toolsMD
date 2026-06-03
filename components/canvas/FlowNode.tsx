'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { nodeDisplayMeta } from './nodeMeta';

export interface FlowNodeData {
  name: string;
  type: string;
  description?: string;
  // Node config — used by server nodes to pick icon/colour + show framework/port.
  config?: Record<string, any>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onExecute: (id: string) => void;
  // Loop mode: when looping, the Run button becomes Stop and a badge shows the
  // current round out of the total (i/rounds). onStopLoop flags the client-side
  // for-loop to break at its next boundary.
  onStopLoop?: (id: string) => void;
  executing?: boolean;
  // True while this node is freshly created and not yet settled — drives a
  // vermilion pulse/glow border so the user can spot what they just added.
  isNew?: boolean;
  looping?: boolean;
  loopRound?: number;
  loopTotal?: number;
  // Live workflow-run status (set while "Run Flow" streams over SSE). Drives the
  // corner status icon + border tint + a mini output preview after done.
  //   'pending' -> queued, not yet reached
  //   'running' -> currently executing (spinner + pulse border)
  //   'done'    -> succeeded (green check + output snippet)
  //   'error'   -> failed (red border + error text)
  //   'skipped' -> upstream failed, never ran (grey, dimmed)
  runStatus?: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  // Short, already-stringified output/error preview for done/error states.
  runPreview?: string;
}

function FlowNodeComponent({ id, data, selected }: NodeProps<FlowNodeData>) {
  const meta = nodeDisplayMeta(data.type, data.config);
  const isServer = data.type === 'server';
  const isEnv = data.type === 'env';
  const cfg = data.config ?? {};
  // Env node: target (frontend/backend/both) + the variable list.
  const envTarget: string = isEnv
    ? cfg.envTarget === 'frontend' || cfg.envTarget === 'backend'
      ? cfg.envTarget
      : 'both'
    : '';
  const envVars: Array<{ key: string; value: string; secret?: boolean }> =
    isEnv && Array.isArray(cfg.vars) ? cfg.vars : [];
  const framework: string = isServer ? String(cfg.framework ?? '') : '';
  const port = isServer && cfg.port != null && cfg.port !== '' ? String(cfg.port) : '';
  const routeCount =
    isServer && Array.isArray(cfg.routes) ? cfg.routes.length : 0;
  const eventCount =
    isServer && Array.isArray(cfg.realtime?.events) ? cfg.realtime.events.length : 0;
  // A function/http node firing a mock route shows a small "mock" hint.
  const isInternalCall =
    (data.type === 'function' || data.type === 'http-request') &&
    cfg.callMode === 'internal';
  const isRealtimeCall = isInternalCall && cfg.targetKind === 'realtime';
  const runLabel = isServer ? '▶ Ping' : '▶ Run';
  const loopEnabled = cfg.loopEnabled === true;
  const looping = data.looping === true;
  // Human-readable delay between rounds (≥1000ms shown as seconds), if any.
  const loopDelayMs = Math.min(60000, Math.max(0, Math.floor(Number(cfg.loopDelayMs) || 0)));
  const loopDelayLabel =
    loopDelayMs <= 0
      ? ''
      : loopDelayMs >= 1000
        ? `${(loopDelayMs / 1000).toFixed(loopDelayMs % 1000 === 0 ? 0 : 1)}s`
        : `${loopDelayMs}ms`;
  const isNew = data.isNew === true;
  // Vermilion used for the freshly-created pulse border.
  const NEW_COLOR = '#cf3a1e';

  // ---- Workflow-run status (driven by the SSE "Run Flow" stream) ----
  const runStatus = data.runStatus;
  const isRunning = runStatus === 'running';
  const isDone = runStatus === 'done';
  const isError = runStatus === 'error';
  const isSkipped = runStatus === 'skipped';
  // Border colour for the active run takes precedence over the rest-state tint
  // (but never over the freshly-created vermilion pulse, handled below).
  const RUN_GREEN = '#16a34a';
  const RUN_RED = '#dc2626';
  const RUN_BLUE = '#2563eb';
  const runBorderColor = isRunning
    ? RUN_BLUE
    : isDone
      ? RUN_GREEN
      : isError
        ? RUN_RED
        : null;

  // Four connection handles (top/bottom/left/right). With ConnectionMode.Loose
  // on the canvas, every handle works as BOTH source and target — the edge's
  // direction is decided by drag order (first dragged out = source, released =
  // target), not by the handle's `type`. We still declare type="source" so a
  // freshly dropped node can initiate a drag from any side.
  const handleStyle = { background: meta.color };
  const handleClass = '!h-3 !w-3 !border-2 !border-white';

  return (
    <div
      data-testid={isNew ? 'flow-node-new' : 'flow-node'}
      data-run-status={runStatus ?? undefined}
      className={[
        'relative w-[186px] overflow-hidden rounded-xl border bg-white transition-all duration-150',
        isNew ? 'tmd-node-new' : '',
        isRunning ? 'tmd-node-running' : '',
        isSkipped ? 'opacity-50' : '',
        selected
          ? 'shadow-[0_8px_24px_-6px_rgb(17_20_24/0.22)]'
          : 'shadow-[0_1px_2px_0_rgb(17_20_24/0.06),0_4px_10px_-4px_rgb(17_20_24/0.10)] hover:shadow-[0_6px_18px_-6px_rgb(17_20_24/0.18)]',
      ].join(' ')}
      style={{
        // Precedence: freshly-created vermilion pulse > active-run colour >
        // selected full colour > rest-state type tint (~38% opacity).
        borderColor: isNew
          ? NEW_COLOR
          : runBorderColor
            ? runBorderColor
            : selected
              ? meta.color
              : `${meta.color}61`,
        borderWidth: isNew || selected || runBorderColor ? 2 : 1,
      }}
    >
      {isNew ? (
        <style>{`
          @keyframes tmdNewPulse {
            0%   { box-shadow: 0 0 0 0 rgba(207,58,30,0.55), 0 0 0 1px rgba(207,58,30,0.9); }
            70%  { box-shadow: 0 0 0 8px rgba(207,58,30,0), 0 0 0 1px rgba(207,58,30,0.9); }
            100% { box-shadow: 0 0 0 0 rgba(207,58,30,0), 0 0 0 1px rgba(207,58,30,0.9); }
          }
          .tmd-node-new { animation: tmdNewPulse 1.4s ease-out infinite; }
        `}</style>
      ) : null}
      {isRunning ? (
        <style>{`
          @keyframes tmdRunPulse {
            0%   { box-shadow: 0 0 0 0 rgba(37,99,235,0.50); }
            70%  { box-shadow: 0 0 0 7px rgba(37,99,235,0); }
            100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
          }
          .tmd-node-running { animation: tmdRunPulse 1.1s ease-out infinite; }
        `}</style>
      ) : null}

      {/* Run-status corner badge (top-right). Spinner while running, check on
          done, cross on error, dash when skipped. */}
      {runStatus && runStatus !== 'pending' ? (
        <div
          data-testid="run-status-icon"
          data-status={runStatus}
          className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm"
          style={{
            background: isRunning
              ? RUN_BLUE
              : isDone
                ? RUN_GREEN
                : isError
                  ? RUN_RED
                  : '#94a3b8',
          }}
          title={
            isRunning ? 'Running…' : isDone ? 'Done' : isError ? 'Error' : 'Skipped'
          }
        >
          {isRunning ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : isDone ? (
            '✓'
          ) : isError ? (
            '✕'
          ) : (
            '–'
          )}
        </div>
      ) : null}
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        className={handleClass}
        style={handleStyle}
      />
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        className={handleClass}
        style={handleStyle}
      />

      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ background: `${meta.color}14`, borderBottom: `1px solid ${meta.color}26` }}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm leading-none"
          style={{ background: `${meta.color}24` }}
        >
          {meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight text-[var(--color-neutral-900)]">
            {data.name}
          </div>
          <div
            className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: meta.color }}
          >
            {meta.label}
          </div>
        </div>
      </div>

      {isServer && (framework || port || routeCount > 0 || eventCount > 0) ? (
        <div className="flex flex-wrap items-center gap-1 px-3 pt-2">
          {framework ? (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white"
              style={{ background: meta.color }}
            >
              {framework}
            </span>
          ) : null}
          {port ? (
            <span className="rounded-md bg-[var(--color-neutral-100)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--color-neutral-600)]">
              :{port}
            </span>
          ) : null}
          {routeCount > 0 ? (
            <span
              data-testid="route-count-badge"
              className="rounded-md bg-[var(--color-neutral-800)] px-1.5 py-0.5 text-[10px] font-medium text-white"
            >
              {routeCount} route{routeCount === 1 ? '' : 's'}
            </span>
          ) : null}
          {eventCount > 0 ? (
            <span
              data-testid="event-count-badge"
              className="rounded-md bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-medium text-white"
            >
              📡 {eventCount} event{eventCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      ) : null}

      {isEnv ? (
        <div className="px-3 pt-2">
          <div className="mb-1 flex items-center gap-1">
            <span
              data-testid="env-target-badge"
              className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
              style={{ background: meta.color }}
            >
              {envTarget === 'both'
                ? 'Frontend + Backend'
                : envTarget === 'frontend'
                  ? 'Frontend'
                  : 'Backend'}
            </span>
            <span className="rounded-md bg-[var(--color-neutral-100)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-neutral-600)]">
              {envVars.length} variable{envVars.length === 1 ? '' : 's'}
            </span>
          </div>
          {envVars.length > 0 ? (
            <div
              data-testid="env-var-list"
              className="rounded-md bg-[var(--color-neutral-900)] px-2 py-1.5 font-mono text-[9px] leading-relaxed text-[var(--color-neutral-100)]"
            >
              {envVars.slice(0, 5).map((v, i) => (
                <div key={i} className="truncate">
                  <span className="text-[var(--color-info)]">{v.key || '—'}</span>
                  <span className="text-[var(--color-neutral-500)]">=</span>
                  <span className="text-[var(--color-neutral-300)]">
                    {v.secret ? '••••••' : v.value || ''}
                  </span>
                </div>
              ))}
              {envVars.length > 5 ? (
                <div className="text-[var(--color-neutral-500)]">
                  +{envVars.length - 5} more…
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {isInternalCall ? (
        <div className="px-3 pt-2">
          <span
            data-testid="mock-call-badge"
            className="rounded-md bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]"
          >
            {isRealtimeCall
              ? `📡 mock: ${String(cfg.targetEventName ?? cfg.targetEventId ?? 'event')}`
              : `⚡ mock: ${String(cfg.targetMethod ?? 'GET')} ${String(cfg.targetPath ?? '/')}`}
          </span>
        </div>
      ) : null}

      {loopEnabled ? (
        <div className="px-3 pt-2">
          {looping ? (
            <span
              data-testid="loop-status-badge"
              className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-white"
            >
              <span className="animate-spin">🔁</span>
              loop ({data.loopRound ?? 0}/{data.loopTotal ?? 0})
              {loopDelayLabel ? <span className="opacity-80">• {loopDelayLabel}</span> : null}
            </span>
          ) : (
            <span
              data-testid="loop-enabled-badge"
              className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]"
            >
              🔁 loop mode
            </span>
          )}
        </div>
      ) : null}

      {/* Mini output preview after a workflow run (done/error). A short snippet
          of the node's output (or error message) so the user sees what each
          node produced without opening the output panel. */}
      {(isDone || isError) && data.runPreview ? (
        <div className="px-3 pt-2">
          <div
            data-testid="run-output-preview"
            className={[
              'truncate rounded-md px-2 py-1 font-mono text-[10px] leading-relaxed',
              isError
                ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
                : 'bg-[var(--color-neutral-900)] text-[var(--color-neutral-100)]',
            ].join(' ')}
            title={data.runPreview}
          >
            {data.runPreview}
          </div>
        </div>
      ) : null}

      {data.description ? (
        <div className="px-3 pt-1.5 text-xs text-[var(--color-neutral-500)] line-clamp-2">
          {data.description}
        </div>
      ) : null}

      <div className="flex gap-1 px-2 pb-2 pt-2">
        {looping ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onStopLoop?.(id);
            }}
            title="Stop the loop"
            data-testid="loop-stop-btn"
            className="nodrag flex-1 rounded-md bg-[var(--color-danger)] py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            ⏹ Stop
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onExecute(id);
            }}
            disabled={data.executing}
            title={isServer ? 'Health-check this server' : 'Execute this node'}
            className="nodrag flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: meta.color }}
          >
            {data.executing ? '…' : runLabel}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onEdit(id);
          }}
          className="nodrag rounded-md bg-[var(--color-neutral-100)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-neutral-700)] transition-colors hover:bg-[var(--color-neutral-200)]"
        >
          Edit
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onDelete(id);
          }}
          aria-label="Delete node"
          className="nodrag rounded-md bg-[var(--color-danger)]/10 px-2 py-1.5 text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/20"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4h8v2m-9 0v14a1 1 0 001 1h8a1 1 0 001-1V6" />
          </svg>
        </button>
      </div>

      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className={handleClass}
        style={handleStyle}
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className={handleClass}
        style={handleStyle}
      />
    </div>
  );
}

export const FlowNode = memo(FlowNodeComponent);
