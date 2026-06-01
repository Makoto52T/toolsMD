import { Node as PlannerNode, Edge, Tag } from './store';

export interface ExecutionResult {
  nodeId: string;
  status: 'success' | 'error';
  output?: any;
  error?: string;
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

        try {
          const response = await fetch(finalUrl, {
            method: httpMethod,
            headers: { 'Content-Type': 'application/json', ...headers },
            body:
              httpMethod !== 'GET' && httpMethod !== 'HEAD' && finalBody
                ? JSON.stringify(finalBody)
                : undefined,
          });

          const data = await response.json();
          return { nodeId: node.id, status: 'success', output: data };
        } catch (e: any) {
          return { nodeId: node.id, status: 'error', error: e.message };
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
    results.push(result);

    if (result.status === 'success') {
      outputs.set(nodeId, result.output);
    }
  }

  return results;
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
