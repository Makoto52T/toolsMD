import { Node as PlannerNode, Edge, Tag } from './store';

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
          method = 'GET',
          headers = {},
          body,
          applyTagQuery = false,
          tagQuery,
          applyTagBody = false,
          tagBody,
        } = node.config;

        if (!url) {
          return { nodeId: node.id, status: 'error', error: 'No URL provided' };
        }

        const httpMethod = String(method).toUpperCase();

        // ---- Apply tagQuery: append resolved tags as query string params ----
        let finalUrl = String(url);
        if (applyTagQuery) {
          const qTags = resolveTags(tagQuery, tags);
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

export async function executeWorkflow(
  nodes: PlannerNode[],
  edges: Edge[],
  tags: Tag[] = []
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  const outputs = new Map<string, any>();
  const order = getExecutionOrder(nodes, edges);

  for (const nodeId of order) {
    const node = nodes.find((n) => n.id === nodeId)!;
    const inputs = getNodeInputs(nodeId, edges, outputs);

    const result = await executeNode(node, inputs, tags);
    result.nodeName = node.name;
    result.nodeType = node.type;
    results.push(result);

    if (result.status === 'success') {
      outputs.set(nodeId, result.output);
    }
  }

  return results;
}

// Execute a single node in isolation (no upstream chain). Used by the per-node
// "Execute" button so the user can fire one HTTP request and inspect its output
// immediately, n8n-style.
export async function executeSingleNode(
  node: PlannerNode,
  tags: Tag[] = []
): Promise<ExecutionResult> {
  const result = await executeNode(node, {}, tags);
  result.nodeName = node.name;
  result.nodeType = node.type;
  return result;
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
