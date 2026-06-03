import { Node as PlannerNode, Edge, Tag } from './store';
import {
  getByPath,
  valueToTagString,
  interpolateTags,
  interpolateDeep,
  buildUrlFromParts,
  detectTagType,
  type TagType,
} from './path-utils';

// A single response→tag binding stored in node.config.outputBindings.
//   path  : dot/bracket path into the node's output (e.g. "data.access_token")
//   tagId : id of the project tag to overwrite with the resolved value
//   tagKey: (optional) key to use if the tag doesn't exist yet (auto-create)
export interface OutputBinding {
  path: string;
  tagId: string;
  tagKey?: string;
}

// Reported back to the UI when a configured binding path no longer resolves in
// a fresh response — the user decides whether to drop the binding or keep the
// old value (we never silently delete or silently keep).
export interface MissingBinding {
  nodeId: string;
  nodeName?: string;
  path: string;
  tagId: string;
  tagKey?: string;
}

export interface HttpMeta {
  // Request that was actually sent (after tag merging) — useful for the UI.
  request: { method: string; url: string };
  // Response metadata (absent on network-level failures).
  statusCode?: number;
  statusText?: string;
  ok?: boolean;
  headers?: Record<string, string>;
  contentType?: string;
  // How the body was parsed: 'json' when JSON.parse succeeded, else 'text'.
  bodyType?: 'json' | 'text';
  durationMs: number;
}

// Present for server nodes — the health-check (port ping) result. A server is
// "reachable" if the HTTP probe got any response (even a non-2xx), since that
// proves the port is open and serving. Network failures => reachable:false.
export interface ServerMeta {
  reachable: boolean;
  url: string;
  statusCode?: number;
  durationMs: number;
}

// Present when a function/http node resolved against a *mock* server route
// (callMode === 'internal') instead of making a real network request. The
// response is served from the target server node's `routes` config — nothing
// leaves the process. `virtual: true` lets the UI flag "this didn't hit the
// network" so a mock isn't mistaken for a live server.
export interface MockMeta {
  virtual: true;
  // The server node that served the route.
  serverNodeId: string;
  serverNodeName?: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}

// A single mock route defined on a server node (node.config.routes[]).
export interface MockRoute {
  id?: string;
  method: string;
  path: string;
  statusCode?: number;
  response?: unknown;
}

// Present when a function/http node "subscribed" to a *mock* realtime event on
// a server node (targetKind === 'realtime'). Vercel can't hold a real socket,
// so the server node defines a channel/event + mock payload and the caller gets
// that payload back in-process — same idea as MockMeta but for realtime.
export interface RealtimeMeta {
  virtual: true;
  serverNodeId: string;
  serverNodeName?: string;
  transport: string;
  channel?: string;
  event: string;
  durationMs: number;
}

// A single mock realtime event defined on a server node
// (node.config.realtime.events[]).
export interface MockEvent {
  id?: string;
  channel?: string;
  event: string;
  payload?: unknown;
}

// Present when a loop node ran in *script* mode (config.loopScriptEnabled). The
// user-authored script drives its own loop with call()/send()/log(); we report
// back how many node calls it made, how many were fire-and-forget, the captured
// log lines, and the wall-clock so the UI can show "📜 script • N calls".
export interface ScriptMeta {
  // Total `await call(...)` invocations the script made (awaited node runs).
  calls: number;
  // Total `send(...)` fire-and-forget dispatches.
  sends: number;
  // Lines emitted via log(...) inside the script (chronological).
  logs: string[];
  durationMs: number;
}

export interface ExecutionResult {
  nodeId: string;
  nodeName?: string;
  nodeType?: string;
  status: 'success' | 'error';
  output?: any;
  error?: string;
  // Present for http-request nodes (both success and error) so the UI can show
  // status code / headers / timing the way n8n does.
  http?: HttpMeta;
  // Present for server nodes (health-check result).
  server?: ServerMeta;
  // Present when the node resolved against a mock server route (no real network).
  mock?: MockMeta;
  // Present when the node subscribed to a mock realtime event (no real socket).
  realtime?: RealtimeMeta;
  // Present when this node ran a loop *script* (call/send/log driven loop).
  script?: ScriptMeta;
}

// Hard cap so a hung endpoint can't keep a serverless invocation alive forever.
const HTTP_TIMEOUT_MS = 20000;
// Ceiling for a per-node config.timeoutMs override. A slow proxy (e.g. a
// Puppeteer capture service) can opt into a longer wait, but never beyond this.
const HTTP_TIMEOUT_MAX_MS = 120000;
// Health-check probe timeout — short so an unreachable server fails fast and
// never blocks a chain run.
const HEALTH_TIMEOUT_MS = 5000;

// Build the health-check URL for a server node from its config. Scheme is https
// only for the conventional 443 port, http otherwise (local dev servers, etc.).
function buildServerUrl(cfg: Record<string, any>): string {
  const host = String(cfg.host ?? 'localhost').trim() || 'localhost';
  const rawPort = cfg.port;
  const port =
    rawPort != null && rawPort !== '' && !Number.isNaN(Number(rawPort))
      ? Number(rawPort)
      : undefined;
  let path = String(cfg.healthPath ?? '/').trim() || '/';
  if (!path.startsWith('/')) path = '/' + path;
  const scheme = port === 443 ? 'https' : 'http';
  const authority = port != null ? `${host}:${port}` : host;
  return `${scheme}://${authority}${path}`;
}

// Normalise a path for matching: strip a query string, collapse a trailing
// slash, ensure a leading slash. So "/users/", "/users" and "/users?x=1" all
// compare equal to the route the user defined as "/users".
function normalizePath(p: unknown): string {
  let s = String(p ?? '').trim();
  const q = s.indexOf('?');
  if (q !== -1) s = s.slice(0, q);
  if (!s.startsWith('/')) s = '/' + s;
  if (s.length > 1 && s.endsWith('/')) s = s.replace(/\/+$/, '');
  return s || '/';
}

