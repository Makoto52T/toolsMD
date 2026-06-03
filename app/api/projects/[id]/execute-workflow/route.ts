import { store } from '@/lib/store';
import { executeWorkflow, type NodeStatusEvent } from '@/lib/node-executor';
import { NextRequest } from 'next/server';

// SSE must run on the Node.js runtime (not edge) so we can hold the streaming
// response open while executeWorkflow awaits each node.
export const runtime = 'nodejs';
// Never cache / prerender — this is a live, per-request execution stream.
export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

// Serialise one event as an SSE frame: `event: <name>\ndata: <json>\n\n`.
function frame(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Run the whole workflow and stream node-by-node status over Server-Sent
 * Events. The client (canvas Run Flow button) consumes this to light each node
 * up live: running -> done/error/skipped, plus a final `complete` event that
 * carries the server-canonical tags + any missing bindings.
 *
 * Event types emitted:
 *   start    -> { order: nodeId[] }            (topological run order)
 *   node     -> NodeStatusEvent                (one per node transition)
 *   complete -> { tags, missingBindings }      (run finished)
 *   error    -> { error }                      (fatal: auth / not found / crash)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = request.cookies.get('userId')?.value;

  // Auth / ownership are validated up-front (before opening the stream) so a
  // 401/404 is a normal JSON response, not an SSE error frame.
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const project = await store.getProject(id);
  if (!project || project.userId !== userId) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(frame(event, data));
        } catch {
          // Controller already closed (client disconnected) — stop emitting.
          closed = true;
        }
      };

      // Abort cleanly if the client disconnects mid-run.
      request.signal.addEventListener('abort', () => {
        closed = true;
      });

      try {
        send('start', {
          nodeCount: project.nodes.length,
          edgeCount: project.edges.length,
        });

        const onStatus = (e: NodeStatusEvent) => {
          send('node', e);
        };

        const { tags, missingBindings, tagsChanged, results } =
          await executeWorkflow(project.nodes, project.edges, project.tags, onStatus);

        // Persist tags written by output bindings during the run.
        let finalTags = tags;
        if (tagsChanged) {
          const updated = await store.updateProjectTags(id, tags);
          if (updated) finalTags = updated.tags;
        }

        send('complete', { tags: finalTags, missingBindings, results });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Workflow execution failed';
        send('error', { error: message });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable proxy buffering (nginx) so events flush immediately.
      'X-Accel-Buffering': 'no',
    },
  });
}
