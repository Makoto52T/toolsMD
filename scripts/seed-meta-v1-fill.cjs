/* Fill MetaBot V1 project (d9c16388-...) with remaining nodes + edges:
 *   Group J: Backend Routes (Express)  y=2750  (server nodes)
 *   Group K: extra Frontend Pages      y=3000  (server nodes)
 *   Group L: External Services         y=3250  (server nodes)
 * Idempotent: nodes matched by name, edges matched by (source,target).
 * Mirrors lib/store.ts addNode/addEdge INSERT shape (UUID id, JSON config).
 * Run: node scripts/seed-meta-v1-fill.cjs
 */
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const PID = 'd9c16388-65f6-40ea-abc7-a099875be0ef';

const backend = (host, port, framework, healthPath) => ({
  host, port, category: 'backend', language: 'javascript', framework, healthPath,
});
const frontend = (healthPath) => ({
  host: 'meta.ibot.bet', port: 3000, category: 'frontend', framework: 'Next.js', healthPath,
});

// [name, x, y, description, config]
const NODES = [
  // Group J: Backend Routes y=2750
  ['Route: /api/auth', 0, 2750, 'login/logout/refresh/me', backend('localhost', 8000, 'Express Router', '/api/auth/me')],
  ['Route: /api/bots', 300, 2750, 'CRUD bots (list/create/update/delete)', backend('localhost', 8000, 'Express Router', '/api-user/bots')],
  ['Route: /api/bets', 600, 2750, 'bet history + current session bets', backend('localhost', 8000, 'Express Router', '/api-user/user-transactions')],
  ['Route: /api/reports', 900, 2750, 'PnL summary, winrate by bot, daily stats', backend('localhost', 8000, 'Express Router', '/api/rounds/bot-rounds')],
  ['Route: /api/members', 1200, 2750, 'member profile, balance, bank accounts', backend('localhost', 8000, 'Express Router', '/api-admin/users')],
  ['Route: /api/casino', 1500, 2750, 'CasinoGame provider routes', backend('localhost', 8000, 'Express Router', '/api/camps')],
  ['Route: /api/ai', 1800, 2750, 'Claude AI chat (POST /chat, DELETE /history)', backend('localhost', 8000, 'Express Router', '/api/chat/message')],
  ['Route: /api/hermes', 2100, 2750, 'Hermes memory (POST /remember, GET /recall)', backend('localhost', 8000, 'Express Router', '/api/hermes/memory')],
  ['Route: /api/notify', 2400, 2750, 'notification count + latest', backend('localhost', 8000, 'Express Router', '/api-user/unacked-bots')],

  // Group K: extra Frontend Pages y=3000
  ['Page: Login', 0, 3000, 'user login page', frontend('/login')],
  ['Page: Members', 300, 3000, 'member management', frontend('/admin/users')],
  ['Page: Transactions', 600, 3000, 'deposit/withdraw history', frontend('/bots')],
  ['Page: Settings', 900, 3000, 'system settings + provider config', frontend('/admin/settings/provider')],

  // Group L: External Services y=3250
  ['MySQL DB', 0, 3250, 'DigitalOcean Managed MySQL', { host: 'DigitalOcean Managed DB', port: 3306, category: 'backend', framework: 'MySQL 8 (Sequelize)', healthPath: '/' }],
  ['Pusher Service', 300, 3250, 'pusher.com WebSocket cloud', { host: 'ws-mt1.pusher.com', port: 443, category: 'backend', framework: 'Pusher Cloud WS', healthPath: '/' }],
  ['Anthropic API', 600, 3250, 'api.anthropic.com Claude', { host: 'api.anthropic.com', port: 443, category: 'backend', framework: 'Anthropic REST', healthPath: '/v1/messages' }],
  ['Telegram Bot API', 900, 3250, 'api.telegram.org Bot API', { host: 'api.telegram.org', port: 443, category: 'backend', framework: 'Telegram Bot API', healthPath: '/' }],
  ['Puppeteer Browser', 1200, 3250, 'headless Chromium instance', { host: 'localhost', port: 0, category: 'backend', framework: 'Puppeteer / Chromium', healthPath: '/' }],
];