// Context threaded through executeNode so a node can resolve an internal mock
// call: it needs the full node list (to find the server it points at) and the
// edges (to confirm the connection / find the default target).
export interface ExecContext {
  nodes: PlannerNode[];
  edges: Edge[];
}

// Pull the mock routes off a server node's config, defensively.
function routesOf(node: PlannerNode | undefined): MockRoute[] {
  const raw = node?.config?.routes;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is MockRoute =>
      r != null && typeof r === 'object' && typeof (r as any).path === 'string',
  );
}

// Pull the mock realtime events off a server node's config, defensively.
function eventsOf(node: PlannerNode | undefined): MockEvent[] {
  const raw = node?.config?.realtime?.events;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is MockEvent =>
      e != null && typeof e === 'object' && typeof (e as any).event === 'string',
  );
}

// Resolve which server node a function/http node should call. Preference order:
//   1. an explicit config.targetServerId (set by the UI when the user picks a
//      route), as long as it's a server node reachable by an edge.
//   2. the single server node at the end of an outgoing edge (the common case:
//      one edge function -> server).
// Returns undefined if the node isn't wired to any server node.
function resolveTargetServer(
  node: PlannerNode,
  ctx: ExecContext,
): PlannerNode | undefined {
  const byId = new Map(ctx.nodes.map((n) => [n.id, n]));
  const serverTargets = ctx.edges
    .filter((e) => e.sourceNodeId === node.id)
    .map((e) => byId.get(e.targetNodeId))
    .filter((n): n is PlannerNode => !!n && n.type === 'server');

  const explicitId = node.config?.targetServerId;
  if (typeof explicitId === 'string' && explicitId) {
    const hit = serverTargets.find((s) => s.id === explicitId);
    if (hit) return hit;
  }
  return serverTargets[0];
}

// Run a node's configured internal call against a mock server route. Returns an
// ExecutionResult (success with the interpolated response, or a friendly error
// if the route isn't defined). Never throws.
function executeInternalCall(
  node: PlannerNode,
  ctx: ExecContext,
  tags: Tag[],
): ExecutionResult {
  const started = Date.now();
  const server = resolveTargetServer(node, ctx);
  if (!server) {
    return {
      nodeId: node.id,
      status: 'error',
      error: 'Internal call: this node is not connected to a server node.',
    };
  }

  // ---- Realtime mock branch ----
  // The caller "subscribed" to one of the server's mock realtime events. We
  // can't hold a real socket on Vercel, so resolve the event's mock payload
  // in-process (interpolating {{tag}}) and return it — bindings/chain work just
  // like a REST mock.
  if (node.config?.targetKind === 'realtime') {
    const transport = String(server.config?.realtime?.transport ?? 'socketio');
    const events = eventsOf(server);
    const wantId = node.config?.targetEventId;
    const match =
      (typeof wantId === 'string' && wantId
        ? events.find((e) => e.id === wantId)
        : undefined) ?? undefined;
    if (!match) {
      return {
        nodeId: node.id,
        status: 'error',
        error: `Realtime event not defined on ${server.name}.`,
        realtime: {
          virtual: true,
          serverNodeId: server.id,
          serverNodeName: server.name,
          transport,
          event: String(node.config?.targetEventName ?? '(unknown)'),
          durationMs: Date.now() - started,
        },
      };
    }
    const channel =
      typeof match.channel === 'string' && match.channel
        ? interpolateTags(match.channel, tags).result
        : undefined;
    const output = interpolateDeep(match.payload ?? null, tags).value;
    return {
      nodeId: node.id,
      status: 'success',
      output,
      realtime: {
        virtual: true,
        serverNodeId: server.id,
        serverNodeName: server.name,
        transport,
        channel,
        event: match.event,
        durationMs: Date.now() - started,
      },
    };
  }

  const wantMethod = String(node.config?.targetMethod ?? 'GET').toUpperCase();
  const wantPath = normalizePath(node.config?.targetPath ?? '/');
  const routes = routesOf(server);
  const match = routes.find(
    (r) =>
      String(r.method ?? 'GET').toUpperCase() === wantMethod &&
      normalizePath(r.path) === wantPath,
  );

  if (!match) {
    return {
      nodeId: node.id,
      status: 'error',
      error: `Route not defined on ${server.name}: ${wantMethod} ${wantPath}`,
      mock: {
        virtual: true,
        serverNodeId: server.id,
        serverNodeName: server.name,
        method: wantMethod,
        path: wantPath,
        statusCode: 404,
        durationMs: Date.now() - started,
      },
    };
  }

  const statusCode =
    typeof match.statusCode === 'number' && match.statusCode > 0
      ? match.statusCode
      : 200;
  // Interpolate {{tag}} placeholders in the mock response (strings, nested or
  // top-level) so a mock can echo dynamic values from earlier steps.
  const output = interpolateDeep(match.response ?? null, tags).value;
  const mock: MockMeta = {
    virtual: true,
    serverNodeId: server.id,
    serverNodeName: server.name,
    method: wantMethod,
    path: normalizePath(match.path),
    statusCode,
    durationMs: Date.now() - started,
  };
  // A non-2xx mock status is reported as an error (mirrors http behaviour) but
  // still returns the body so bindings/inspection work.
  if (statusCode < 200 || statusCode >= 300) {
    return {
      nodeId: node.id,
      status: 'error',
      error: `HTTP ${statusCode} (mock)`,
      output,
      mock,
    };
  }
  return { nodeId: node.id, status: 'success', output, mock };
}

// Hard cap on node calls a single loop script may make, so a runaway
// `while(true) await call(...)` can't keep a serverless invocation alive
// forever. Independent of the loopRounds cap (that governs client loops).
const SCRIPT_MAX_CALLS = 5000;
// Hard wall-clock cap for a script loop (matches the client loop's 30-min cap).
const SCRIPT_MAX_MS = 1_800_000;

