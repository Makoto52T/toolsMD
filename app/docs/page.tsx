'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Wordmark } from '@/components/BrandMark';

// Public documentation. No auth — anyone (logged out included) can read it.
// Desktop: sticky sidebar nav + scrollable content. Mobile: accordion sections.

interface Section {
  id: string;
  title: string;
  icon: string;
}

const SECTIONS: Section[] = [
  { id: 'overview', title: 'Overview', icon: '🧭' },
  { id: 'node-types', title: 'Node Types', icon: '🧩' },
  { id: 'tags', title: 'Tags System', icon: '🏷️' },
  { id: 'http', title: 'HTTP Request', icon: '⚡' },
  { id: 'server', title: 'Server Node', icon: '🖥️' },
  { id: 'env', title: 'Env Node', icon: '⚙️' },
  { id: 'execution', title: 'Execution', icon: '▶️' },
  { id: 'loop', title: 'Loop Mode', icon: '🔁' },
  { id: 'templates', title: 'Templates', icon: '📋' },
  { id: 'wiki-ingest', title: 'Wiki Ingest', icon: '📥' },
  { id: 'mobile', title: 'Mobile', icon: '📱' },
  { id: 'tips', title: 'Tips', icon: '💡' },
];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[var(--color-neutral-100)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--color-primary)]">
      {children}
    </code>
  );
}

function Block({ children }: { children: string }) {
  return (
    <pre className="my-3 overflow-x-auto rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-900)] p-4 text-sm leading-relaxed text-[var(--color-neutral-100)]">
      <code className="font-mono">{children}</code>
    </pre>
  );
}

