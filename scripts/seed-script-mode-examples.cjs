/* Idempotent seed for the 3 "Script Mode" example projects.
 *
 * Creates 3 templates OWNED BY toonteamm (is_template=1 + is_public_template=1)
 * that showcase the script-mode primitives call() / send() / return on real
 * public endpoints, so users can fork them and watch the behaviour live.
 *
 * Re-running deletes the previous copies (matched by name under toonteamm) and
 * recreates them, so it is safe to run repeatedly.
 *
 * Config shapes mirror lib/node-executor.ts exactly:
 *   - env:          { envTarget:'frontend'|'backend'|'both', vars:[{key,value,secret}] }
 *   - http-request: { url, method, headers, bodyMode, ... }
 *   - function:     { code } OR script mode { scriptEnabled:true, loopScript:'<js>' }
 *   - script ctx:   (env, inputs, tags, call, send, log) async body, returns output
 *
 * Run: node scripts/seed-script-mode-examples.cjs
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

const TOONTEAMM_ID = 'a37eead8-9a6d-49e9-abcd-7a0a0624f8b3';

// Stable project ids so the tutorial page can deep-link these examples without
// breaking each time the seed re-runs. (DELETE-by-name then INSERT-with-fixed-id
// keeps the same ids across re-seeds.)
const FIXED_IDS = {
  'ตัวอย่าง: Loop + Call + Return': '5c1b7000-0000-4000-a000-000000000001',
  'ตัวอย่าง: Call แล้ว Return': '5c1b7000-0000-4000-a000-000000000002',
  'ตัวอย่าง: Send (Fire & Forget)': '5c1b7000-0000-4000-a000-000000000003',
};

async function main() {
  const pool = await mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  const templates = [loopCallReturn(), callAndReturn(), sendFireForget()];
  const names = templates.map((t) => t.name);

  // Idempotent: wipe previous copies under toonteamm (CASCADE drops nodes/edges).
  const [del] = await pool.query(
    `DELETE FROM projects WHERE user_id = ? AND name IN (${names.map(() => '?').join(',')})`,
    [TOONTEAMM_ID, ...names]
  );
  console.log(`Removed ${del.affectedRows} existing example(s).`);

  const summary = [];
  for (const t of templates) {
    const projectId = FIXED_IDS[t.name] || randomUUID();
    const tagRows = (t.tags || []).map((tag) => ({ id: randomUUID(), ...tag }));
    const tagByKey = Object.fromEntries(tagRows.map((tg) => [tg.key, tg.id]));

    await pool.execute(
      `INSERT INTO projects (id, user_id, name, description, tags, is_template, is_public_template)
       VALUES (?, ?, ?, ?, ?, 1, 1)`,
      [projectId, TOONTEAMM_ID, t.name, t.description, JSON.stringify(tagRows)]
    );

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

  console.log('Seeded script-mode example templates (owner: toonteamm):');
  for (const s of summary) {
    console.log(`  - "${s.name}" (${s.id}): ${s.nodes} nodes, ${s.edges} edges, ${s.tags} tags`);
  }

  await pool.end();
}

// ---------------------------------------------------------------------------
// Project A — Loop + Call + Return
// ---------------------------------------------------------------------------
function loopCallReturn() {
  return {
    name: 'ตัวอย่าง: Loop + Call + Return',
    description:
      'Script Mode แบบครบวงจร: env เก็บ array USERS → สคริปต์วน for-of → await call() ยิง HTTP node ทุกรอบ → return รวมผลเป็น array. เปิด node "🔁 Loop Script" แล้วกด ▶ ดู output.',
    tags: [],
    nodes: [
      {
        ref: 'env',
        type: 'env',
        name: 'Config',
        description: 'ค่าตั้งต้น: รายชื่อ users (array) + base URL ของ API',
        x: 80,
        y: 80,
        config: {
          envTarget: 'both',
          vars: [
            { key: 'USERS', value: '["alice","bob","carol"]', secret: false },
          ],
        },
      },
      {
        ref: 'http',
        type: 'http-request',
        name: 'Get User Data',
        description: 'GET /users/1 — script เรียก node นี้ผ่าน call() ทุกรอบ',
        x: 460,
        y: 260,
        config: {
          url: 'https://jsonplaceholder.typicode.com/users/1',
          method: 'GET',
          headers: { Accept: 'application/json' },
          bodyMode: 'none',
        },
      },
      {
        ref: 'loop',
        type: 'function',
        name: '🔁 Loop Script',
        description: 'forEach user → call("Get User Data") → collect → return array',
        x: 460,
        y: 80,
        config: {
          scriptEnabled: true,
          loopScript: [
            '// วนลูปผ่านรายชื่อ users',
            'const users = env.USERS  // ["alice","bob","carol"]',
            'const results = []',
            '',
            'for (const username of users) {',
            "  // เรียก node \"Get User Data\" สำหรับแต่ละ user",
            "  const data = await call('Get User Data')",
            '',
            '  results.push({',
            '    user: username,',
            '    name: data.name,',
            '    email: data.email',
            '  })',
            '}',
            '',
            '// ส่ง results ทั้งหมดออกไป',
            'return results',
          ].join('\n'),
        },
      },
    ],
    edges: [
      { from: 'env', to: 'loop', label: 'env', sourceHandle: 'right', targetHandle: 'left' },
      { from: 'loop', to: 'http', label: 'call', sourceHandle: 'bottom', targetHandle: 'top' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Project B — Call แล้ว Return
// ---------------------------------------------------------------------------
function callAndReturn() {
  return {
    name: 'ตัวอย่าง: Call แล้ว Return',
    description:
      'รูปแบบ call → return → ส่งต่อ downstream: node "📞 Call & Return" เรียก HTTP แล้ว return object ที่ปรับแต่งแล้ว, node "📩 Receive Result" รับผ่าน inputs[] มาแสดง.',
    tags: [],
    nodes: [
      {
        ref: 'fetch',
        type: 'http-request',
        name: 'Fetch Todo',
        description: 'GET https://jsonplaceholder.typicode.com/todos/1',
        x: 80,
        y: 280,
        config: {
          url: 'https://jsonplaceholder.typicode.com/todos/1',
          method: 'GET',
          headers: { Accept: 'application/json' },
          bodyMode: 'none',
        },
      },
      {
        ref: 'call',
        type: 'function',
        name: '📞 Call & Return',
        description: 'await call("Fetch Todo") → ปรับแต่งข้อมูล → return',
        x: 80,
        y: 80,
        config: {
          scriptEnabled: true,
          loopScript: [
            '// เรียก node แล้วรับผลกลับมา',
            "const todo = await call('Fetch Todo')",
            '',
            '// ปรับแต่งข้อมูลก่อน return',
            'return {',
            '  taskId: todo.id,',
            '  task: todo.title,',
            '  done: todo.completed,',
            "  summary: `Task #${todo.id}: ${todo.completed ? '✅' : '⏳'} ${todo.title}`",
            '}',
          ].join('\n'),
        },
      },
      {
        ref: 'receive',
        type: 'function',
        name: '📩 Receive Result',
        description: 'รับ output จาก node ก่อนหน้าผ่าน inputs[] แล้ว return ข้อความ',
        x: 460,
        y: 80,
        config: {
          scriptEnabled: true,
          loopScript: [
            '// รับข้อมูลจาก node ก่อนหน้า',
            "const prev = inputs['📞 Call & Return']",
            '',
            '// แสดงผล',
            "return `ได้รับ: ${prev.summary}`",
          ].join('\n'),
        },
      },
    ],
    edges: [
      { from: 'call', to: 'fetch', label: 'call', sourceHandle: 'bottom', targetHandle: 'top' },
      { from: 'call', to: 'receive', label: 'result', sourceHandle: 'right', targetHandle: 'left' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Project C — Send (Fire & Forget)
// ---------------------------------------------------------------------------
function sendFireForget() {
  return {
    name: 'ตัวอย่าง: Send (Fire & Forget)',
    description:
      'await send("Notify") ยิง node ทิ้งโดยไม่รอผล — งานหลัก return ทันที. node "🔔 Main Process" ส่ง notification ไป "📨 Notify" (POST httpbin) แบบ fire-and-forget.',
    tags: [],
    nodes: [
      {
        ref: 'main',
        type: 'function',
        name: '🔔 Main Process',
        description: 'ทำงานหลัก → send("📨 Notify") ไม่รอ → return result ทันที',
        x: 80,
        y: 80,
        config: {
          scriptEnabled: true,
          loopScript: [
            '// ทำงานหลัก',
            "const result = { status: 'done', timestamp: Date.now() }",
            '',
            '// ส่ง notification ไปโดยไม่รอ',
            "await send('📨 Notify')",
            '',
            '// ทำงานต่อทันที ไม่รอ Notify เสร็จ',
            'return result',
          ].join('\n'),
        },
      },
      {
        ref: 'notify',
        type: 'http-request',
        name: '📨 Notify',
        description: 'POST https://httpbin.org/post — mock notification endpoint',
        x: 460,
        y: 80,
        config: {
          url: 'https://httpbin.org/post',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          bodyMode: 'raw',
          body: '{ "event": "notify", "from": "Main Process" }',
        },
      },
    ],
    edges: [
      { from: 'main', to: 'notify', label: 'send', sourceHandle: 'right', targetHandle: 'left' },
    ],
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