// Coerce an env var's stored string into a richer JS value FOR THE SCRIPT so a
// `USERS=["a","b"]` env var iterates as an array (`for (const u of env.USERS)`),
// `PORT=8080` is a number, `FLAG=true` a boolean, etc. We only parse values that
// unambiguously look like JSON (array/object/number/bool/null); anything else
// (a bare hostname, a token) stays a plain string. The env node's own output is
// untouched — this richer view is script-only.
function coerceEnvValue(raw: string): any {
  const s = raw.trim();
  if (s === '') return raw;
  const looksJson =
    /^[[{]/.test(s) || // array / object
    /^"(?:[^"\\]|\\.)*"$/.test(s) || // double-quoted JSON string literal -> unwrap
    /^-?\d+(\.\d+)?$/.test(s) || // number
    s === 'true' || s === 'false' || s === 'null';
  if (!looksJson) return raw;
  try {
    return JSON.parse(s);
  } catch {
    return raw; // malformed JSON-ish string — keep it verbatim
  }
}

// Build the `env` object the loop script sees: the resolved variables of every
// upstream env node that feeds (directly) into this loop node. Each env node is
// executed (so {{tag}} values resolve) and its { KEY: value } output is merged,
// with each value coerced (JSON arrays/objects/numbers/bools become real JS
// values so scripts can iterate them). Later env nodes win on key collisions.
async function resolveUpstreamEnv(
  node: PlannerNode,
  ctx: ExecContext,
  tags: Tag[],
): Promise<Record<string, any>> {
  const byId = new Map(ctx.nodes.map((n) => [n.id, n]));
  const upstreamIds = ctx.edges
    .filter((e) => e.targetNodeId === node.id)
    .map((e) => e.sourceNodeId);
  const env: Record<string, any> = {};
  for (const srcId of upstreamIds) {
    const src = byId.get(srcId);
    if (!src || src.type !== 'env') continue;
    const r = await executeNode(src, {}, tags, ctx);
    if (r.status === 'success' && r.output && typeof r.output === 'object') {
      for (const [k, v] of Object.entries(r.output as Record<string, any>)) {
        env[k] = typeof v === 'string' ? coerceEnvValue(v) : v;
      }
    }
  }
  return env;
}

// Find a node by its (case-insensitive, trimmed) name so the script can address
// nodes the way the user sees them on the canvas. Returns undefined if absent.
function findNodeByName(name: string, ctx: ExecContext): PlannerNode | undefined {
  const want = String(name ?? '').trim().toLowerCase();
  return ctx.nodes.find((n) => String(n.name ?? '').trim().toLowerCase() === want);
}