// [sourceName, targetName, label]
const EDGES = [
  // Backend Routes <- frontend consumers
  ['API Client (Axios)', 'Route: /api/auth', 'login/refresh'],
  ['API Client (Axios)', 'Route: /api/bots', 'CRUD'],
  ['API Client (Axios)', 'Route: /api/bets', 'bet history'],
  ['API Client (Axios)', 'Route: /api/reports', 'reports'],
  ['API Client (Axios)', 'Route: /api/members', 'members'],
  ['API Client (Axios)', 'Route: /api/notify', 'notify poll'],
  // Backend Routes -> downstream
  ['Route: /api/bots', 'Page: Bot Management', 'serves bot data'],
  ['Route: /api/bots', 'Zustand Store', 'bot state'],
  ['Route: /api/bets', 'Page: Bet History', 'serves bet rows'],
  ['upsertByRound', 'Route: /api/bets', 'round bets'],
  ['Route: /api/reports', 'Page: Reports', 'PnL/winrate'],
  ['Page: AI Chat', 'Route: /api/ai', 'chat request'],
  ['Route: /api/ai', 'Anthropic API', 'Claude call'],
  ['Route: /api/ai', 'Claude AI Chat', 'AI engine'],
  ['Route: /api/hermes', 'Claude AI Chat', 'memory ctx'],
  ['Route: /api/notify', 'Toast Notifications', 'notify push'],
  ['Route: /api/casino', 'Casino Manager', 'provider routes'],

  // Frontend Pages -> client/glue
  ['Page: Login', 'API Client (Axios)', 'login form'],
  ['Page: Login', 'Auth Guard', 'redirect'],
  ['Page: Members', 'API Client (Axios)', 'member calls'],
  ['Page: Members', 'Route: /api/members', 'member data'],
  ['Page: Transactions', 'API Client (Axios)', 'tx calls'],
  ['Page: Transactions', 'Route: /api/bets', 'tx history'],
  ['Page: Settings', 'API Client (Axios)', 'settings calls'],

  // External Services
  ['upsertByRound', 'MySQL DB', 'persist round'],
  ['Bot CRUD', 'MySQL DB', 'bots table'],
  ['Bet History', 'MySQL DB', 'tx table'],
  ['Report Generator', 'MySQL DB', 'aggregate query'],
  ['Pusher Subscribe', 'Pusher Service', 'WS subscribe'],
  ['Casino Manager', 'Pusher Service', 'WS workers'],
  ['Claude AI Chat', 'Anthropic API', 'messages API'],
  ['Telegram Alert', 'Telegram Bot API', 'sendMessage'],
  ['Puppeteer Login', 'Puppeteer Browser', 'headless login'],
];

async function main() {
  const pool = await mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  const [[{ cnt: projCnt }]] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM projects WHERE id=?', [PID]);
  if (!projCnt) throw new Error('project not found: ' + PID);

  // name -> id (existing + newly created)
  const [nodeRows] = await pool.query(
    'SELECT id, name FROM nodes WHERE project_id=?', [PID]);
  const byName = new Map(nodeRows.map((r) => [r.name, r.id]));

  const [edgeRows] = await pool.query(
    'SELECT source_node_id, target_node_id FROM edges WHERE project_id=?', [PID]);
  const haveEdge = new Set(edgeRows.map((e) => `${e.source_node_id}->${e.target_node_id}`));

  let addedNodes = 0, skippedNodes = 0;
  for (const [name, x, y, desc, config] of NODES) {
    if (byName.has(name)) { skippedNodes++; console.log('skip node:', name); continue; }
    const id = randomUUID();
    await pool.query(
      `INSERT INTO nodes (id, project_id, type, name, description, position_x, position_y, config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, PID, 'server', name, desc, x, y, JSON.stringify(config)]);
    byName.set(name, id);
    addedNodes++;
    console.log('add  node:', name);
  }

  let addedEdges = 0, skippedEdges = 0;
  for (const [srcName, tgtName, label] of EDGES) {
    const s = byName.get(srcName), t = byName.get(tgtName);
    if (!s) { console.warn('  ! missing source:', srcName); continue; }
    if (!t) { console.warn('  ! missing target:', tgtName); continue; }
    if (haveEdge.has(`${s}->${t}`)) { skippedEdges++; console.log('skip edge:', srcName, '->', tgtName); continue; }
    await pool.query(
      `INSERT INTO edges (id, project_id, source_node_id, target_node_id, label, source_handle, target_handle)
       VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
      [randomUUID(), PID, s, t, label || '']);
    haveEdge.add(`${s}->${t}`);
    addedEdges++;
    console.log('add  edge:', srcName, '->', tgtName);
  }

  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM nodes WHERE project_id=?', [PID]);
  const [[{ e }]] = await pool.query('SELECT COUNT(*) AS e FROM edges WHERE project_id=?', [PID]);
  console.log(`\nnodes +${addedNodes} (skip ${skippedNodes}) -> total ${n}`);
  console.log(`edges +${addedEdges} (skip ${skippedEdges}) -> total ${e}`);

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
