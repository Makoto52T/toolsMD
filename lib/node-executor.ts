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
}

// Hard cap so a hung endpoint can't keep a serverless invocation alive forever.
const HTTP_TIMEOUT_MS = 20000;
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
  const missing: MissingBinding[] = [];

  for (const b of bindings) {
    if (!b || typeof b.path !== 'string' || typeof b.tagId !== 'string') continue;
    const resolved = getByPath(output, b.path);
    if (resolved === undefined) {
      missing.push({ nodeId, nodeName, path: b.path, tagId: b.tagId, tagKey: b.tagKey });
      continue;
    }
    const value = valueToTagString(resolved);
    const existing = byId.get(b.tagId);
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
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
        try {
          const response = await fetch(finalUrl, {
            method: httpMethod,
            headers: { 'Content-Type': 'application/json', ...finalHeaders },
            body:
              httpMethod !== 'GET' && httpMethod !== 'HEAD' && finalBody
                ? JSON.stringify(finalBody)
                : undefined,
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
              ? `Request timed out after ${HTTP_TIMEOUT_MS}ms`
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

    const inputs = getNodeInputs(nodeId, edges, outputs);
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

function getNodeInputs(nodeId: string, edges: Edge[], outputs: Map<string, any>): Record<string, any> {
  const inputs: Record<string, any> = {};

  edges
    .filter((e) => e.targetNodeId === nodeId)
    .forEach((edge) => {
      const key = edge.label || `input_${edge.sourceNodeId.substring(0, 8)}`;
      inputs[key] = outputs.get(edge.sourceNodeId);
    });

  return inputs;
}