// Turn the params object a loop script passes to `call(name, params)` into a
// list of *temporary* tags, layered on top of the project tags so the target
// node's own template (URL / headers / body) interpolates them via {{key}}.
//
//   call('Login API', { username: 'alice', password: env.PASS })
//     -> temp tags [{ key:'username', value:'alice' }, { key:'password', ... }]
//        which replace {{username}} / {{password}} anywhere in the node config.
//
// The node keeps its OWN method/url/headers/body shape — params never override
// those; they only fill in the {{placeholders}} the node already declares. Temp
// tags take precedence over project tags of the same key (last wins, since
// interpolateTags resolves left-to-right and we append temp tags after).
// Decide whether a `call(name, params)` should auto-inject its params as the
// HTTP request body. This is the convenience path for the common case:
//
//   call('Login API', { username, password })   // node has NO body configured
//     -> POST with body {"username":..,"password":..}
//
// It ONLY fires when ALL of these hold, so it never overrides intent:
//   - the target is an http-request node
//   - its method is a body-bearing verb (POST / PUT / PATCH)
//   - the node has no body of its own:
//       * bodyMode 'none'                      -> explicitly no body  -> SKIP
//       * bodyMode 'raw'  with a non-empty body-> user wrote a body   -> SKIP
//       * bodyMode 'form' with >=1 row         -> user built a form   -> SKIP
//     i.e. only an absent/empty raw body (or no bodyMode at all) qualifies
//   - params is a non-empty plain object
//
// When it fires we return a SHALLOW-cloned node with config.bodyMode='raw' and
// config.body=params; the executor then JSON-stringifies it like any raw body.
// The clone is per-call and never persisted. When it doesn't fire we return the
// node untouched so the node's own template + temp-tag interpolation runs as
// before (priority 1: a node with a {{placeholder}} body keeps using it).
function maybeInjectParamsAsBody(
  target: PlannerNode,
  params: any,
): PlannerNode {
  if (target.type !== 'http-request') return target;
  const cfg = target.config ?? {};
  const method = String(cfg.method ?? 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return target;
  if (!params || typeof params !== 'object' || Array.isArray(params)) return target;
  if (Object.keys(params).length === 0) return target;

  // Does the node already declare a body? Mirror the executor's body-mode logic.
  const mode = cfg.bodyMode;
  if (mode === 'none') return target; // explicit opt-out
  if (mode === 'form') {
    const hasRow = Array.isArray(cfg.bodyForm) && cfg.bodyForm.length > 0;
    if (hasRow) return target;
  }
  // raw / undefined: only an empty/missing body qualifies for injection.
  const rawBody = cfg.body;
  const hasRawBody =
    rawBody != null &&
    !(typeof rawBody === 'string' && rawBody.trim() === '') &&
    !(typeof rawBody === 'object' && Object.keys(rawBody).length === 0);
  if (mode === 'raw' && hasRawBody) return target;
  if (mode == null && hasRawBody) return target;

  // Auto-inject: clone the node with the params as a raw JSON body.
  return { ...target, config: { ...cfg, bodyMode: 'raw', body: params } };
}

function paramsToTempTags(params: any): Tag[] {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return [];
  const out: Tag[] = [];
  for (const [key, value] of Object.entries(params)) {
    const k = String(key).trim();
    if (!k) continue;
    const v =
      value == null
        ? ''
        : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
    out.push({ id: `tmp_${k}`, key: k, value: v, type: detectTagType(v) });
  }
  return out;
}

// Execute a loop node's user-authored script (config.loopScript). The script is
// an async function body with the signature (env, inputs, tags, call, send,
// log) that drives its OWN loop and returns the value to pass downstream.
//
//   call(name, params?)     -> run node `name`, AWAIT it, return its output. The
//                              node keeps its own method/url/headers/body; the
//                              `params` object is injected as temp tags so the
//                              node's {{placeholders}} resolve to them
//                              (e.g. call('Login', { username, password }) fills
//                              {{username}} / {{password}}). Throws if that node
//                              errored so the script's try/catch can react.
//                              Counts toward SCRIPT_MAX_CALLS.
//   send(name, data)        -> fire-and-forget: kick node `name` off (data
//                              injected as config.scriptInput) WITHOUT awaiting
//                              the result; errors are swallowed.
//   log(msg)                -> capture a line into script meta (surfaced in UI).
//
// Returns { output: <script return value>, script: ScriptMeta }.
async function runLoopScript(
  node: PlannerNode,
  inputs: Record<string, any>,
  tags: Tag[],
  ctx: ExecContext,
): Promise<ExecutionResult> {
  const startedAt = Date.now();
  const code = String(node.config?.loopScript ?? '').trim();
  if (!code) {
    return { nodeId: node.id, status: 'error', error: 'Script mode is on but the loop script is empty.' };
  }

  const env = await resolveUpstreamEnv(node, ctx, tags);
  const logs: string[] = [];
  let calls = 0;
  let sends = 0;

  const guard = () => {
    if (calls >= SCRIPT_MAX_CALLS) {
      throw new Error(`Loop script exceeded ${SCRIPT_MAX_CALLS} node calls (runaway loop?).`);
    }
    if (Date.now() - startedAt >= SCRIPT_MAX_MS) {
      throw new Error('Loop script exceeded the 30-minute limit.');
    }
  };

  const call = async (name: string, params?: any): Promise<any> => {
    guard();
    const target = findNodeByName(name, ctx);
    if (!target) throw new Error(`call("${name}"): no node named "${name}" on this canvas.`);
    calls += 1;
    // `params` are wired into the target two complementary ways:
    //   1. as temp tags, so the node's own {{placeholders}} (url / headers /
    //      body template) resolve to them — temp tags are appended AFTER the
    //      project tags so they win on key collisions (last-write-wins).
    //   2. if the target is an http POST/PUT/PATCH with NO body of its own,
    //      the params object is auto-injected as a raw JSON body so the bare
    //      `call('Login API', { username, password })` just works without the
    //      user having to hand-write a {{username}} body template. A node that
    //      already declares a body (template, form, or explicit 'none') is left
    //      untouched — path 1 still fills its placeholders.
    const callTags = [...tags, ...paramsToTempTags(params)];
    const effectiveTarget = maybeInjectParamsAsBody(target, params);
    const r = await executeNode(effectiveTarget, inputs, callTags, ctx);
    if (r.status !== 'success') {
      throw new Error(`call("${name}") failed: ${r.error ?? 'unknown error'}`);
    }
    return r.output;
  };

  const send = async (name: string, data?: any): Promise<void> => {
    const target = findNodeByName(name, ctx);
    if (!target) {
      logs.push(`send("${name}"): no such node — skipped`);
      return;
    }
    sends += 1;
    // Inject the payload as config.scriptInput so the target can read it, and
    // also expose it on inputs for function nodes.
    const merged: PlannerNode = {
      ...target,
      config: { ...(target.config ?? {}), scriptInput: data },
    };
    // Fire-and-forget: kick it off but don't await the result; swallow errors
    // so a downstream hiccup never breaks the loop's return.
    void executeNode(merged, { ...inputs, scriptInput: data }, tags, ctx).catch(() => {});
  };

  const log = (msg: unknown): void => {
    logs.push(typeof msg === 'string' ? msg : JSON.stringify(msg));
  };

  try {
    // Async function body. We wrap in an AsyncFunction so the user can `await`.
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as
      new (...args: string[]) => (...a: any[]) => Promise<any>;
    const fn = new AsyncFunction('env', 'inputs', 'tags', 'call', 'send', 'log', code);
    const output = await fn(env, inputs, tags, call, send, log);
    return {
      nodeId: node.id,
      status: 'success',
      output,
      script: { calls, sends, logs, durationMs: Date.now() - startedAt },
    };
  } catch (e: any) {
    return {
      nodeId: node.id,
      status: 'error',
      error: e?.message ? String(e.message) : 'Loop script threw an error.',
      script: { calls, sends, logs, durationMs: Date.now() - startedAt },
    };
  }
}

// Resolve an array of tag ids (referenced by an http node config) into
// concrete key/value pairs using the project-level tag list. Unknown ids are
// silently skipped (a tag may have been deleted after the node referenced it).
function resolveTags(tagIds: unknown, tags: Tag[]): Tag[] {
  if (!Array.isArray(tagIds)) return [];
  const byId = new Map(tags.map((t) => [t.id, t]));
  const out: Tag[] = [];
  for (const id of tagIds) {
    const t = byId.get(id as string);
    if (t) out.push(t);
  }
  return out;
}

/**
 * Pure: apply a node's output bindings against its output, producing the next
 * tag array (last-write-wins) plus any bindings whose path did NOT resolve.
 *
 * - path resolves   -> tag.value is overwritten with the coerced string. If the
 *   referenced tag id doesn't exist yet, a new tag is created (auto-update).
 * - path is missing  -> the binding is reported in `missing` and the existing
 *   tag value is left untouched (decision deferred to the user).
 *
 * Never mutates the input `tags` array.
 */
export function applyOutputBindings(
  output: unknown,
  bindings: OutputBinding[] | undefined,
  tags: Tag[],
  nodeId: string,
  nodeName?: string,
): { tags: Tag[]; missing: MissingBinding[] } {
  if (!Array.isArray(bindings) || bindings.length === 0) {
    return { tags, missing: [] };
  }
  const next = tags.map((t) => ({ ...t }));
  const byId = new Map(next.map((t) => [t.id, t]));
  const byKey = new Map(next.map((t) => [t.key, t]));
  const missing: MissingBinding[] = [];

  for (const b of bindings) {
    if (!b || typeof b.path !== 'string' || typeof b.tagId !== 'string') continue;
    const resolved = getByPath(output, b.path);
    if (resolved === undefined) {
      missing.push({ nodeId, nodeName, path: b.path, tagId: b.tagId, tagKey: b.tagKey });
      continue;
    }
    const value = valueToTagString(resolved);
    // Match by id first (fast path). If the tag was deleted and re-created its
    // id changes, so fall back to matching by key — the binding still points at
    // the user's logical tag and must not silently create a stale duplicate.
    const existing = byId.get(b.tagId) ?? (b.tagKey ? byKey.get(b.tagKey) : undefined);
    if (existing) {
      existing.value = value; // last-write-wins
    } else {
      // Tag referenced by id but not present (e.g. bound before tag persisted)
      // — auto-create it so the binding still takes effect.
      const created: Tag = {
        id: b.tagId,
        key: b.tagKey || b.path,
        value,
        type: detectTagType(value),
      };
      next.push(created);
      byId.set(created.id, created);
      byKey.set(created.key, created);
    }
  }
  return { tags: next, missing };
}

export async function executeNode(
  node: PlannerNode,
  inputs: Record<string, any>,
  tags: Tag[] = [],
  ctx?: ExecContext,
): Promise<ExecutionResult> {
  try {
    // Script mode: the user opted into a self-driven script on this node
    // (config.scriptEnabled + loopScript). Available on ANY node type and
    // independent of loop mode:
    //   - loop OFF -> the script runs ONCE (server-side) with full context.
    //   - loop ON  -> the script still runs once here and drives its own
    //                 iteration via await call(...) / send(...).
    // It supersedes the node's normal type-specific behaviour for THIS execution.
    // `loopScriptEnabled` is the legacy flag (script was once nested under loop).
    // Needs ctx to resolve named nodes + upstream env.
    if (
      (node.config?.scriptEnabled === true ||
        node.config?.loopScriptEnabled === true) &&
      ctx
    ) {
      return runLoopScript(node, inputs, tags, ctx);
    }

    // Internal mock call: a function/http node wired to a server node can fire
    // one of that server's mock routes instead of running its own logic /
    // hitting the network. Resolved fully in-process (works on Vercel, no
    // deploy). Only applies when the user opted in via callMode === 'internal'.
    if (
      node.config?.callMode === 'internal' &&
      (node.type === 'function' || node.type === 'http-request') &&
      ctx
    ) {
      return executeInternalCall(node, ctx, tags);
    }

    switch (node.type) {
      case 'function': {
        // Execute JavaScript function from config
        const { code } = node.config;
        if (!code) {
          return { nodeId: node.id, status: 'error', error: 'No function code provided' };
        }

        try {
          const fn = new Function('inputs', code);
          const output = fn(inputs);
          return { nodeId: node.id, status: 'success', output };
        } catch (e: any) {
          return { nodeId: node.id, status: 'error', error: e.message };
        }
      }

      case 'http-request': {
        // Make HTTP request
        const {
          url,
          urlMode,
          urlParts,
          urlTagId,
          method = 'GET',
          headers = {},
          body,
          // Body editor mode (Postman-style). Absent => 'raw' (back-compat: old
          // nodes only ever stored `body`).
          //   'raw'  -> config.body (JSON text / object, interpolated)
          //   'form' -> config.bodyForm rows assembled into an object
          //   'none' -> no body sent
          bodyMode,
          bodyForm,
          // Legacy config (pre-URL-builder). Still honoured so old nodes don't
          // break after deploy, but no UI produces these any more.
          applyTagQuery = false,
          tagQuery,
          applyTagBody = false,
          tagBody,
          // Per-node request timeout override. Defaults to HTTP_TIMEOUT_MS. Lets
          // a node that proxies a slow operation (e.g. a Puppeteer capture
          // service that launches a headless browser) wait longer than the
          // 20s default. Clamped to a sane ceiling so a typo can't hang a run.
          timeoutMs,
        } = node.config;

        const httpMethod = String(method).toUpperCase();

        // ---- Resolve the base URL ----
        // Three shapes, newest first:
        //   1. urlMode === 'builder' (or a urlParts array)  -> assemble from
        //      ordered typed tags (domain + pathname/param).
        //   2. legacy urlMode === 'tag' / a bare urlTagId   -> treat as a single
        //      url part [urlTagId] (back-compat).
        //   3. otherwise                                    -> manual config.url.
        let baseUrl: string | undefined;
        const partIds: string[] = Array.isArray(urlParts)
          ? urlParts.filter((x: unknown): x is string => typeof x === 'string')
          : urlMode === 'tag' || (urlMode == null && urlTagId)
          ? typeof urlTagId === 'string' && urlTagId
            ? [urlTagId]
            : []
          : [];

        const useBuilder = urlMode === 'builder' || partIds.length > 0;
        if (useBuilder) {
          const byId = new Map(tags.map((t) => [t.id, t]));
          const parts: Array<{ value: string; type: TagType }> = [];
          for (const pid of partIds) {
            const t = byId.get(pid);
            if (!t) continue; // tag deleted after referencing — skip defensively
            // Tag.type should always be present now, but be defensive about old
            // tag rows read before the lazy-migrate path ran.
            const type: TagType = (t as Tag).type ?? detectTagType(t.value);
            parts.push({ value: t.value, type });
          }
          if (parts.length === 0) {
            return { nodeId: node.id, status: 'error', error: 'URL builder has no resolvable tags' };
          }
          baseUrl = buildUrlFromParts(parts);
        } else {
          baseUrl = url ? String(url) : undefined;
        }

        if (!baseUrl) {
          return { nodeId: node.id, status: 'error', error: 'No URL provided' };
        }

        // ---- n8n-style {{tag}} interpolation in the base URL ----
        // Lets a user embed a tag mid-string (e.g. ".../users/{{userId}}") or a
        // tag-only host (e.g. "{{huayDomain}}/api/...") in either the typed url
        // or an assembled url. Runs before any legacy tagQuery so params are
        // appended onto the already-substituted url.
        baseUrl = interpolateTags(String(baseUrl), tags).result;

        // ---- Auto-prepend a scheme ----
        // A tag value like "huay5bet.com" (no scheme) interpolates into a url
        // that `fetch`/`new URL()` can't parse ("Failed to parse URL from ...").
        // If the resolved url has no http(s):// scheme, default to https:// so
        // the common "domain tag without scheme" case just works. We only treat
        // a leading "scheme://" as already-schemed (protocol-relative "//host"
        // also gets https:).
        baseUrl = baseUrl.trim();
        if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
          baseUrl = 'https://' + baseUrl.replace(/^\/+/, '');
        }

        // Validate the final url is parseable so we surface a clear message
        // instead of a raw "Failed to parse URL" from fetch.
        try {
          // eslint-disable-next-line no-new
          new URL(baseUrl);
        } catch {
          return {
            nodeId: node.id,
            status: 'error',
            error: `Invalid URL: "${baseUrl}". Check the URL and any {{tag}} values it references.`,
          };
        }

        // ---- Legacy tagQuery: append resolved tags as query params ----
        // The URL builder supersedes this (query lives in param tags), but old
        // configs may still carry applyTagQuery — keep honouring them so a node
        // saved before this change keeps producing the same request.
        let finalUrl = String(baseUrl);
        if (applyTagQuery) {
          const qTags = resolveTags(tagQuery, tags).filter((t) => !partIds.includes(t.id));
          if (qTags.length > 0) {
            try {
              const u = new URL(finalUrl);
              for (const t of qTags) u.searchParams.set(t.key, t.value);
              finalUrl = u.toString();
            } catch {
              const sp = new URLSearchParams();
              for (const t of qTags) sp.set(t.key, t.value);
              finalUrl += (finalUrl.includes('?') ? '&' : '?') + sp.toString();
            }
          }
        }

        // ---- Build request body (Postman-style modes) ----
        // GET requests carry no body, so all of this is skipped for GET.
        //   mode 'none' -> no body
        //   mode 'form' -> assemble an object from enabled key/value rows
        //   mode 'raw' / default -> config.body (legacy + back-compat)
        const resolvedBodyMode: 'raw' | 'form' | 'none' =
          bodyMode === 'form' || bodyMode === 'none' ? bodyMode : 'raw';

        let finalBody: any;
        if (httpMethod === 'GET' || resolvedBodyMode === 'none') {
          finalBody = undefined;
        } else if (resolvedBodyMode === 'form') {
          // Each enabled row contributes one key/value pair; both key and value
          // are interpolated so a row value of "{{access_token}}" resolves live.
          const obj: Record<string, unknown> = {};
          if (Array.isArray(bodyForm)) {
            for (const row of bodyForm) {
              if (!row || typeof row !== 'object') continue;
              if ((row as any).enabled === false) continue; // unchecked => skip
              const rawKey = String((row as any).key ?? '').trim();
              if (!rawKey) continue;
              const key = interpolateTags(rawKey, tags).result;
              const rawVal = (row as any).value;
              const val =
                typeof rawVal === 'string'
                  ? interpolateTags(rawVal, tags).result
                  : rawVal;
              obj[key] = val;
            }
          }
          finalBody = obj;
        } else {
          // raw mode (also the back-compat default for old nodes).
          finalBody = body;
          // Legacy tagBody merge — only old configs still carry this.
          if (applyTagBody) {
            const bTags = resolveTags(tagBody, tags);
            if (bTags.length > 0) {
              const base =
                body && typeof body === 'object' && !Array.isArray(body)
                  ? { ...body }
                  : {};
              for (const t of bTags) {
                // Don't clobber keys the user typed explicitly into the body.
                if (!(t.key in base)) base[t.key] = t.value;
              }
              finalBody = base;
            }
          }
          // ---- n8n-style {{tag}} interpolation inside the raw body ----
          // Substitutes any {{tag}} placeholder in string values of the body
          // (e.g. { "token": "Bearer {{access_token}}" }).
          if (finalBody != null) {
            finalBody = interpolateDeep(finalBody, tags).value;
          }
        }

        // ---- n8n-style {{tag}} interpolation in header values ----
        // The common case: an Authorization header of `Bearer {{access_token}}`
        // resolved from a tag captured by an earlier login node.
        const finalHeaders: Record<string, string> = {};
        if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
          for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
            finalHeaders[k] =
              typeof v === 'string' ? interpolateTags(v, tags).result : String(v);
          }
        }

        const started = Date.now();
        const reqTimeout =
          typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
            ? Math.min(timeoutMs, HTTP_TIMEOUT_MAX_MS)
            : HTTP_TIMEOUT_MS;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), reqTimeout);
        try {
          // Serialise the body. A raw-mode string body is ALREADY the literal
          // payload the user typed (e.g. the JSON text `{"user":"bob"}`) — sending
          // it through JSON.stringify would double-encode it into a quoted string
          // ("\"{\\\"user\\\"...\""), so the server sees a JSON string, not an
          // object. Strings go on the wire verbatim; objects/arrays (form mode,
          // auto-injected call() params) get JSON.stringify'd.
          let wireBody: string | undefined;
          if (httpMethod !== 'GET' && httpMethod !== 'HEAD' && finalBody) {
            wireBody =
              typeof finalBody === 'string' ? finalBody : JSON.stringify(finalBody);
          }
          const response = await fetch(finalUrl, {
            method: httpMethod,
            headers: { 'Content-Type': 'application/json', ...finalHeaders },
            body: wireBody,
            signal: controller.signal,
          });
          clearTimeout(timer);

          // Read once as text, then try to parse as JSON. Non-JSON responses
          // (HTML error pages, plain text) are surfaced as a string body rather
          // than throwing — n8n shows whatever came back.
          const raw = await response.text();
          let body: any = raw;
          let bodyType: 'json' | 'text' = 'text';
          try {
            body = raw.length ? JSON.parse(raw) : '';
            bodyType = raw.length ? 'json' : 'text';
          } catch {
            body = raw;
            bodyType = 'text';
          }

          const respHeaders: Record<string, string> = {};
          response.headers.forEach((v, k) => {
            respHeaders[k] = v;
          });

          const http: HttpMeta = {
            request: { method: httpMethod, url: finalUrl },
            statusCode: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: respHeaders,
            contentType: response.headers.get('content-type') ?? undefined,
            bodyType,
            durationMs: Date.now() - started,
          };

          // A non-2xx response is a "successful" execution (we got a reply) but
          // carries an error message so the UI can flag it red. The body is still
          // returned so downstream nodes / the user can inspect it.
          if (!response.ok) {
            return {
              nodeId: node.id,
              status: 'error',
              error: `HTTP ${response.status} ${response.statusText}`,
              output: body,
              http,
            };
          }

          return { nodeId: node.id, status: 'success', output: body, http };
        } catch (e: any) {
          clearTimeout(timer);
          const aborted = e?.name === 'AbortError';
          return {
            nodeId: node.id,
            status: 'error',
            error: aborted
              ? `Request timed out after ${reqTimeout}ms`
              : e?.message || 'Network request failed',
            http: {
              request: { method: httpMethod, url: finalUrl },
              durationMs: Date.now() - started,
            },
          };
        }
      }

      case 'env': {
        // An env node holds a list of { key, value, secret } variables for a
        // frontend/backend target. "Executing" it resolves each value (with
        // {{tag}} interpolation, same as http nodes) into a flat object
        // { KEY: value } so the result can drive output bindings / be inspected.
        // secret only masks the value in the UI — the resolved output still
        // carries the real value so downstream bindings work.
        const rawVars = node.config?.vars;
        const list = Array.isArray(rawVars) ? rawVars : [];
        const output: Record<string, string> = {};
        for (const v of list) {
          if (!v || typeof v !== 'object') continue;
          const key = String((v as any).key ?? '').trim();
          if (!key) continue;
          const rawVal = (v as any).value;
          const value =
            typeof rawVal === 'string'
              ? interpolateTags(rawVal, tags).result
              : String(rawVal ?? '');
          output[key] = value;
        }
        return { nodeId: node.id, status: 'success', output };
      }

      case 'sub-project': {
        // Reference to another project (placeholder)
        return { nodeId: node.id, status: 'success', output: { type: 'sub-project', reference: node.config.projectId } };
      }

      case 'puppeteer': {
        // Browser automation (placeholder - would need server-side implementation)
        return { nodeId: node.id, status: 'success', output: { type: 'puppeteer', message: 'Puppeteer execution requires server-side setup' } };
      }

      case 'server': {
        // Health-check: probe the configured host:port[/healthPath]. We treat
        // ANY HTTP response (even 4xx/5xx) as "reachable" — the port is open and
        // something is serving. Only a network-level failure (refused / DNS /
        // timeout) counts as unreachable. We never throw here so a server node
        // in the middle of a chain can't break the run.
        const cfg = node.config ?? {};
        const url = buildServerUrl(cfg);
        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
        try {
          // GET (not HEAD) — some dev servers / frameworks don't answer HEAD.
          const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'manual',
          });
          clearTimeout(timer);
          const durationMs = Date.now() - started;
          const server: ServerMeta = {
            reachable: true,
            url,
            statusCode: response.status,
            durationMs,
          };
          return {
            nodeId: node.id,
            status: 'success',
            output: { type: 'server', reachable: true, statusCode: response.status, durationMs, url },
            server,
          };
        } catch (e: any) {
          clearTimeout(timer);
          const durationMs = Date.now() - started;
          const server: ServerMeta = { reachable: false, url, durationMs };
          // reachable:false is a *successful* execution (we did the check) so a
          // chain continues past it. The UI shows the red "unreachable" badge.
          return {
            nodeId: node.id,
            status: 'success',
            output: { type: 'server', reachable: false, durationMs, url },
            server,
          };
        }
      }

      default:
        return { nodeId: node.id, status: 'error', error: `Unknown node type: ${node.type}` };
    }
  } catch (error: any) {
    return { nodeId: node.id, status: 'error', error: error.message };
  }
}

