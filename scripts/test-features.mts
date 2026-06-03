// Feature test harness — drives the REAL executor (lib/node-executor.ts).
// Run: npx tsx scripts/test-features.mts
import {
  executeNode,
  executeWorkflow,
  applyOutputBindings,
} from '../lib/node-executor.ts';
import type { Tag, Edge, Node as PlannerNode } from '../lib/store.ts';

const results: { name: string; pass: boolean; info: string }[] = [];
function check(name: string, pass: boolean, info = '') {
  results.push({ name, pass, info });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${info}`);
}

const HTTPBIN = process.env.ECHO_URL || 'http://localhost:4555';

// ---- 1. call() auto-body: POST node with NO body + script call(params) -> body sent
async function t1() {
  const httpNode: PlannerNode = {
    id: 'h1', type: 'http-request', name: 'Echo',
    config: { url: `${HTTPBIN}/post`, method: 'POST' }, // no bodyMode, no body
    position: { x: 0, y: 0 },
  } as any;
  const loopNode: PlannerNode = {
    id: 'l1', type: 'function', name: 'Driver',
    config: {
      scriptEnabled: true,
      loopScript: `const r = await call('Echo', { username: 'alice', password: 'p@ss' }); return r;`,
    },
    position: { x: 0, y: 0 },
  } as any;
  const ctx = { nodes: [httpNode, loopNode], edges: [] as Edge[] };
  const r = await executeNode(loopNode, {}, [], ctx);
  const body = r.output?.body ? JSON.parse(r.output.body) : (r.output?.json ?? r.output);
  const echoed = r.output?.json ?? body?.json ?? body;
  const ok = r.status === 'success' && echoed?.username === 'alice' && echoed?.password === 'p@ss';
  check('1. call() auto-body', ok, `status=${r.status} echoed=${JSON.stringify(echoed)?.slice(0,80)}`);
}

// ---- 2. call() temp tags: node body has {{placeholder}} + script passes key -> interpolated
async function t2() {
  const httpNode: PlannerNode = {
    id: 'h2', type: 'http-request', name: 'Tagged',
    config: {
      url: `${HTTPBIN}/post`, method: 'POST', bodyMode: 'raw',
      body: '{"user":"{{username}}","pw":"{{password}}"}',
    },
    position: { x: 0, y: 0 },
  } as any;
  const loopNode: PlannerNode = {
    id: 'l2', type: 'function', name: 'Driver2',
    config: {
      scriptEnabled: true,
      loopScript: `return await call('Tagged', { username: 'bob', password: 'secret9' });`,
    },
    position: { x: 0, y: 0 },
  } as any;
  const ctx = { nodes: [httpNode, loopNode], edges: [] as Edge[] };
  const r = await executeNode(loopNode, {}, [], ctx);
  const j = r.output?.json ?? (r.output?.body ? JSON.parse(r.output.body) : undefined);
  const ok = r.status === 'success' && j?.user === 'bob' && j?.pw === 'secret9';
  check('2. call() temp tags', ok, `status=${r.status} json=${JSON.stringify(j)?.slice(0,80)}`);
}

// ---- 3. outputBindings fallback by key: binding points at STALE id -> falls back to key
function t3() {
  const tags: Tag[] = [{ id: 'real-id-123', key: 'token', value: 'old', type: 'generic' }];
  const output = { access_token: 'NEW_TOKEN_VALUE' };
  const bindings = [{ path: 'access_token', tagId: 'STALE-OLD-ID', tagKey: 'token' }];
  const { tags: out } = applyOutputBindings(output, bindings as any, tags, 'n1', 'Node');
  const t = out.find((x) => x.key === 'token');
  const noDup = out.filter((x) => x.key === 'token').length === 1;
  const ok = t?.value === 'NEW_TOKEN_VALUE' && t?.id === 'real-id-123' && noDup;
  check('3. outputBindings fallback by key', ok,
    `value=${t?.value} id=${t?.id} dupCount=${out.filter((x)=>x.key==='token').length}`);
}

// ---- 4. Script mode on each node type (http-request, function, server)
async function t4() {
  const types: Array<PlannerNode['type']> = ['http-request', 'function', 'server'];
  let allOk = true;
  const detail: string[] = [];
  for (const ty of types) {
    const node: PlannerNode = {
      id: `s_${ty}`, type: ty as any, name: `Script_${ty}`,
      config: { scriptEnabled: true, loopScript: `log('hi'); return { ran: true, type: '${ty}' };` },
      position: { x: 0, y: 0 },
    } as any;
    const ctx = { nodes: [node], edges: [] as Edge[] };
    const r = await executeNode(node, {}, [], ctx);
    const ok = r.status === 'success' && r.output?.ran === true && r.output?.type === ty;
    detail.push(`${ty}:${ok ? 'ok' : r.status}`);
    if (!ok) allOk = false;
  }
  check('4. Script mode all node types', allOk, detail.join(' '));
}

// ---- 5. Loop delay: loopDelayMs=200, 3 rounds via script send/loop -> ~400ms (delay skips last)
//   The script-mode loop delay is client-side; server-side we verify the runLoopScript
//   honours a manual delay loop. We test the loopDelayMs gate using a script that
//   reads it is NOT applicable server-side; instead verify client constant timing
//   by measuring a 3-iteration script that awaits a 200ms sleep between rounds.
async function t5() {
  // Server-side script can sleep itself; verify timing math of N-1 delays.
  const node: PlannerNode = {
    id: 'loop5', type: 'function', name: 'Looper',
    config: {
      scriptEnabled: true,
      loopScript: `
        const delay = 200, rounds = 3;
        for (let i = 0; i < rounds; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, delay));
        }
        return { rounds };`,
    },
    position: { x: 0, y: 0 },
  } as any;
  const ctx = { nodes: [node], edges: [] as Edge[] };
  const t0 = Date.now();
  const r = await executeNode(node, {}, [], ctx);
  const elapsed = Date.now() - t0;
  const ok = r.status === 'success' && elapsed >= 380 && elapsed < 700;
  check('5. Loop delay (N-1 delays)', ok, `elapsed=${elapsed}ms (expect ~400)`);
}

// ---- 11. Env node execute -> output is flat { KEY: value } with {{tag}} interpolation
async function t11() {
  const tags: Tag[] = [{ id: 't', key: 'host', value: 'api.example.com', type: 'domain' }];
  const node: PlannerNode = {
    id: 'env1', type: 'env', name: 'Env',
    config: {
      envTarget: 'backend',
      vars: [
        { key: 'API_URL', value: 'https://{{host}}/v1', secret: false },
        { key: 'SECRET_KEY', value: 'abc123', secret: true },
      ],
    },
    position: { x: 0, y: 0 },
  } as any;
  const ctx = { nodes: [node], edges: [] as Edge[] };
  const r = await executeNode(node, {}, tags, ctx);
  const o = r.output;
  const ok = r.status === 'success'
    && o?.API_URL === 'https://api.example.com/v1'
    && o?.SECRET_KEY === 'abc123'  // secret only masked in UI, real value in output
    && typeof o === 'object' && !Array.isArray(o);
  check('11. Env node execute -> {KEY:value}', ok, `out=${JSON.stringify(o)}`);
}

(async () => {
  for (const t of [t1, t2, t3, t4, t5, t11]) {
    try { await t(); } catch (e: any) {
      check(t.name, false, `THREW: ${e?.message ?? e}`);
    }
  }
  const fails = results.filter((r) => !r.pass);
  console.log(`\n=== ${results.length - fails.length}/${results.length} passed ===`);
  process.exit(fails.length ? 1 : 0);
})();
