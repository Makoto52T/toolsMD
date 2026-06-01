'use client';

import { useState } from 'react';
import Link from 'next/link';

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
  { id: 'execution', title: 'Execution', icon: '▶️' },
  { id: 'loop', title: 'Loop Mode', icon: '🔁' },
  { id: 'templates', title: 'Templates', icon: '📋' },
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
        <li><strong>Edges</strong> — directed connections that define execution order and data flow.</li>
        <li><strong>Tags</strong> — typed, reusable values (a domain, a token, a body field) referenced anywhere with <Code>{'{{tagKey}}'}</Code>.</li>
      </UL>
      <P>
        Open a project to reach the canvas. The left panel lists tags, the center is the board, and the right
        panel shows execution output.
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

function Execution() {
  return (
    <section>
      <H2 id="execution" icon="▶️">Execution</H2>
      <H3>Single node run</H3>
      <P>Run any node on its own to test it in isolation. The result appears in the output panel.</P>
      <H3>Workflow chain</H3>
      <P>
        Hit <strong>Execute</strong> to run the chain: the executor follows edges in order, feeding each
        step&apos;s output into the next step as <Code>inputs</Code>. Tags referenced with <Code>{'{{...}}'}</Code>{' '}
        are resolved at each step.
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
  execution: Execution,
  loop: LoopMode,
  templates: Templates,
  tips: Tips,
};

export default function DocsPage() {
  // Mobile accordion: which sections are open (default: first open).
  const [open, setOpen] = useState<Record<string, boolean>>({ overview: true });

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <header className="sticky top-0 z-10 border-b border-[var(--color-neutral-200)] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--color-primary)]">
            <span>📘</span> ProjectPlanner Docs
          </h1>
          <Link
            href="/dashboard"
            className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-primary)]"
          >
            Dashboard →
          </Link>
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
