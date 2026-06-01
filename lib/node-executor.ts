import { Node as PlannerNode, Edge, Tag } from './store';
import { getByPath, valueToTagString } from './path-utils';

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
}

// Hard cap so a hung endpoint can't keep a serverless invocation alive forever.
const HTTP_TIMEOUT_MS = 20000;

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

// Resolve a single tag id into its tag (or undefined). Used for url-from-tag.
function tagById(tagId: unknown, tags: Tag[]): Tag | undefined {
  if (typeof tagId !== 'string' || !tagId) return undefined;
  return tags.find((t) => t.id === tagId);
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
      const created: Tag = { id: b.tagId, key: b.tagKey || b.path, value };
      next.push(created);
      byId.set(created.id, created);
    }
  }
  return { tags: next, missing };
}

export async function executeNode(
  node: PlannerNode,
  inputs: Record<string, any>,
  tags: Tag[] = []
): Promise<ExecutionResult> {
  try {
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
          urlTagId,
          method = 'GET',
          headers = {},
          body,
          applyTagQuery = false,
          tagQuery,
          applyTagBody = false,
          tagBody,
        } = node.config;

        // ---- Resolve the base URL: manual (config.url) or from a tag ----
        // urlMode === 'tag' (or a bare urlTagId) means the base url comes from
        // the referenced tag's value at execute time.
        let baseUrl: string | undefined;
        if (urlMode === 'tag' || (urlMode == null && urlTagId)) {
          const t = tagById(urlTagId, tags);
          if (!t) {
            return { nodeId: node.id, status: 'error', error: 'URL tag not found or not set' };
          }
          baseUrl = t.value;
          if (!baseUrl) {
            return { nodeId: node.id, status: 'error', error: 'URL tag has an empty value' };
          }
        } else {
          baseUrl = url ? String(url) : undefined;
        }

        if (!baseUrl) {
          return { nodeId: node.id, status: 'error', error: 'No URL provided' };
        }

        const httpMethod = String(method).toUpperCase();

        // ---- Apply tagQuery: append resolved tags as query string params ----
        let finalUrl = String(baseUrl);
        if (applyTagQuery) {
          // The tag that supplies the base URL is NOT a query param. If it was
          // (mistakenly) also selected as a query tag, drop it here so we don't
          // append e.g. `?endpoint=https%3A%2F%2F...` onto the very url it built.
          const qTags = resolveTags(tagQuery, tags).filter((t) => t.id !== urlTagId);
          if (qTags.length > 0) {
            try {
              // Preserve any existing query already present on the url.
              const u = new URL(finalUrl);
              for (const t of qTags) u.searchParams.set(t.key, t.value);
              finalUrl = u.toString();
            } catch {
              // Relative / malformed url: fall back to manual query concat so we
              // still honour the configured tags rather than dropping them.
              const sp = new URLSearchParams();
              for (const t of qTags) sp.set(t.key, t.value);
              finalUrl += (finalUrl.includes('?') ? '&' : '?') + sp.toString();
            }
          }
        }

        // ---- Build request body, merging tagBody (ignored for GET) ----
        // GET requests have no body, so tagBody is intentionally ignored.
        let finalBody: any = body;
        if (applyTagBody && httpMethod !== 'GET') {
          const bTags = resolveTags(tagBody, tags);
          if (bTags.length > 0) {
            const base =
              body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
            for (const t of bTags) {
              // Don't clobber keys the user typed explicitly into the body.
              if (!(t.key in base)) base[t.key] = t.value;
            }
            finalBody = base;
          }
        }

        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
        try {
          const response = await fetch(finalUrl, {
            method: httpMethod,
            headers: { 'Content-Type': 'application/json', ...headers },
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

      case 'sub-project': {
        // Reference to another project (placeholder)
        return { nodeId: node.id, status: 'success', output: { type: 'sub-project', reference: node.config.projectId } };
      }

      case 'puppeteer': {
        // Browser automation (placeholder - would need server-side implementation)
        return { nodeId: node.id, status: 'success', output: { type: 'puppeteer', message: 'Puppeteer execution requires server-side setup' } };
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

export async function executeWorkflow(
  nodes: PlannerNode[],
  edges: Edge[],
  tags: Tag[] = []
): Promise<WorkflowRunResult> {
  const results: ExecutionResult[] = [];
  const outputs = new Map<string, any>();
  const order = getExecutionOrder(nodes, edges);

  // Tags evolve as we go so a node later in the chain reads values written by an
  // earlier node in the SAME run (login chain: node A writes access_token,
  // node B uses it via tagQuery / urlTagId).
  let currentTags = tags;
  let tagsChanged = false;
  const missingBindings: MissingBinding[] = [];

  for (const nodeId of order) {
    const node = nodes.find((n) => n.id === nodeId)!;
    const inputs = getNodeInputs(nodeId, edges, outputs);

    const result = await executeNode(node, inputs, currentTags);
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
    }
  }

  return { results, tags: currentTags, missingBindings, tagsChanged };
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
  tags: Tag[] = []
): Promise<SingleRunResult> {
  const result = await executeNode(node, {}, tags);
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
