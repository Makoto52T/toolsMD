/* Idempotent seed for public tutorial templates.
 *
 * Creates 4 curated templates owned by the system user (system@tmd.app) with
 * is_template=1 + is_public_template=1, so they appear in every user's
 * "Templates" section. Re-running deletes the previous copies (matched by name
 * under the system user) and recreates them, so it is safe to run repeatedly.
 *
 * Config shapes mirror lib/node-executor.ts exactly:
 *   - http-request: { url, method, headers, bodyMode, bodyForm, body, outputBindings:[{path,tagId,tagKey}], urlMode:'builder', urlParts:[tagId] }
 *   - function:     { code }  (new Function('inputs', code))
 *   - server:       { category, language, framework, host, port, routes:[{method,path,statusCode,response}], realtime:{...} }
 *   - tags:         [{ id, key, value, type }]  type in domain|pathname|param|body|generic
 *
 * Run: node scripts/seed-public-templates.cjs
 */
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Load .env (simple parser — avoids a dotenv dep).
const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const SYSTEM_USER_ID = 'system-tmd-0000-0000-000000000000';

async function main() {
  const pool = await mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  // --- template definitions ------------------------------------------------
  // Each builder returns { name, description, tags, nodes, edges }.
  // Helpers below assign ids and wire edges by node "ref".

  const templates = [helloWorld(), loginChain(), mockServer(), tagBuilder()];

  const names = templates.map((t) => t.name);
  // Idempotent: wipe previous public-template copies (CASCADE drops nodes/edges).
  const [del] = await pool.query(
    `DELETE FROM projects WHERE user_id = ? AND is_public_template = 1 AND name IN (${names.map(() => '?').join(',')})`,
    [SYSTEM_USER_ID, ...names]
  );
  console.log(`Removed ${del.affectedRows} existing public template(s).`);

  const summary = [];
  for (const t of templates) {
    const projectId = randomUUID();
    // Resolve tag ids first so node configs can reference them.
    const tagRows = t.tags.map((tag) => ({ id: randomUUID(), ...tag }));
    const tagByKey = Object.fromEntries(tagRows.map((tg) => [tg.key, tg.id]));

    await pool.execute(
      `INSERT INTO projects (id, user_id, name, description, tags, is_template, is_public_template)
       VALUES (?, ?, ?, ?, ?, 1, 1)`,
      [projectId, SYSTEM_USER_ID, t.name, t.description, JSON.stringify(tagRows)]
    );

    // Nodes — resolve config via callback so it can read tagByKey.
    const nodeIdByRef = {};
    for (const n of t.nodes) {
      const nodeId = randomUUID();
      nodeIdByRef[n.ref] = nodeId;
      const config = typeof n.config === 'function' ? n.config(tagByKey) : n.config || {};
      await pool.execute(
        `INSERT INTO nodes (id, project_id, type, name, description, position_x, position_y, config)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [nodeId, projectId, n.type, n.name, n.description || '', n.x, n.y, JSON.stringify(config)]
      );
    }

    for (const e of t.edges) {
      await pool.execute(
        `INSERT INTO edges (id, project_id, source_node_id, target_node_id, label, source_handle, target_handle)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          projectId,
          nodeIdByRef[e.from],
          nodeIdByRef[e.to],
          e.label || '',
          e.sourceHandle || 'right',
          e.targetHandle || 'left',
        ]
      );
    }

    summary.push({ name: t.name, id: projectId, nodes: t.nodes.length, edges: t.edges.length, tags: tagRows.length });
  }

  console.log('Seeded public templates:');
  for (const s of summary) {
    console.log(`  - "${s.name}" (${s.id}): ${s.nodes} nodes, ${s.edges} edges, ${s.tags} tags`);
  }

  await pool.end();
}

// ---------------------------------------------------------------------------
// Template builders
// ---------------------------------------------------------------------------

function helloWorld() {
  return {
    name: 'Getting Started — Hello World',
    description: 'Your first flow: one HTTP request to postman-echo, then a function node that parses the JSON response. Run the chain and watch the output panel.',
    tags: [{ key: 'greeting', value: 'world', type: 'generic' }],
    nodes: [
      {
        ref: 'http',
        type: 'http-request',
        name: 'GET postman-echo',
        description: 'Calls https://postman-echo.com/get?hello=world',
        x: 80,
        y: 160,
        config: () => ({
          url: 'https://postman-echo.com/get?hello={{greeting}}',
          method: 'GET',
          headers: { Accept: 'application/json' },
          bodyMode: 'none',
        }),
      },
      {
        ref: 'fn',
        type: 'function',
        name: 'Parse response',
        description: 'Reads the echoed query param off the previous step output.',
        x: 460,
        y: 160,
        config: {
          code: [
            '// `inputs` is keyed by each incoming edge LABEL. The edge from the',
            '// HTTP node is labelled "response", so the parsed JSON body is at',
            '// inputs.response. postman-echo returns { args: { hello: "world" }, ... }.',
            'const res = inputs.response || {};',
            'const hello = res.args ? res.args.hello : undefined;',
            'return { hello, message: "Hello, " + (hello || "there") + "!" };',
          ].join('\n'),
        },
      },
    ],
    edges: [{ from: 'http', to: 'fn', label: 'response' }],
  };
}