export function buildExecutionGraph(nodes: PlannerNode[], edges: Edge[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  nodes.forEach((node) => {
    graph.set(node.id, []);
  });

  edges.forEach((edge) => {
    graph.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  });

  return graph;
}

export function getExecutionOrder(nodes: PlannerNode[], edges: Edge[]): string[] {
  const graph = buildExecutionGraph(nodes, edges);
  const inDegree = new Map<string, number>();
  const order: string[] = [];

  nodes.forEach((node) => {
    inDegree.set(
      node.id,
      edges.filter((e) => e.targetNodeId === node.id).length
    );
  });

  const queue = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0).map((n) => n.id);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);

    (graph.get(nodeId) || []).forEach((neighbor) => {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    });
  }

  return order;
}

export interface WorkflowRunResult {
  results: ExecutionResult[];
  // Final tag array after all bindings applied (last-write-wins across nodes).
  tags: Tag[];
  // Bindings whose path didn't resolve in this run (user decides keep/drop).
  missingBindings: MissingBinding[];
  // True if any binding actually changed a tag (so the caller knows to persist).
  tagsChanged: boolean;
}

// Streamed during a workflow run so the canvas can light each node up live.
//   'running' -> we're about to execute this node
//   'done'    -> finished successfully (result carries the output/http meta)
//   'error'   -> the node returned an error (result carries the message)
//   'skipped' -> an upstream node failed, so this node never ran
export type NodeRunStatus = 'running' | 'done' | 'error' | 'skipped';

