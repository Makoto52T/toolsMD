// Prod API verification (cookie userId auth) for Body editor + Realtime mock.
const BASE = 'https://tools-md.vercel.app';
const EMAIL = `bodyrt+${Date.now()}@test.local`;

let cookie = '';
async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
  });
  const setC = res.headers.get('set-cookie');
  if (setC) cookie = setC.split(';')[0];
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  :: ' + extra : ''}`);
};

let projectId, userId;
async function main() {
  // login -> sets userId cookie + creates user
  const login = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, name: 'BodyRT Test' }) });
  userId = login.json?.user?.id ?? login.json?.id;
  check('login', login.status === 200 && cookie.includes('userId'), `cookie=${cookie} uid=${userId}`);

  const proj = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'verify-bodyrt' }) });
  projectId = proj.json?.id;
  check('create project', !!projectId, `id=${projectId}`);

  // ---- tags: access_token (will be set), username ----
  const tagsRes = await api(`/api/projects/${projectId}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tags: [
      { id: 't-token', key: 'access_token', value: 'TOK-LIVE-123', type: 'generic' },
      { id: 't-user', key: 'username', value: 'toon', type: 'generic' },
      { id: 't-room', key: 'roomId', value: 'R42', type: 'generic' },
    ]}),
  });
  check('seed tags', tagsRes.status === 200, JSON.stringify(tagsRes.json).slice(0,120));

  const mkNode = async (cfg) => {
    const r = await api(`/api/projects/${projectId}/nodes`, {
      method: 'POST',
      body: JSON.stringify(cfg),
    });
    return r.json?.id ? r.json : r.json?.node ?? r.json;
  };
  const exec = async (nodeId) => api(`/api/projects/${projectId}/nodes/${nodeId}/execute`, { method: 'POST' });

  // ============ FEATURE A: Body editor ============
  // A1 form mode: enabled rows -> body; one disabled row skipped; one live {{tag}}
  const httpForm = await mkNode({
    type: 'http-request', name: 'form-post', positionX: 100, positionY: 100,
    config: {
      url: 'https://postman-echo.com/post', method: 'POST',
      bodyMode: 'form',
      bodyForm: [
        { id: 'b1', key: 'username', value: 'staticUser', enabled: true, tagId: null },
        { id: 'b2', key: 'token', value: '{{access_token}}', enabled: true, tagId: 't-token' },
        { id: 'b3', key: 'skipme', value: 'nope', enabled: false, tagId: null },
      ],
    },
  });
  check('create form-post node', !!httpForm.id, `id=${httpForm.id}`);
  const r1 = await exec(httpForm.id);
  const echoed1 = r1.json?.result?.output?.json ?? r1.json?.result?.output?.data;
  check('A1 form: enabled rows present', echoed1?.username === 'staticUser' && echoed1?.token === 'TOK-LIVE-123', JSON.stringify(echoed1));
  check('A1 form: live {{tag}} resolved (not snapshot)', echoed1?.token === 'TOK-LIVE-123', `token=${echoed1?.token}`);
  check('A1 form: disabled row skipped', echoed1 && !('skipme' in echoed1), JSON.stringify(echoed1));

  // A1b: change tag value -> live reference picks up new value
  await api(`/api/projects/${projectId}/tags`, { method: 'PUT', body: JSON.stringify({ tags: [
    { id: 't-token', key: 'access_token', value: 'TOK-CHANGED-999', type: 'generic' },
    { id: 't-user', key: 'username', value: 'toon', type: 'generic' },
    { id: 't-room', key: 'roomId', value: 'R42', type: 'generic' },
  ]})});
  const r1b = await exec(httpForm.id);
  const echoed1b = r1b.json?.result?.output?.json ?? r1b.json?.result?.output?.data;
  check('A1b form: live ref reflects updated tag', echoed1b?.token === 'TOK-CHANGED-999', `token=${echoed1b?.token}`);

  // A2 none mode: no body sent
  const httpNone = await mkNode({
    type: 'http-request', name: 'none-post', positionX: 100, positionY: 250,
    config: { url: 'https://postman-echo.com/post', method: 'POST', bodyMode: 'none', body: { should: 'not-send' } },
  });
  const r2 = await exec(httpNone.id);
  const out2 = r2.json?.result?.output;
  const j2 = out2?.json;
  check('A2 none: empty body', (j2 == null || Object.keys(j2 || {}).length === 0), `json=${JSON.stringify(j2)}`);

  // A3 raw mode still works (legacy default + explicit)
  const httpRaw = await mkNode({
    type: 'http-request', name: 'raw-post', positionX: 100, positionY: 400,
    config: { url: 'https://postman-echo.com/post', method: 'POST', bodyMode: 'raw', body: { hello: '{{username}}', fixed: 'x' } },
  });
  const r3 = await exec(httpRaw.id);
  const j3 = r3.json?.result?.output?.json;
  check('A3 raw: interpolated + fixed', j3?.hello === 'toon' && j3?.fixed === 'x', JSON.stringify(j3));

  // A3b raw back-compat: NO bodyMode at all (old node) -> raw behaviour
  const httpLegacy = await mkNode({
    type: 'http-request', name: 'legacy-post', positionX: 100, positionY: 550,
    config: { url: 'https://postman-echo.com/post', method: 'POST', body: { legacy: '{{username}}' } },
  });
  const r3b = await exec(httpLegacy.id);
  const j3b = r3b.json?.result?.output?.json;
  check('A3b back-compat: no bodyMode = raw', j3b?.legacy === 'toon', JSON.stringify(j3b));

  // ============ FEATURE B: Realtime mock ============
  // server node with socketio + pusher events
  const server = await mkNode({
    type: 'server', name: 'RTServer', positionX: 500, positionY: 100,
    config: {
      category: 'backend', language: 'JavaScript', framework: 'Express',
      realtime: {
        transport: 'Socket.io',
        events: [
          { id: 'e-chat', channel: 'room-{{roomId}}', event: 'chat:message', payload: { user: '{{username}}', text: 'hello', token: '{{access_token}}' } },
          { id: 'e-pusher', channel: 'private-orders', event: 'order:new', payload: { orderId: 7, by: '{{username}}' } },
        ],
      },
    },
  });
  check('create server node w/ realtime', !!server.id, `id=${server.id}`);

  // caller (function) -> edge -> server, targetKind realtime, event e-chat
  const caller = await mkNode({
    type: 'function', name: 'rt-caller', positionX: 300, positionY: 100,
    config: { callMode: 'internal', targetKind: 'realtime', targetServerId: server.id, targetEventId: 'e-chat', targetEventName: 'chat:message' },
  });
  const edge = await api(`/api/projects/${projectId}/edges`, { method: 'POST', body: JSON.stringify({ sourceNodeId: caller.id, targetNodeId: server.id, label: '' }) });
  check('create caller + edge', !!caller.id && (edge.status === 200 || edge.status === 201), `edge=${edge.status}`);

  const rB = await exec(caller.id);
  const outB = rB.json?.result?.output;
  const rtMeta = rB.json?.result?.realtime;
  check('B1 socketio: payload resolved {{tag}}', outB?.user === 'toon' && outB?.text === 'hello' && outB?.token === 'TOK-CHANGED-999', JSON.stringify(outB));
  check('B1 socketio: realtime meta virtual + transport + event', rtMeta?.virtual === true && rtMeta?.transport === 'Socket.io' && rtMeta?.event === 'chat:message', JSON.stringify(rtMeta));
  check('B1 socketio: channel interpolated', rtMeta?.channel === 'room-R42', `channel=${rtMeta?.channel}`);

  // switch caller to pusher event
  await api(`/api/projects/${projectId}/nodes/${caller.id}`, { method: 'PUT', body: JSON.stringify({
    config: { callMode: 'internal', targetKind: 'realtime', targetServerId: server.id, targetEventId: 'e-pusher', targetEventName: 'order:new' },
  })});
  const rB2 = await exec(caller.id);
  const outB2 = rB2.json?.result?.output;
  const rtMeta2 = rB2.json?.result?.realtime;
  check('B2 pusher: payload resolved', outB2?.orderId === 7 && outB2?.by === 'toon', JSON.stringify(outB2));
  check('B2 pusher: meta event order:new', rtMeta2?.event === 'order:new', JSON.stringify(rtMeta2));

  // B3 chain: realtime payload -> output binding -> tag -> next http uses it
  await api(`/api/projects/${projectId}/nodes/${caller.id}`, { method: 'PUT', body: JSON.stringify({
    config: { callMode: 'internal', targetKind: 'realtime', targetServerId: server.id, targetEventId: 'e-chat', targetEventName: 'chat:message',
      outputBindings: [{ path: 'token', tagId: 't-bound', tagKey: 'bound_from_rt' }] },
  })});
  const rB3 = await exec(caller.id);
  check('B3 realtime output binding sets tag', (rB3.json?.tags || []).some(t => t.key === 'bound_from_rt' && t.value === 'TOK-CHANGED-999'),
    JSON.stringify((rB3.json?.tags||[]).find(t=>t.key==='bound_from_rt')));

  // ============ REGRESSION ============
  // REST mock still works
  const restServer = await mkNode({ type: 'server', name: 'RestSrv', positionX: 900, positionY: 100,
    config: { category: 'backend', language: 'JavaScript', framework: 'Express', serveMode: 'mock',
      routes: [{ id: 'r-login', method: 'POST', path: '/login', statusCode: 200, response: { access_token: 'mock-xyz', who: '{{username}}' } }] } });
  const restCaller = await mkNode({ type: 'function', name: 'rest-caller', positionX: 700, positionY: 100,
    config: { callMode: 'internal', targetKind: 'rest', targetServerId: restServer.id, targetMethod: 'POST', targetPath: '/login' } });
  await api(`/api/projects/${projectId}/edges`, { method: 'POST', body: JSON.stringify({ sourceNodeId: restCaller.id, targetNodeId: restServer.id, label: '' }) });
  const rReg = await exec(restCaller.id);
  check('REG REST mock still works', rReg.json?.result?.output?.access_token === 'mock-xyz' && rReg.json?.result?.mock?.virtual === true, JSON.stringify(rReg.json?.result?.output));

  // plain http GET still works
  const getNode = await mkNode({ type: 'http-request', name: 'get', positionX: 100, positionY: 700,
    config: { url: 'https://postman-echo.com/get?x={{username}}', method: 'GET' } });
  const rGet = await exec(getNode.id);
  check('REG plain GET works', rGet.json?.result?.output?.args?.x === 'toon', JSON.stringify(rGet.json?.result?.output?.args));

  // header interpolation still works
  const hdrNode = await mkNode({ type: 'http-request', name: 'hdr', positionX: 100, positionY: 850,
    config: { url: 'https://postman-echo.com/headers', method: 'GET', headers: { Authorization: 'Bearer {{access_token}}' } } });
  const rHdr = await exec(hdrNode.id);
  const hauth = rHdr.json?.result?.output?.headers?.authorization;
  check('REG header interpolation', hauth === 'Bearer TOK-CHANGED-999', `auth=${hauth}`);

  // ---- summary ----
  const fails = results.filter(r => !r.pass);
  console.log(`\n==== ${results.length - fails.length}/${results.length} PASS ====`);
  if (fails.length) { console.log('FAILURES:', fails.map(f=>f.name).join(', ')); process.exitCode = 1; }
  console.log(`PROJECT_ID=${projectId}`);
  console.log(`USER_EMAIL=${EMAIL}`);
}
main().catch(e => { console.error('ERROR', e); process.exitCode = 1; });
