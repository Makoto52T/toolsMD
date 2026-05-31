import { Project, Node as PlannerNode, Edge } from './store';

export function generateProjectMarkdown(project: Project): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${project.name}`);
  if (project.description) {
    lines.push(`\n${project.description}\n`);
  }

  // Metadata
  lines.push(`\n## Project Information\n`);
  lines.push(`- **Created:** ${project.createdAt.toISOString().split('T')[0]}`);
  lines.push(`- **Updated:** ${project.updatedAt.toISOString().split('T')[0]}`);
  lines.push(`- **Total Nodes:** ${project.nodes.length}`);
  lines.push(`- **Total Connections:** ${project.edges.length}\n`);

  // Nodes section
  if (project.nodes.length > 0) {
    lines.push(`## Workflow Nodes\n`);

    project.nodes.forEach((node, idx) => {
      lines.push(`### ${idx + 1}. ${node.name}`);
      lines.push(`- **Type:** \`${node.type}\``);
      lines.push(`- **ID:** \`${node.id}\``);
      if (node.description) {
        lines.push(`- **Description:** ${node.description}`);
      }
      if (node.config && Object.keys(node.config).length > 0) {
        lines.push(`- **Configuration:**`);
        lines.push(`  \`\`\`json`);
        lines.push(`  ${JSON.stringify(node.config, null, 2)}`);
        lines.push(`  \`\`\``);
      }
      lines.push('');
    });
  }

  // Edges section
  if (project.edges.length > 0) {
    lines.push(`## Data Flow\n`);

    project.edges.forEach((edge) => {
      const sourceNode = project.nodes.find((n) => n.id === edge.sourceNodeId);
      const targetNode = project.nodes.find((n) => n.id === edge.targetNodeId);

      if (sourceNode && targetNode) {
        lines.push(`- **${sourceNode.name}** → **${targetNode.name}**${edge.label ? ` (${edge.label})` : ''}`);
      }
    });
    lines.push('');
  }

  // Execution plan
  lines.push(`\n## Execution Order\n`);
  const executionOrder = calculateExecutionOrder(project.nodes, project.edges);
  executionOrder.forEach((nodeId, idx) => {
    const node = project.nodes.find((n) => n.id === nodeId);
    if (node) {
      lines.push(`${idx + 1}. ${node.name} (\`${node.type}\`)`);
    }
  });

  return lines.join('\n');
}

function calculateExecutionOrder(nodes: PlannerNode[], edges: Edge[]): string[] {
  const visited = new Set<string>();
  const order: string[] = [];

  // Build adjacency list
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  nodes.forEach((node) => {
    graph.set(node.id, []);
    inDegree.set(node.id, 0);
  });

  edges.forEach((edge) => {
    graph.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) || 0) + 1);
  });

  // Topological sort (Kahn's algorithm)
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