export interface NodeStatusEvent {
  nodeId: string;
  nodeName?: string;
  status: NodeRunStatus;
  // For done/error: the full ExecutionResult so the UI can show output inline.
  result?: ExecutionResult;
  // Source node ids whose output fed this node (so the UI can flash those edges).
  fromNodeIds?: string[];
}

/**
 * Compute, for each node, the set of upstream source node ids that feed it.
 * Used both to flash incoming edges and to know which nodes to skip when an
 * upstream node fails.
 */
function incomingByNode(edges: Edge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of edges) {
    const list = map.get(e.targetNodeId) ?? [];
    list.push(e.sourceNodeId);
    map.set(e.targetNodeId, list);
  }
  return map;
}

/**
 * Execute every node following the graph topology, threading each node's output
 * forward to its connected downstream nodes (auto data passing) and tags forward
 * (output bindings). Optionally streams a NodeStatusEvent before and after each
 * node so a live UI (SSE) can animate the run.
 *
 * Failure handling: if any upstream node of a node failed (status 'error'), the
 * node is SKIPPED — it never executes and its downstream is skipped in turn.
 * This stops a broken login from firing every authenticated call after it.
 */
export async function executeWorkflow(
  nodes: PlannerNode[],
  edges: Edge[],
  tags: Tag[] = [],
  onStatus?: (e: NodeStatusEvent) => void | Promise<void>,
): Promise<WorkflowRunResult> {
  const results: ExecutionResult[] = [];
  const outputs = new Map<string, any>();
  const order = getExecutionOrder(nodes, edges);
  const incoming = incomingByNode(edges);

  // Tags evolve as we go so a node later in the chain reads values written by an
  // earlier node in the SAME run (login chain: node A writes access_token,
  // node B uses it via tagQuery / urlTagId).
  let currentTags = tags;
  let tagsChanged = false;
  const missingBindings: MissingBinding[] = [];
  const ctx: ExecContext = { nodes, edges };

  // Node ids that won't run because an upstream node failed (or was itself
  // skipped). Propagates downward through the topological order.
  const skipped = new Set<string>();

  for (const nodeId of order) {
    const node = nodes.find((n) => n.id === nodeId)!;
    const fromNodeIds = incoming.get(nodeId) ?? [];

    // Skip if any upstream node failed or was skipped.
    if (fromNodeIds.some((src) => skipped.has(src) || hasFailed(src, results))) {
      skipped.add(nodeId);
      const result: ExecutionResult = {
        nodeId,
        nodeName: node.name,
        nodeType: node.type,
        status: 'error',
        error: 'Skipped: an upstream node failed.',
      };
      results.push(result);
      await onStatus?.({ nodeId, nodeName: node.name, status: 'skipped', result, fromNodeIds });
      continue;
    }

    await onStatus?.({ nodeId, nodeName: node.name, status: 'running', fromNodeIds });

    const inputs = getNodeInputs(nodeId, edges, outputs, nodes);
    const result = await executeNode(node, inputs, currentTags, ctx);
    result.nodeName = node.name;
    result.nodeType = node.type;
    results.push(result);

    if (result.status === 'success') {
      outputs.set(nodeId, result.output);
      // Only successful (2xx) executions write tags.
      const applied = applyOutputBindings(
        result.output,
        node.config?.outputBindings,
        currentTags,
        node.id,
        node.name,
      );
      if (applied.tags !== currentTags) {
        currentTags = applied.tags;
        tagsChanged = true;
      }
      missingBindings.push(...applied.missing);
      await onStatus?.({ nodeId, nodeName: node.name, status: 'done', result, fromNodeIds });
    } else {
      // A failed node poisons its downstream (handled at the top of the loop).
      skipped.add(nodeId);
      await onStatus?.({ nodeId, nodeName: node.name, status: 'error', result, fromNodeIds });
    }
  }

  return { results, tags: currentTags, missingBindings, tagsChanged };
}

