import { Node as PlannerNode, Edge } from './store';

export interface ExecutionResult {
  nodeId: string;
  status: 'success' | 'error';
  output?: any;
  error?: string;
}

export async function executeNode(
  node: PlannerNode,
  inputs: Record<string, any>
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
        const { url, method = 'GET', headers = {}, body } = node.config;

        if (!url) {
          return { nodeId: node.id, status: 'error', error: 'No URL provided' };
        }

        try {
          const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
            body: body ? JSON.stringify(body) : undefined,
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
  edges: Edge[]
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  const outputs = new Map<string, any>();
  const order = getExecutionOrder(nodes, edges);

  for (const nodeId of order) {
    const node = nodes.find((n) => n.id === nodeId)!;
    const inputs = getNodeInputs(nodeId, edges, outputs);

    const result = await executeNode(node, inputs);
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