function loginChain() {
  return {
    name: 'Login & Token Chain',
    description: 'A generic two-step login pattern: POST credentials to get a token, bind the token to a tag, then call a protected endpoint with Authorization: Bearer {{token}}. Swap the URLs/tags for your own API.',
    tags: [
      { key: 'username', value: 'demo-user', type: 'generic' },
      { key: 'password', value: 'demo-pass', type: 'generic' },
      { key: 'token', value: '', type: 'generic' },
    ],
    nodes: [
      {
        ref: 'login',
        type: 'http-request',
        name: 'Step 1 · Login',
        description: 'POST username/password (form body) → response binds .json.token to the token tag.',
        x: 80,
        y: 140,
        config: (t) => ({
          url: 'https://postman-echo.com/post',
          method: 'POST',
          headers: { Accept: 'application/json' },
          bodyMode: 'form',
          bodyForm: [
            { key: 'username', value: '{{username}}', enabled: true },
            { key: 'password', value: '{{password}}', enabled: true },
          ],
          // Form-mode bodies are sent as JSON, so postman-echo echoes them back
          // under .data (not .form). Bind a value from there into the token tag
          // to demonstrate response→tag binding (swap for your API's token path).
          outputBindings: [{ path: 'data.username', tagId: t.token, tagKey: 'token' }],
        }),
      },
      {
        ref: 'protected',
        type: 'http-request',
        name: 'Step 2 · Call protected API',
        description: 'Sends Authorization: Bearer {{token}} using the token captured in Step 1.',
        x: 480,
        y: 140,
        config: () => ({
          url: 'https://postman-echo.com/headers',
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: 'Bearer {{token}}' },
          bodyMode: 'none',
        }),
      },
    ],
    edges: [{ from: 'login', to: 'protected', label: 'token' }],
  };
}

function mockServer() {
  return {
    name: 'Mock API Server',
    description: 'A backend server node (Node/Express) exposing two mock routes — GET /users and POST /login. Two function-driven HTTP callers hit the mock in-process via internal edges, so you can prototype a flow before the real API exists.',
    tags: [],
    nodes: [
      {
        ref: 'server',
        type: 'server',
        name: 'API Server (mock)',
        description: 'Express backend with mock routes GET /users and POST /login.',
        x: 320,
        y: 60,
        config: {
          category: 'backend',
          language: 'JavaScript',
          framework: 'Express',
          host: 'localhost',
          port: 3001,
          routes: [
            {
              id: randomUUID(),
              method: 'GET',
              path: '/users',
              statusCode: 200,
              response: { users: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Linus' }] },
            },
            {
              id: randomUUID(),
              method: 'POST',
              path: '/login',
              statusCode: 200,
              response: { token: 'mock-jwt-abc123', expiresIn: 3600 },
            },
          ],
        },
      },
      {
        ref: 'getUsers',
        type: 'http-request',
        name: 'GET /users',
        description: 'Calls the mock server route in-process (callMode: internal).',
        x: 80,
        y: 280,
        // Internal calls match a mock route by config.targetMethod +
        // config.targetPath (NOT method/url, which drive real HTTP requests).
        config: {
          callMode: 'internal',
          targetMethod: 'GET',
          targetPath: '/users',
        },
      },
      {
        ref: 'postLogin',
        type: 'http-request',
        name: 'POST /login',
        description: 'Calls the mock /login route in-process.',
        x: 560,
        y: 280,
        config: {
          callMode: 'internal',
          targetMethod: 'POST',
          targetPath: '/login',
        },
      },
    ],
    // Edge from caller -> server tells the executor which server node to resolve
    // the internal call against (targetServerId is also inferred from the edge).
    edges: [
      { from: 'getUsers', to: 'server', label: 'GET /users', sourceHandle: 'top', targetHandle: 'left' },
      { from: 'postLogin', to: 'server', label: 'POST /login', sourceHandle: 'top', targetHandle: 'right' },
    ],
  };
}

function tagBuilder() {
  return {
    name: 'Tag & URL Builder',
    description: 'Demonstrates typed tags. A domain + pathname + param tag are assembled into a URL by the builder, and a form body is built from tags too — no hand-typed URLs.',
    tags: [
      { key: 'api_host', value: 'postman-echo.com', type: 'domain' },
      { key: 'endpoint', value: '/get', type: 'pathname' },
      // A param tag's VALUE is the full key=value query fragment (the URL builder
      // appends it verbatim); the `key` field is just a human label.
      { key: 'q', value: 'q=hello', type: 'param' },
      { key: 'note', value: 'tags are typed', type: 'body' },
    ],
    nodes: [
      {
        ref: 'http',
        type: 'http-request',
        name: 'Built URL request',
        description: 'URL assembled from domain + pathname + param tags via the URL builder.',
        x: 200,
        y: 160,
        config: (t) => ({
          urlMode: 'builder',
          urlParts: [t.api_host, t.endpoint, t.q],
          method: 'GET',
          headers: { Accept: 'application/json' },
          bodyMode: 'form',
          bodyForm: [{ key: 'note', value: '{{note}}', enabled: true }],
        }),
      },
    ],
    edges: [],
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