function H2({ id, icon, children }: { id: string; icon: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mb-4 flex items-center gap-2 border-b border-[var(--color-neutral-200)] pb-2 text-2xl font-bold text-[var(--color-neutral-900)]"
    >
      <span>{icon}</span>
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-5 text-lg font-semibold text-[var(--color-neutral-800)]">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 leading-relaxed text-[var(--color-neutral-700)]">{children}</p>;
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mb-3 list-disc space-y-1 pl-6 text-[var(--color-neutral-700)]">{children}</ul>;
}

// --- section bodies --------------------------------------------------------

function Overview() {
  return (
    <section>
      <H2 id="overview" icon="🧭">Overview</H2>
      <P>
        <strong>ProjectPlanner</strong> is a canvas-based API flow builder. You drop{' '}
        <strong>nodes</strong> on a board, connect them with <strong>edges</strong>, and run them as a{' '}
        <strong>workflow chain</strong> — each step passing its output to the next. Think n8n / Postman flows,
        but you place every node by hand.
      </P>
      <P>A typical project has three moving parts:</P>
      <UL>
        <li><strong>Nodes</strong> — the units of work (an HTTP call, a JS function, a mock server, …).</li>
        <li><strong>Edges</strong> — directed connections that define execution order and data flow. Hover an edge to highlight the whole line; click its <Code>✕</Code> to delete it.</li>
        <li><strong>Tags</strong> — typed, reusable values (a domain, a token, a body field) referenced anywhere with <Code>{'{{tagKey}}'}</Code>.</li>
      </UL>
      <P>
        Open a project to reach the canvas. The left panel lists tags, the center is the board, and the right
        panel shows execution output.
      </P>
      <P>
        New here? The{' '}
        <Link href="/tutorial" className="font-semibold text-[var(--color-primary)] hover:underline">
          📖 animated Tutorial
        </Link>{' '}
        walks through every node type and feature step-by-step.
      </P>
    </section>
  );
}

function NodeTypes() {
  return (
    <section>
      <H2 id="node-types" icon="🧩">Node Types</H2>
      <P>Each node has a <strong>type</strong> that decides what running it does:</P>

      <H3>⚡ HTTP Request</H3>
      <P>
        Makes a real HTTP call. Configure method, URL (typed or with <Code>{'{{tags}}'}</Code>), headers, and
        body. Use it for any REST API — login, fetch data, post a form. See <strong>HTTP Request</strong> below.
      </P>

      <H3>🧠 Function</H3>
      <P>
        Runs JavaScript. The body is the function — you get an <Code>inputs</Code> argument (the previous
        step&apos;s output) and <Code>return</Code> a value that becomes this step&apos;s output. Great for
        parsing, filtering, or reshaping a response.
      </P>
      <Block>{`// inputs = previous step output
const items = inputs.data || [];
return items.filter(x => x.active);`}</Block>

      <H3>🖥️ Server</H3>
      <P>
        Represents a running frontend/backend service. Pick a stack (category → language → framework), set a
        host/port for a live <strong>health check</strong>, and optionally define <strong>mock REST routes</strong>{' '}
        and <strong>realtime events</strong> that other nodes can call in-process. See <strong>Server Node</strong>.
      </P>

      <H3>🎭 Puppeteer</H3>
      <P>
        A placeholder node for a headless-browser step (e.g. scraping a token from a page). It records its
        config and output bindings but returns a canned result in this environment.
      </P>

      <H3>⚙️ Env Vars</H3>
      <P>
        Holds a list of environment variables (<Code>KEY=value</Code>) targeted at the{' '}
        <strong>frontend</strong>, <strong>backend</strong>, or both. Mark a value{' '}
        <strong>secret</strong> to mask it in the UI. See <strong>Env Node</strong> below.
      </P>

      <H3>📦 Sub-project</H3>
      <P>References another project as a reusable building block inside the current flow.</P>
    </section>
  );
}

function Tags() {
  return (
    <section>
      <H2 id="tags" icon="🏷️">Tags System</H2>
      <P>
        Tags are named values you reuse across nodes. Reference any tag inside a URL, header, or body with{' '}
        <Code>{'{{tagKey}}'}</Code> and it is substituted at run time. Each tag has a <strong>type</strong> that
        controls how the URL builder and body editor treat it:
      </P>
      <UL>
        <li><Code>domain</Code> — the host, e.g. <Code>api.example.com</Code> (scheme auto-prepended if missing).</li>
        <li><Code>pathname</Code> — a path segment, e.g. <Code>/v1/users</Code>.</li>
        <li><Code>param</Code> — a query parameter, e.g. <Code>q=hello</Code>.</li>
        <li><Code>body</Code> — a value intended for the request body.</li>
        <li><Code>generic</Code> — any plain scalar (token, id, flag).</li>
      </UL>
      <H3>URL builder</H3>
      <P>
        Instead of typing a URL, you can assemble one from ordered tags: a <Code>domain</Code> + one or more{' '}
        <Code>pathname</Code> / <Code>param</Code> tags. The builder joins them into a valid URL, so changing the
        domain tag updates every request that uses it.
      </P>
      <H3>Interpolation</H3>
      <P>
        Anywhere text is allowed you can mix literals and tags: <Code>{'/users/{{userId}}/posts'}</Code> or{' '}
        <Code>{'Bearer {{token}}'}</Code>. Unknown tags are flagged in the Preview tab before you run.
      </P>
    </section>
  );
}

function Http() {
  return (
    <section>
      <H2 id="http" icon="⚡">HTTP Request</H2>
      <P>The HTTP node editor is organized into tabs:</P>
      <UL>
        <li><strong>Request</strong> — method + URL. The URL is plain text and accepts <Code>{'{{tags}}'}</Code>; a missing scheme defaults to <Code>https://</Code>.</li>
        <li><strong>Headers</strong> — key/value pairs, each value interpolated (e.g. <Code>{'Authorization: Bearer {{token}}'}</Code>).</li>
        <li><strong>Body</strong> — choose <Code>none</Code>, <Code>raw</Code> (JSON text), or <Code>form</Code> (key/value rows). Rows can pull live values from tags.</li>
        <li><strong>Output</strong> — bind a field of the response to a tag (response→tag binding).</li>
        <li><strong>Preview</strong> — an axios-style preview of the exact request that will be sent, mirroring the executor. Toggle <strong>Reveal values</strong> to see resolved tag/secret values, and it warns on empty or unknown tags.</li>
      </UL>
      <H3>URL from a tag</H3>
      <P>
        You can drive the whole URL from a <Code>domain</Code> tag (or the URL builder) so a base host is defined
        once and reused. Param tags become query string entries automatically.
      </P>
      <H3>Apply tags to query / header / body</H3>
      <P>
        Tags can be injected into the query string, a header, or a form/body field. Because every value is
        interpolated, one tag update propagates to every node that references it.
      </P>
    </section>
  );
}

function Server() {
  return (
    <section>
      <H2 id="server" icon="🖥️">Server Node</H2>
      <P>
        A server node models a running service. Choose <strong>frontend</strong> or <strong>backend</strong>, then a
        language and framework (the framework list cascades from the language). Set a host/port to enable a live{' '}
        <strong>health check</strong> that pings the service when you run the node.
      </P>
      <H3>Mock REST routes</H3>
      <P>
        Define routes (method + path + status + JSON response) directly on the server node. Another node can call
        a route <em>in-process</em> by drawing an edge to the server and setting <Code>callMode: internal</Code> —
        no real network needed. This lets you build and run a flow before the backend exists.
      </P>
      <Block>{`GET  /users  -> 200 { "users": [...] }
POST /login  -> 200 { "token": "mock-jwt-..." }`}</Block>
      <H3>Mock realtime (socket.io / Pusher)</H3>
      <P>
        Server nodes can declare mock realtime events (a channel + event + payload). A caller that subscribes
        receives the mock payload in-process — handy for prototyping push/socket flows where a real socket
        can&apos;t be held open.
      </P>
      <H3>Health check</H3>
      <P>
        Running a server node probes its host/port and reports reachability + timing, so you can confirm a
        dependency is up as part of the chain.
      </P>
    </section>
  );
}

function Env() {
  return (
    <section>
      <H2 id="env" icon="⚙️">Env Node</H2>
      <P>
        An env node is a typed store of environment variables for your stack. Pick whether they belong to the{' '}
        <strong>frontend</strong>, <strong>backend</strong>, or <strong>both</strong>, then add{' '}
        <Code>KEY=value</Code> rows. It documents the config a service needs in one place on the canvas.
      </P>
      <Block>{`PORT=3000
DATABASE_URL=mysql://{{domain}}/db   # secret
NODE_ENV=production`}</Block>
      <H3>Secret values</H3>
      <P>
        Tick <strong>secret</strong> on a row to mask its value (<Code>••••••</Code>) in the node, the list, and
        the editor. Masking is display-only — running the node still resolves the real value so downstream
        bindings keep working.
      </P>
      <H3>Tag interpolation</H3>
      <P>
        Values support <Code>{'{{tag}}'}</Code> placeholders, resolved with the same engine as HTTP nodes. So{' '}
        <Code>mysql://{'{{domain}}'}/db</Code> picks up the live <Code>domain</Code> tag at run time.
      </P>
      <H3>Running it</H3>
      <P>
        Executing an env node resolves every value and returns a flat{' '}
        <Code>{'{ KEY: value }'}</Code> object. Bind any key to a tag (via the output panel) to feed it into
        later steps in the chain.
      </P>
      <H3>Import .env</H3>
      <P>
        Use <strong>Import .env</strong> to paste a whole <Code>.env</Code> file at once — it parses{' '}
        <Code>KEY=value</Code> lines (honouring <Code>export</Code>, <Code>#</Code> comments, and quotes) and
        merges them into the table.
      </P>
    </section>
  );
}

function Execution() {
  return (
    <section>
      <H2 id="execution" icon="▶️">Execution</H2>
      <H3>Single node run</H3>
      <P>Run any node on its own to test it in isolation. The result appears in the output panel.</P>
      <H3>Run Flow (whole workflow)</H3>
      <P>
        Hit <strong>▶ Run Flow</strong> in the header to run the entire canvas with one click — no code, no
        per-node clicking. The engine finds the start nodes (no incoming edge), sorts the graph topologically,
        and executes each node in order, following the edges. The button toggles to <strong>⏹ Stop</strong> while
        a run is in progress; press it to cancel.
      </P>
      <P>
        The run streams over <Code>Server-Sent Events</Code>, so each node lights up <em>live</em>: a blue pulse +
        spinner while running, a green <Code>✓</Code> when done, a red <Code>✕</Code> on error. A short output
        preview appears on the node card, and the edge carrying data animates as a marching-ants line.
      </P>
      <H3>Auto data passing</H3>
      <P>
        Each node&apos;s output is fed to its connected downstream nodes. A Function or HTTP node reads an upstream
        result through <Code>inputs</Code>, keyed by the edge&apos;s label — e.g.{' '}
        <Code>const prev = inputs[&apos;then&apos;]</Code>. Tags referenced with <Code>{'{{...}}'}</Code> are
        resolved at each step, and a response can be bound back into a tag (below) so a later step reads it.
      </P>
      <H3>Failure skips downstream</H3>
      <P>
        If a node errors, every node downstream of it is <strong>skipped</strong> (shown dimmed) instead of running
        with missing data — a failed login won&apos;t fire the authenticated calls that depend on its token.
      </P>
      <H3>Output panel</H3>
      <P>
        The right-hand panel shows each step n8n-style: status code, response headers, timing, and the JSON body.
        Errors surface a clear message (bad URL, unknown tag, non-2xx).
      </P>
      <H3>Response → tag binding</H3>
      <P>
        In a node&apos;s <strong>Output</strong> tab, bind a path of the response to a tag. When the node runs, the
        resolved value overwrites that tag — so a later step can read it via <Code>{'{{token}}'}</Code>. This is
        the backbone of multi-step flows.
      </P>
    </section>
  );
}

function LoopMode() {
  return (
    <section>
      <H2 id="loop" icon="🔁">Loop Mode</H2>
      <P>
        <strong>Loop mode</strong> is an option on an <em>existing</em> node (HTTP request, function, …) — not a
        separate node type. Turn it on and running that node repeats it a fixed number of times in sequence,
        waiting for each round to finish before starting the next. Use it for polling a job until it&apos;s done,
        retrying a flaky call, or driving a counter.
      </P>

      <H3>Turn it on</H3>
      <P>
        Open the node&apos;s editor and toggle <strong>🔁 เปิด Loop mode</strong>. The loop fields appear below;
        leaving the toggle off runs the node exactly once as usual.
      </P>

      <H3>Settings</H3>
      <UL>
        <li><Code>Rounds</Code> — how many times to run (default <Code>10</Code>, range <Code>1–1000</Code>). Values are clamped to this range.</li>
        <li><Code>Max errors</Code> — error budget (default <Code>3</Code>). The loop stops once this many rounds have failed in a row; a successful round resets the count.</li>
        <li><Code>Delay between rounds</Code> — milliseconds to wait between rounds (default <Code>0</Code> = back-to-back, range <Code>0–60000</Code>). The wait happens after each round except the last; pressing <strong>Stop</strong> during a wait ends the loop. When set, the running badge shows it, e.g. <Code>🔁 loop (3/10) • 1.5s</Code>.</li>
        <li><Code>Stop condition</Code> — an optional JavaScript expression. When it evaluates truthy after a successful round, the loop stops early. Leave it blank to simply run all rounds.</li>
      </UL>

      <H3>Stop condition</H3>
      <P>
        The expression receives two variables: <Code>response</Code> (the full result, with the parsed body on{' '}
        <Code>response.data</Code>) and <Code>output</Code> (the raw step output). Return a boolean. For example,
        to poll until a job reports done:
      </P>
      <Block>{`response.data.status === "done"`}</Block>
      <P>
        Internally this is compiled once as{' '}
        <Code>new Function(&apos;response&apos;, &apos;output&apos;, &apos;return (&lt;expr&gt;)&apos;)</Code>, so it is a single
        expression — no statements or semicolons.
      </P>

      <H3>While it runs</H3>
      <P>
        The node shows a live badge <Code>🔁 loop (i/N)</Code> — the current round over the total — and a{' '}
        <strong>⏹ Stop</strong> button. Press <strong>Stop</strong> to end the loop at the next round boundary
        (the in-flight round finishes; no new round starts).
      </P>

      <H3>Hard limits</H3>
      <P>A loop always ends on whichever comes first:</P>
      <UL>
        <li>all <Code>Rounds</Code> completed,</li>
        <li>the <strong>stop condition</strong> becomes true,</li>
        <li>the <strong>error budget</strong> is exhausted,</li>
        <li>you press <strong>Stop</strong>,</li>
        <li>a safety cap is hit: <strong>max 1000 rounds</strong> and <strong>max 30 minutes</strong> of wall-clock time.</li>
      </UL>
    </section>
  );
}

function Templates() {
  return (
    <section>
      <H2 id="templates" icon="📋">Templates</H2>
      <P>
        Templates are ready-made starting points. <strong>Public tutorial templates</strong> are available to
        everyone; you can also save your own projects as private templates.
      </P>
      <H3>Use a template (dashboard)</H3>
      <P>
        On the dashboard, open the <strong>Templates</strong> section and click <strong>Use template</strong>. It{' '}
        <em>forks</em> the template into a brand-new project you own (nodes, edges, and tags copied), then opens it.
      </P>
      <H3>Load into an existing canvas</H3>
      <P>
        Inside a project, click <strong>📋 Load from template</strong> to <em>append</em> a template&apos;s nodes,
        edges, and tags onto your current canvas without replacing what&apos;s already there.
      </P>
      <H3>Available tutorials</H3>
      <UL>
        <li><strong>Getting Started — Hello World</strong> — one HTTP request + a function that parses the response.</li>
        <li><strong>Login &amp; Token Chain</strong> — POST credentials, bind a token, call a protected endpoint.</li>
        <li><strong>Mock API Server</strong> — a server node with mock routes called in-process.</li>
        <li><strong>Tag &amp; URL Builder</strong> — typed tags assembling a URL + a form body.</li>
      </UL>
    </section>
  );
}

function WikiIngest() {
  return (
    <section>
      <H2 id="wiki-ingest" icon="📥">Wiki Ingest</H2>
      <P>
        <strong>Wiki Ingest</strong> turns any raw text — markdown, notes, code, or plain text — into a clean
        Obsidian-style wiki page <em>and</em> a ready-to-run TMD project, in one pass. It runs a small AI pipeline
        that can pull in extra context from the web before generating both outputs.
      </P>
      <H3>How to use</H3>
      <UL>
        <li>Open <strong>📥 Wiki Ingest</strong> from the dashboard header.</li>
        <li>Enter a <strong>Title</strong> (used for the wiki filename).</li>
        <li>Optionally set a <strong>Project name</strong> (defaults to the title) and comma-separated{' '}
          <strong>topic tags</strong>.</li>
        <li>Leave <Code>🔍 ค้นหาข้อมูลเพิ่มจาก internet</Code> and <Code>📊 สร้าง TMD Project อัตโนมัติ</Code>{' '}
          on (or toggle them off), paste your <strong>raw content</strong>, and click <strong>Process &amp; Save</strong>.</li>
      </UL>
      <H3>The pipeline</H3>
      <UL>
        <li><strong>Analyze</strong> — the AI summarizes the content and decides whether it&apos;s enough to draw an
          architecture diagram; if not, it plans 2–3 search queries.</li>
        <li><strong>Search</strong> (optional) — when web search is on and the content is thin, it queries the web
          (Tavily) for extra context. With no <Code>TAVILY_API_KEY</Code> configured this step is skipped
          gracefully.</li>
        <li><strong>Generate</strong> — produces both the wiki page (YAML frontmatter, <Code>## sections</Code>,{' '}
          <Code>[[backlinks]]</Code>) and a project schema (tags, nodes, edges).</li>
        <li><strong>Create project</strong> — builds a real TMD project from the schema: typed tags, nodes placed
          left-to-right, and edges wired between them.</li>
      </UL>
      <H3>What you get</H3>
      <UL>
        <li>A wiki page written to <Code>ai-wiki/wiki/&lt;slug&gt;.md</Code> (committed via the GitHub API on the
          hosted app) and logged in <Code>log.md</Code>.</li>
        <li>A new <strong>project</strong> on your dashboard (e.g. an <Code>HTTP Login → Get Token → Puppeteer</Code>{' '}
          flow), opened directly from the result panel — node and edge counts are shown.</li>
      </UL>
      <P>
        The result panel shows the AI&apos;s summary, whether web context was used, and a link to open the generated
        project; the full wiki markdown renders below for review.
      </P>
    </section>
  );
}

function Mobile() {
  return (
    <section>
      <H2 id="mobile" icon="📱">Mobile</H2>
      <P>
        On a phone the editor splits into a single full-width pane driven by a bottom tab bar, so you
        get the same capabilities as desktop without fighting a three-column layout on a small screen.
      </P>
      <H3>Bottom tabs</H3>
      <UL>
        <li><strong>🗺️ Canvas</strong> — the real flow canvas. Pinch to zoom, drag a node to move it,
          and drag from a node handle to another to draw an edge. Positions and edges persist exactly
          like on desktop.</li>
        <li><strong>📋 List</strong> — a touch-first editor: each node is a card with large Run / Edit /
          Link / Del buttons. Tap <strong>Link</strong> then a target card to connect two nodes without
          drawing an edge by hand.</li>
        <li><strong>📤 Output</strong> — execution results render here inline. Running a node or the whole
          workflow jumps you to this tab automatically; a dot on the tab marks fresh results.</li>
      </UL>
      <H3>Tags &amp; editing</H3>
      <P>
        The <strong>🏷️ Tags</strong> panel opens as a full-screen overlay from the launcher on the left
        edge — reachable from any tab. Editing a node opens a full-width bottom sheet with the same Name /
        Type / HTTP tabs (Request, Headers, Body, Preview, Output) as desktop.
      </P>
    </section>
  );
}

function Tips() {
  return (
    <section>
      <H2 id="tips" icon="💡">Tips</H2>
      <H3>Login chain pattern</H3>
      <P>
        Step 1 logs in and binds the token to a tag (Output tab). Step 2 sends{' '}
        <Code>{'Authorization: Bearer {{token}}'}</Code>. Connect them with an edge so Step 1 runs first.
      </P>
      <H3>Debug with the Preview tab</H3>
      <P>
        Before running, open an HTTP node&apos;s <strong>Preview</strong> tab to see the exact request — URL,
        headers, and body with tags substituted. It warns about empty or unknown tags so you catch typos early.
      </P>
      <H3>Reveal values</H3>
      <P>
        Tag values (tokens, secrets) are masked by default. Toggle <strong>Reveal values</strong> in the Preview to
        confirm the real resolved value when something looks wrong.
      </P>
    </section>
  );
}

const BODIES: Record<string, () => React.JSX.Element> = {
  overview: Overview,
  'node-types': NodeTypes,
  tags: Tags,
  http: Http,
  server: Server,
  env: Env,
  execution: Execution,
  loop: LoopMode,
  templates: Templates,
  'wiki-ingest': WikiIngest,
  mobile: Mobile,
  tips: Tips,
};

export default function DocsPage() {
  // Mobile accordion: which sections are open (default: first open).
  const [open, setOpen] = useState<Record<string, boolean>>({ overview: true });

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Link href="/dashboard" aria-label="toolsMD home">
              <Wordmark />
            </Link>
            <span className="hidden h-5 w-px bg-[var(--color-neutral-200)] sm:block" />
            <span className="hidden font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-neutral-500)] sm:inline">
              Docs
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/tutorial"
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-900)]"
            >
              📖 Tutorial
            </Link>
            <Link
              href="/wiki-graph"
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-900)]"
            >
              🕸️ Knowledge Graph
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-900)]"
            >
              Dashboard →
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
        {/* Desktop sidebar nav */}
        <nav className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24 space-y-1">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-primary)]"
              >
                <span>{s.icon}</span>
                {s.title}
              </a>
            ))}
          </div>
        </nav>

        {/* Desktop: full content. Mobile: accordion. */}
        <main className="min-w-0 flex-1">
          {/* Desktop content */}
          <div className="hidden space-y-12 lg:block">
            {SECTIONS.map((s) => {
              const Body = BODIES[s.id];
              return <Body key={s.id} />;
            })}
          </div>

          {/* Mobile accordion */}
          <div className="space-y-3 lg:hidden">
            {SECTIONS.map((s) => {
              const Body = BODIES[s.id];
              const isOpen = !!open[s.id];
              return (
                <div
                  key={s.id}
                  className="overflow-hidden rounded-lg border border-[var(--color-neutral-200)] bg-white"
                >
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-base font-semibold text-[var(--color-neutral-900)]"
                  >
                    <span className="flex items-center gap-2">
                      <span>{s.icon}</span>
                      {s.title}
                    </span>
                    <span className="text-[var(--color-neutral-400)]">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-[var(--color-neutral-100)] px-4 py-3">
                      <Body />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <footer className="mt-16 border-t border-[var(--color-neutral-200)] pt-6 text-sm text-[var(--color-neutral-400)]">
            Ready to build?{' '}
            <Link href="/dashboard" className="font-medium text-[var(--color-primary)] hover:underline">
              Go to your dashboard
            </Link>{' '}
            and start from a template.
          </footer>
        </main>
      </div>
    </div>
  );
}