// Has a given node id already produced an error result in this run?
function hasFailed(nodeId: string, results: ExecutionResult[]): boolean {
  const r = results.find((x) => x.nodeId === nodeId);
  return !!r && r.status === 'error';
}

export interface SingleRunResult {
  result: ExecutionResult;
  tags: Tag[];
  missingBindings: MissingBinding[];
  tagsChanged: boolean;
}

// Execute a single node in isolation (no upstream chain). Used by the per-node
// "Execute" button so the user can fire one HTTP request and inspect its output
// immediately, n8n-style. Applies output bindings on success.
export async function executeSingleNode(
  node: PlannerNode,
  tags: Tag[] = [],
  ctx?: ExecContext,
): Promise<SingleRunResult> {
  const result = await executeNode(node, {}, tags, ctx);
  result.nodeName = node.name;
  result.nodeType = node.type;

  if (result.status !== 'success') {
    return { result, tags, missingBindings: [], tagsChanged: false };
  }
  const applied = applyOutputBindings(
    result.output,
    node.config?.outputBindings,
    tags,
    node.id,
    node.name,
  );
  return {
    result,
    tags: applied.tags,
    missingBindings: applied.missing,
    tagsChanged: applied.tags !== tags,
  };
}

// Build the `inputs` object a node sees during a workflow run. Each upstream
// node's output is exposed under TWO keys so the user can reference it whichever
// way reads naturally in a Function node / loop script:
//   - the edge's label   (e.g. inputs["then"])      — explicit per-connection
//   - the source node's name (e.g. inputs["Login"]) — "auto data passing"
// Falls back to input_<id> only when a connection has neither a label nor a
// resolvable source name. Both point at the same output object.
function getNodeInputs(
  nodeId: string,
  edges: Edge[],
  outputs: Map<string, any>,
  nodes: PlannerNode[] = [],
): Record<string, any> {
  const inputs: Record<string, any> = {};
  const nameById = new Map(nodes.map((n) => [n.id, String(n.name ?? '').trim()]));

  edges
    .filter((e) => e.targetNodeId === nodeId)
    .forEach((edge) => {
      const out = outputs.get(edge.sourceNodeId);
      const srcName = nameById.get(edge.sourceNodeId);
      // Key by the source node name (the canvas label the user sees)…
      if (srcName) inputs[srcName] = out;
      // …and by the edge label if present (per-connection key). When there's
      // neither, fall back to a stable id-derived key so the data is still
      // reachable.
      if (edge.label) inputs[edge.label] = out;
      else if (!srcName) inputs[`input_${edge.sourceNodeId.substring(0, 8)}`] = out;
    });

  return inputs;
}
