import type { Chapter } from './types';

// The 8 tutorial chapters. Each step carries a *complete* Scene; consecutive
// scenes share node ids so the MockCanvas tweens positions/opacity between them.
// Stories mirror real TMD flows (e.g. the SexyGame login → token chain).

// ---- Ch.1 Canvas Basics ----------------------------------------------------
const canvasBasics: Chapter = {
  id: 'canvas',
  num: 1,
  icon: '🗺️',
  title: 'Canvas Basics',
  blurb: 'Pan, zoom, select, multi-select',
  steps: [
    {
      label: 'แคนวาสเปล่า — ที่วางทุกอย่าง',
      detail:
        'ทุกโปรเจกต์คือแคนวาสหนึ่งผืน คุณวาง node เอง ไม่มี auto-layout — ตำแหน่งที่วางจะถูกบันทึกไว้ตามนั้น',
      scene: {
        nodes: [
          { id: 'a', type: 'http-request', label: 'Login', subtitle: 'POST /login', x: 30, y: 38 },
          { id: 'b', type: 'function', label: 'Parse', subtitle: 'return token', x: 70, y: 62 },
        ],
        hint: 'ลากพื้นที่ว่างเพื่อ Pan',
      },
    },
    {
      label: 'Pan — ลากพื้นที่ว่างเลื่อนมุมมอง',
      detail: 'จับที่ว่างแล้วลาก เพื่อเลื่อนทั้งบอร์ด เหมาะกับ flow ที่ใหญ่เกินจอ',
      scene: {
        nodes: [
          { id: 'a', type: 'http-request', label: 'Login', subtitle: 'POST /login', x: 42, y: 30 },
          { id: 'b', type: 'function', label: 'Parse', subtitle: 'return token', x: 82, y: 54 },
        ],
        cursor: { x: 20, y: 70 },
        hint: 'Pan →',
      },
    },
    {
      label: 'Zoom — scroll หรือ pinch',
      detail: 'เลื่อน scroll (หรือ pinch บนมือถือ) เพื่อซูมเข้า/ออก ดูภาพรวมหรือซูมแก้ทีละ node',
      scene: {
        nodes: [
          { id: 'a', type: 'http-request', label: 'Login', subtitle: 'POST /login', x: 34, y: 40 },
          { id: 'b', type: 'function', label: 'Parse', subtitle: 'return token', x: 66, y: 58 },
        ],
        hint: '🔍 Zoom 120%',
      },
    },
    {
      label: 'เลือก node — คลิกเดียว',
      detail: 'คลิก node เพื่อเลือก (ขอบไฮไลต์สีส้ม) แล้วลากย้าย หรือกด Delete เพื่อลบ',
      scene: {
        nodes: [
          { id: 'a', type: 'http-request', label: 'Login', subtitle: 'POST /login', x: 34, y: 40, selected: true },
          { id: 'b', type: 'function', label: 'Parse', subtitle: 'return token', x: 66, y: 58 },
        ],
        cursor: { x: 34, y: 40, click: true },
      },
    },
    {
      label: 'Multi-select — Shift + ลากกรอบ',
      detail: 'กด Shift ค้างแล้วลากกรอบครอบหลาย node เพื่อเลือกพร้อมกัน ย้าย/ลบเป็นกลุ่มได้',
      scene: {
        nodes: [
          { id: 'a', type: 'http-request', label: 'Login', subtitle: 'POST /login', x: 34, y: 40, selected: true },
          { id: 'b', type: 'function', label: 'Parse', subtitle: 'return token', x: 66, y: 58, selected: true },
        ],
        marquee: { x: 18, y: 22, w: 64, h: 52 },
        hint: 'Shift + drag = เลือกหลายอัน',
      },
    },
  ],
};

// ---- Ch.2 HTTP Request Node ------------------------------------------------
const httpNode: Chapter = {
  id: 'http',
  num: 2,
  icon: '↔️',
  title: 'HTTP Request Node',
  blurb: 'URL, headers, body, execute',
  steps: [
    {
      label: 'สร้าง HTTP node',
      detail:
        'node ↔️ ยิง HTTP จริง — ตัวอย่างนี้เรียก SexyGame login API ขอบจะ pulse สีส้มบอกว่าเป็น node ใหม่',
      scene: {
        nodes: [{ id: 'h', type: 'http-request', label: 'SexyGame Login', subtitle: 'POST', x: 32, y: 48, glow: true }],
      },
    },
    {
      label: 'ใส่ URL (รองรับ {{tag}})',
      detail:
        'แท็บ Request: พิมพ์ URL ได้เลย ไม่มี scheme จะเติม https:// ให้ และแทรก {{tag}} ตรงไหนก็ได้',
      scene: {
        nodes: [{ id: 'h', type: 'http-request', label: 'SexyGame Login', subtitle: 'POST', x: 28, y: 48 }],
        sheet: {
          title: 'SexyGame Login',
          tabs: ['Request', 'Headers', 'Body', 'Output', 'Preview'],
          activeTab: 'Request',
          fields: [
            { label: 'Method', value: 'POST' },
            { label: 'URL', value: '{{domain}}/api/login', typing: true, highlight: true },
          ],
        },
      },
    },
    {
      label: 'Headers — แทรก token',
      detail: 'แท็บ Headers: ทุก value interpolate ได้ เช่น Authorization: Bearer {{token}}',
      scene: {
        nodes: [{ id: 'h', type: 'http-request', label: 'SexyGame Login', subtitle: 'POST', x: 28, y: 48 }],
        sheet: {
          title: 'SexyGame Login',
          tabs: ['Request', 'Headers', 'Body', 'Output', 'Preview'],
          activeTab: 'Headers',
          fields: [
            { label: 'Content-Type', value: 'application/json' },
            { label: 'X-Client-Version', value: 'lo.v2.0.25', typing: true, highlight: true },
          ],
        },
      },
    },
    {
      label: 'Body — raw / form / none',
      detail: 'แท็บ Body: เลือก raw (JSON), form (key/value) หรือ none แต่ละ row ดึงค่าจาก tag ได้',
      scene: {
        nodes: [{ id: 'h', type: 'http-request', label: 'SexyGame Login', subtitle: 'POST', x: 28, y: 48 }],
        sheet: {
          title: 'SexyGame Login',
          tabs: ['Request', 'Headers', 'Body', 'Output', 'Preview'],
          activeTab: 'Body',
          code: '{\n  "username": "{{user}}",\n  "password": "{{pass}}"\n}',
        },
      },
    },
    {
      label: 'กด Execute',
      detail: 'รัน node เดี่ยวเพื่อทดสอบ — executor resolve tag ทั้งหมดแล้วยิง request จริง',
      scene: {
        nodes: [
          { id: 'h', type: 'http-request', label: 'SexyGame Login', subtitle: 'POST', x: 28, y: 48, badge: 'running…' },
        ],
        cursor: { x: 28, y: 48, click: true },
      },
    },
    {
      label: 'ดู Output — n8n style',
      detail: 'panel ขวาแสดง status + เวลา + JSON body แบบ n8n ได้ token กลับมาพร้อมใช้ต่อ',
      scene: {
        nodes: [{ id: 'h', type: 'http-request', label: 'SexyGame Login', subtitle: 'POST', x: 22, y: 48 }],
        output: {
          status: 200,
          statusText: 'OK',
          ms: 412,
          slideIn: true,
          body: '{\n  "token": "eyJhbGci…",\n  "jsessionid": "9f3a…",\n  "ok": true\n}',
        },
      },
    },
  ],
};

// ---- Ch.3 Function Node ----------------------------------------------------
const functionNode: Chapter = {
  id: 'function',
  num: 3,
  icon: '⚡',
  title: 'Function Node',
  blurb: 'เขียน JS, inputs/outputs, filter',
  steps: [
    {
      label: 'สร้าง Function node',
      detail: 'node ⚡ รัน JavaScript ดิบ ใช้ parse / filter / reshape ผลลัพธ์จาก step ก่อนหน้า',
      scene: {
        nodes: [{ id: 'f', type: 'function', label: 'Filter active', x: 36, y: 48, glow: true }],
      },
    },
    {
      label: 'inputs = output ของ step ก่อน',
      detail:
        'body ของ node คือตัวฟังก์ชัน รับ argument ชื่อ inputs (ผลลัพธ์ step ก่อน) แล้ว return ค่าใหม่',
      scene: {
        nodes: [{ id: 'f', type: 'function', label: 'Filter active', x: 30, y: 48 }],
        sheet: {
          title: 'Filter active',
          code: '// inputs = previous step output\nconst items = inputs.data || [];\nreturn items.filter(x => x.active);',
        },
      },
    },
    {
      label: 'เชื่อมจาก HTTP → Function',
      detail: 'ลาก edge จาก HTTP node มา Function เพื่อให้ output ของ HTTP ไหลเข้า inputs',
      scene: {
        nodes: [
          { id: 'h', type: 'http-request', label: 'Get rooms', subtitle: 'GET /rooms', x: 26, y: 42 },
          { id: 'f', type: 'function', label: 'Filter active', x: 70, y: 58 },
        ],
        edges: [{ id: 'e', from: 'h', to: 'f', label: 'inputs', draw: true }],
      },
    },
    {
      label: 'รัน — กรองเหลือเฉพาะ active',
      detail: 'output ของ Function กลายเป็น inputs ของ step ถัดไปได้เรื่อยๆ ตลอด chain',
      scene: {
        nodes: [
          { id: 'h', type: 'http-request', label: 'Get rooms', subtitle: 'GET /rooms', x: 26, y: 42 },
          { id: 'f', type: 'function', label: 'Filter active', x: 70, y: 58, badge: 'running…' },
        ],
        edges: [{ id: 'e', from: 'h', to: 'f', label: 'inputs' }],
        output: {
          slideIn: true,
          body: '[\n  { "id": 3, "active": true },\n  { "id": 6, "active": true }\n]',
        },
      },
    },
  ],
};

// ---- Ch.4 Server Node ------------------------------------------------------
const serverNode: Chapter = {
  id: 'server',
  num: 4,
  icon: '🖥️',
  title: 'Server Node',
  blurb: 'health check, mock API, internal call',
  steps: [
    {
      label: 'สร้าง Server node',
      detail:
        'node 🖥️ แทน service ที่รันอยู่จริง เลือก frontend/backend → ภาษา → framework (icon/สีเปลี่ยนตาม stack)',
      scene: {
        nodes: [
          {
            id: 's',
            type: 'server',
            label: 'API',
            subtitle: 'Go · Gin :8000',
            x: 38, y: 48, glow: true,
            config: { category: 'backend', language: 'Go', framework: 'Gin' },
          },
        ],
      },
    },
    {
      label: 'Health check — ping จริง',
      detail: 'ตั้ง host/port แล้วรัน node จะ ping service จริง รายงานว่าติดต่อได้ไหม + เวลา',
      scene: {
        nodes: [
          {
            id: 's', type: 'server', label: 'API', subtitle: 'Go · Gin :8000', x: 32, y: 48,
            config: { category: 'backend', language: 'Go', framework: 'Gin' }, badge: 'pinging…',
          },
        ],
        output: { status: 200, statusText: 'UP', ms: 23, slideIn: true, body: '{ "reachable": true, "ms": 23 }' },
      },
    },
    {
      label: 'Mock REST routes',
      detail: 'นิยาม route (method + path + status + JSON) บน server node ได้เลย ใช้ทดลอง flow ก่อน backend จริงเสร็จ',
      scene: {
        nodes: [
          {
            id: 's', type: 'server', label: 'API', subtitle: 'Go · Gin :8000', x: 32, y: 48,
            config: { category: 'backend', language: 'Go', framework: 'Gin' },
          },
        ],
        sheet: {
          title: 'API · Mock routes',
          code: 'GET  /users  → 200 { "users":[…] }\nPOST /login  → 200 { "token":"mock-jwt" }',
        },
      },
    },
    {
      label: 'Internal call — เรียกในตัว ไม่ต้องมี network',
      detail:
        'ลาก edge มา server แล้วตั้ง callMode: internal node ต้นทางจะเรียก mock route ในโปรเซสเดียวกัน — login chain ทำงานได้ทันที',
      scene: {
        nodes: [
          { id: 'c', type: 'http-request', label: 'Login', subtitle: 'callMode: internal', x: 24, y: 42 },
          {
            id: 's', type: 'server', label: 'API', subtitle: 'POST /login', x: 72, y: 58,
            config: { category: 'backend', language: 'Go', framework: 'Gin' },
          },
        ],
        edges: [{ id: 'e', from: 'c', to: 's', label: 'internal', draw: true }],
        output: { status: 200, statusText: 'OK', ms: 2, slideIn: true, body: '{ "token": "mock-jwt" }' },
      },
    },
  ],
};

// ---- Ch.5 Puppeteer Node ---------------------------------------------------
const puppeteerNode: Chapter = {
  id: 'puppeteer',
  num: 5,
  icon: '🎭',
  title: 'Puppeteer Node',
  blurb: 'browser automation, cookie extraction',
  steps: [
    {
      label: 'สร้าง Puppeteer node',
      detail: 'node 🎭 แทนขั้น headless-browser เช่นเปิดหน้าเว็บแล้วดึง token/cookie ที่ API ตรงๆ ไม่ให้',
      scene: {
        nodes: [{ id: 'p', type: 'puppeteer', label: 'Grab session', subtitle: 'login page', x: 38, y: 48, glow: true }],
      },
    },
    {
      label: 'ตั้ง target + action',
      detail: 'ระบุ URL ที่จะเปิด และ action (goto, click, evaluate) เพื่อจำลอง browser flow',
      scene: {
        nodes: [{ id: 'p', type: 'puppeteer', label: 'Grab session', subtitle: 'login page', x: 30, y: 48 }],
        sheet: {
          title: 'Grab session',
          fields: [
            { label: 'Goto', value: 'https://ksg.bigtiger.live/login', typing: true },
            { label: 'Action', value: 'extract cookie ci_session', highlight: true },
          ],
        },
      },
    },
    {
      label: 'Output binding → tag',
      detail: 'ผูกค่าที่ดึงได้ (เช่น cookie) เข้า tag เพื่อให้ step ถัดไปเอาไปใส่ header ต่อ',
      scene: {
        nodes: [
          { id: 'p', type: 'puppeteer', label: 'Grab session', subtitle: 'login page', x: 26, y: 42 },
          { id: 'h', type: 'http-request', label: 'Call API', subtitle: 'Cookie: {{ci_session}}', x: 72, y: 58 },
        ],
        edges: [{ id: 'e', from: 'p', to: 'h', label: 'ci_session', draw: true }],
      },
    },
    {
      label: 'รัน — ได้ cookie กลับมา',
      detail: 'ในสภาพแวดล้อมนี้ Puppeteer คืนผลจำลอง แต่ config + binding ถูกบันทึกครบพร้อมรันจริง',
      scene: {
        nodes: [
          { id: 'p', type: 'puppeteer', label: 'Grab session', subtitle: 'login page', x: 26, y: 42, badge: 'running…' },
          { id: 'h', type: 'http-request', label: 'Call API', subtitle: 'Cookie: {{ci_session}}', x: 72, y: 58 },
        ],
        edges: [{ id: 'e', from: 'p', to: 'h', label: 'ci_session' }],
        output: { slideIn: true, body: '{ "ci_session": "a7f2…", "bound": "ci_session" }' },
      },
    },
  ],
};

// ---- Ch.6 Env Node ---------------------------------------------------------
const envNode: Chapter = {
  id: 'env',
  num: 6,
  icon: '⚙️',
  title: 'Env Node',
  blurb: 'env vars, Frontend/Backend/Both, secrets',
  steps: [
    {
      label: 'สร้าง Env node',
      detail: 'node ⚙️ เก็บ environment variables ของ stack — เอกสาร config ที่ service ต้องใช้ ไว้ที่เดียวบนแคนวาส',
      scene: {
        nodes: [{ id: 'e', type: 'env', label: 'Backend env', subtitle: '3 vars', x: 38, y: 48, glow: true }],
      },
    },
    {
      label: 'เลือก target: Frontend / Backend / Both',
      detail: 'กำหนดว่าตัวแปรชุดนี้เป็นของฝั่งไหน เพื่อแยกชัดว่าค่าใดไป build frontend หรือ runtime backend',
      scene: {
        nodes: [{ id: 'e', type: 'env', label: 'Backend env', subtitle: '3 vars', x: 30, y: 48 }],
        sheet: {
          title: 'Backend env',
          tabs: ['Frontend', 'Backend', 'Both'],
          activeTab: 'Backend',
          fields: [
            { label: 'PORT', value: '3000' },
            { label: 'NODE_ENV', value: 'production', highlight: true },
          ],
        },
      },
    },
    {
      label: 'Secret masking',
      detail: 'ติ๊ก secret ที่ row ไหน ค่าจะถูกมาสก์เป็น •••••• ใน UI ทั้งหมด (แต่ตอนรันยัง resolve ค่าจริง)',
      scene: {
        nodes: [{ id: 'e', type: 'env', label: 'Backend env', subtitle: '3 vars', x: 30, y: 48 }],
        sheet: {
          title: 'Backend env',
          tabs: ['Frontend', 'Backend', 'Both'],
          activeTab: 'Backend',
          fields: [
            { label: 'PORT', value: '3000' },
            { label: 'DATABASE_URL  🔒 secret', value: 'mysql://root:pass@db/app', secret: true, highlight: true },
          ],
        },
      },
    },
    {
      label: 'รัน — ได้ { KEY: value } + {{tag}} resolve',
      detail:
        'ค่ารองรับ {{tag}} (เช่น mysql://{{domain}}/db) รัน node แล้วได้ object แบนๆ ผูกเข้า tag ป้อน step ต่อได้',
      scene: {
        nodes: [{ id: 'e', type: 'env', label: 'Backend env', subtitle: '3 vars', x: 26, y: 48, badge: 'running…' }],
        output: {
          slideIn: true,
          body: '{\n  "PORT": "3000",\n  "NODE_ENV": "production",\n  "DATABASE_URL": "mysql://…/app"\n}',
        },
      },
    },
  ],
};

// ---- Ch.7 Loop Mode --------------------------------------------------------
const loopMode: Chapter = {
  id: 'loop',
  num: 7,
  icon: '🔁',
  title: 'Loop Mode',
  blurb: 'rounds, delay, stopCondition',
  steps: [
    {
      label: 'Loop คือ option บน node เดิม',
      detail: 'ไม่ใช่ node ชนิดใหม่ — เปิด toggle 🔁 บน node ที่มีอยู่ (HTTP/Function) เพื่อให้รันซ้ำหลายรอบ',
      scene: {
        nodes: [{ id: 'l', type: 'http-request', label: 'Poll job', subtitle: 'GET /status', x: 38, y: 48, glow: true }],
      },
    },
    {
      label: 'ตั้ง Rounds + Delay + Stop condition',
      detail:
        'Rounds (1–1000), Max errors, Delay ระหว่างรอบ (0–60000ms) และ stopCondition (นิพจน์ JS เดี่ยว) ที่จริงแล้วหยุดก่อนได้',
      scene: {
        nodes: [{ id: 'l', type: 'http-request', label: 'Poll job', subtitle: 'GET /status', x: 30, y: 48 }],
        sheet: {
          title: 'Poll job · 🔁 Loop',
          fields: [
            { label: 'Rounds', value: '10' },
            { label: 'Delay (ms)', value: '1500' },
            { label: 'Stop condition', value: 'response.data.status === "done"', typing: true, highlight: true },
          ],
        },
      },
    },
    {
      label: 'รัน — badge บอกรอบปัจจุบัน',
      detail: 'ขณะรันมี badge 🔁 loop (i/N) • delay และปุ่ม ⏹ Stop กดหยุดที่ขอบรอบถัดไปได้',
      scene: {
        nodes: [
          { id: 'l', type: 'http-request', label: 'Poll job', subtitle: 'GET /status', x: 30, y: 48, badge: '🔁 loop (3/10) • 1.5s' },
        ],
        output: { status: 200, statusText: 'OK', ms: 88, slideIn: true, body: '{ "status": "pending" }' },
      },
    },
    {
      label: 'หยุดเมื่อ stopCondition เป็นจริง',
      detail: 'รอบที่ status === "done" stopCondition เป็น true loop จบเองทันที (หรือจบเมื่อครบ rounds / error budget / กด Stop)',
      scene: {
        nodes: [
          { id: 'l', type: 'http-request', label: 'Poll job', subtitle: 'GET /status', x: 30, y: 48, badge: '✓ done (6/10)' },
        ],
        output: { status: 200, statusText: 'OK', ms: 91, slideIn: true, body: '{ "status": "done" }' },
      },
    },
  ],
};

// ---- Ch.8 Tags & Connections ----------------------------------------------
const tagsConnections: Chapter = {
  id: 'tags',
  num: 8,
  icon: '🏷️',
  title: 'Tags & Connections',
  blurb: 'tag, output binding, edges',
  steps: [
    {
      label: 'สร้าง tag — ค่าที่ reuse ได้',
      detail:
        'tag คือค่ามีชื่อ + type (domain / pathname / param / body / generic) อ้างที่ไหนก็ได้ด้วย {{tagKey}}',
      scene: {
        nodes: [{ id: 'a', type: 'http-request', label: 'Login', subtitle: 'POST {{domain}}/login', x: 30, y: 46 }],
        sheet: {
          title: '🏷️ Tags',
          fields: [
            { label: 'domain', value: 'api.rubsub.vip' },
            { label: 'token  (generic)', value: '— ยังว่าง —', highlight: true },
          ],
        },
      },
    },
    {
      label: 'Output binding — response → tag',
      detail: 'แท็บ Output ของ node: ผูก path ใน response (เช่น token) เข้า tag เมื่อรันเสร็จ tag จะถูกเขียนทับ',
      scene: {
        nodes: [{ id: 'a', type: 'http-request', label: 'Login', subtitle: 'POST {{domain}}/login', x: 30, y: 46 }],
        sheet: {
          title: 'Login',
          tabs: ['Request', 'Headers', 'Body', 'Output', 'Preview'],
          activeTab: 'Output',
          fields: [{ label: 'response.token  →  tag', value: 'token', highlight: true }],
        },
      },
    },
    {
      label: 'เชื่อม node ด้วย edge',
      detail: 'ลากจาก handle ของ node หนึ่งไปอีก node — ทิศทาง = ลำดับรัน ใส่ label บนเส้นได้',
      scene: {
        nodes: [
          { id: 'a', type: 'http-request', label: 'Login', subtitle: 'binds {{token}}', x: 24, y: 38 },
          { id: 'b', type: 'http-request', label: 'Get profile', subtitle: 'Bearer {{token}}', x: 72, y: 58 },
        ],
        edges: [{ id: 'e', from: 'a', to: 'b', label: 'then', draw: true }],
      },
    },
    {
      label: 'Chain execute — token ไหลทั้งสาย',
      detail:
        'กด Execute: executor เดินตาม edge step 1 login เขียน {{token}} → step 2 ส่ง Bearer {{token}} ได้ profile กลับมา',
      scene: {
        nodes: [
          { id: 'a', type: 'http-request', label: 'Login', subtitle: 'binds {{token}}', x: 24, y: 38 },
          { id: 'b', type: 'http-request', label: 'Get profile', subtitle: 'Bearer {{token}}', x: 68, y: 58, badge: 'running…' },
        ],
        edges: [{ id: 'e', from: 'a', to: 'b', label: 'then' }],
        output: {
          status: 200, statusText: 'OK', ms: 305, slideIn: true,
          body: '{\n  "user": "steeler00",\n  "balance": 1280.5\n}',
        },
      },
    },
  ],
};

// ---- Ch.9 Run Workflow -----------------------------------------------------
// The no-code, one-click run: press Run Flow and the whole graph executes
// following the edges, lighting each node live + animating data between them.
const runWorkflow: Chapter = {
  id: 'run-workflow',
  num: 9,
  icon: '▶️',
  title: 'Run Workflow',
  blurb: 'no-code: วาง → เชื่อม → Run → data flow',
  steps: [
    {
      label: 'วาง 3 nodes ลงบน canvas',
      detail:
        'No-code: ลาก node จาก palette มาวาง — Login (HTTP) → Parse (Function) → Get profile (HTTP). ยังไม่ต้องเขียนโค้ดเชื่อมข้อมูลเอง',
      scene: {
        nodes: [
          { id: 'a', type: 'http-request', label: 'Login', subtitle: 'POST /login', x: 22, y: 30, glow: true },
          { id: 'b', type: 'function', label: 'Parse', subtitle: 'extract token', x: 50, y: 50, glow: true },
          { id: 'c', type: 'http-request', label: 'Get profile', subtitle: 'Bearer {{token}}', x: 78, y: 70, glow: true },
        ],
      },
    },
    {
      label: 'ลากเส้นเชื่อม node ตามลำดับ',
      detail:
        'ลากจาก handle ของ node หนึ่งไปอีก node — Login → Parse → Get profile. label บนเส้น (เช่น "then") จะกลายเป็น key ใน inputs ของ node ปลายทาง',
      scene: {
        nodes: [
          { id: 'a', type: 'http-request', label: 'Login', subtitle: 'POST /login', x: 22, y: 30 },
          { id: 'b', type: 'function', label: 'Parse', subtitle: 'extract token', x: 50, y: 50 },
          { id: 'c', type: 'http-request', label: 'Get profile', subtitle: 'Bearer {{token}}', x: 78, y: 70 },
        ],
        edges: [
          { id: 'e1', from: 'a', to: 'b', label: 'then', draw: true },
          { id: 'e2', from: 'b', to: 'c', label: 'then', draw: true },
        ],
      },
    },
    {
      label: 'กด ▶ Run Flow ครั้งเดียว — รันทั้ง flow',
      detail:
        'ปุ่ม Run Flow บน header รันทั้ง canvas อัตโนมัติ: หา start node (ไม่มีเส้นเข้า) แล้วเดินตาม edge ทีละ node ตามลำดับ topological — ไม่ต้องกดทีละ node',
      scene: {
        nodes: [
          { id: 'a', type: 'http-request', label: 'Login', subtitle: 'POST /login', x: 22, y: 30 },
          { id: 'b', type: 'function', label: 'Parse', subtitle: 'extract token', x: 50, y: 50 },
          { id: 'c', type: 'http-request', label: 'Get profile', subtitle: 'Bearer {{token}}', x: 78, y: 70 },
        ],
        edges: [
          { id: 'e1', from: 'a', to: 'b', label: 'then' },
          { id: 'e2', from: 'b', to: 'c', label: 'then' },
        ],
        hint: '▶ Run Flow',
      },
    },
    {
      label: 'แต่ละ node สว่างตามสถานะ realtime',
      detail:
        'ผ่าน SSE stream: node ที่กำลังรันมีขอบฟ้า + spinner ✓ เขียวเมื่อเสร็จ ✕ แดงเมื่อ error ที่นี่ A เสร็จแล้ว B กำลังรัน — เส้น A→B วิ่ง animate ส่งข้อมูล',
      scene: {
        nodes: [
          { id: 'a', type: 'http-request', label: 'Login', subtitle: 'POST /login', x: 22, y: 30, badge: '✓ done' },
          { id: 'b', type: 'function', label: 'Parse', subtitle: 'extract token', x: 50, y: 50, badge: 'running…' },
          { id: 'c', type: 'http-request', label: 'Get profile', subtitle: 'Bearer {{token}}', x: 78, y: 70 },
        ],
        edges: [
          { id: 'e1', from: 'a', to: 'b', label: 'then', draw: true },
          { id: 'e2', from: 'b', to: 'c', label: 'then' },
        ],
      },
    },
    {
      label: 'Output ของ node ก่อนหน้าไหลไป node ถัดไป',
      detail:
        'auto data passing: Function node อ่าน output ของ upstream ได้ผ่าน inputs — key คือ label ของเส้น (inputs["then"]) หรือชื่อ node ต้นทาง (inputs["Login"]) ไม่ต้อง copy ค่าด้วยมือ',
      scene: {
        nodes: [
          { id: 'a', type: 'http-request', label: 'Login', subtitle: 'POST /login', x: 22, y: 30, badge: '✓ done' },
          { id: 'b', type: 'function', label: 'Parse', subtitle: 'inputs["Login"]', x: 50, y: 50, badge: '✓ done' },
          { id: 'c', type: 'http-request', label: 'Get profile', subtitle: 'Bearer {{token}}', x: 78, y: 70, badge: 'running…' },
        ],
        edges: [
          { id: 'e1', from: 'a', to: 'b', label: 'then' },
          { id: 'e2', from: 'b', to: 'c', label: 'then', draw: true },
        ],
        output: { status: 200, statusText: 'OK', ms: 412, slideIn: true, body: '{\n  "user": "steeler00",\n  "balance": 1280.5\n}' },
      },
    },
    {
      label: 'node ล้มเหลว → ข้าม downstream',
      detail:
        'ถ้า node ไหน error ทุก node ที่อยู่ปลายน้ำของมันจะถูก skip (สีเทา) — login พังก็ไม่ยิง call ที่ต้องใช้ token ต่อ ปุ่มเปลี่ยนเป็น ⏹ Stop กดหยุดกลางคันได้',
      scene: {
        nodes: [
          { id: 'a', type: 'http-request', label: 'Login', subtitle: 'POST /login', x: 22, y: 30, badge: '✕ error 401' },
          { id: 'b', type: 'function', label: 'Parse', subtitle: 'skipped', x: 50, y: 50, badge: '– skipped' },
          { id: 'c', type: 'http-request', label: 'Get profile', subtitle: 'skipped', x: 78, y: 70, badge: '– skipped' },
        ],
        edges: [
          { id: 'e1', from: 'a', to: 'b', label: 'then' },
          { id: 'e2', from: 'b', to: 'c', label: 'then' },
        ],
        output: { status: 401, statusText: 'Unauthorized', ms: 120, slideIn: true, error: true, body: '{ "error": "bad credentials" }' },
      },
    },
  ],
};

// ---- Ch.10 Script Loop -----------------------------------------------------
// The forEach pattern: an env node holds an array, a loop node in *script* mode
// iterates it, calling another node per item and collecting the results.
const scriptLoop: Chapter = {
  id: 'script-loop',
  num: 10,
  icon: '📜',
  title: 'Script Loop',
  blurb: 'เขียน JS คุม flow เอง: call() · send() · return',
  steps: [
    {
      label: 'เปิด Script Mode บน node ไหนก็ได้',
      detail:
        'ในหน้าแก้ node ติ๊ก 📜 Use Script Mode — node จะรันโค้ด JS ที่คุณเขียนแทนพฤติกรรมปกติ. สคริปต์เป็น async function ที่ได้ตัวช่วย 6 ตัว: env, inputs, tags, call(), send(), log(). มี 3 คำสั่งหลักที่ต้องรู้ — call, send, return',
      scene: {
        nodes: [
          { id: 'script', type: 'function', label: '📜 Script', subtitle: 'script mode', x: 42, y: 46, glow: true },
        ],
        sheet: {
          title: '📜 Script · 3 คำสั่งหลัก',
          code:
            'await call(\'Node\')   // ยิง node อื่น รอผลกลับ\n' +
            'await send(\'Node\')   // ยิงทิ้ง ไม่รอ (fire & forget)\n' +
            'return value         // ส่งค่าออกไป downstream',
        },
      },
    },
    {
      label: '1️⃣ await call() — ยิง node อื่น แล้วรอผลกลับ',
      detail:
        'call("Fetch Todo") รัน node ชื่อนั้นจริง ๆ รอจนเสร็จ แล้วคืน output มาเป็นค่า. ใช้เมื่อต้องเอาผลลัพธ์มาใช้ต่อ — เช่นเรียก API แล้วเอา data มาปรับแต่ง. (Template: "Call แล้ว Return")',
      scene: {
        nodes: [
          { id: 'script', type: 'function', label: '📞 Call & Return', subtitle: 'await call(...)', x: 18, y: 40, badge: '📜 script • running…' },
          { id: 'fetch', type: 'http-request', label: 'Fetch Todo', subtitle: 'GET /todos/1', x: 66, y: 64 },
        ],
        edges: [{ id: 'e', from: 'script', to: 'fetch', label: 'call', draw: true }],
        sheet: {
          title: '📞 Call & Return · 📜 Script',
          from: 'bottom',
          code:
            '// เรียก node แล้วรับผลกลับมา\n' +
            "const todo = await call('Fetch Todo');\n" +
            '\n' +
            'return {\n' +
            '  task: todo.title,\n' +
            '  done: todo.completed,\n' +
            '};',
        },
      },
    },
    {
      label: '2️⃣ call() แบบ axios — กำหนด method + body เอง',
      detail:
        'overrides ตัวที่สองของ call() ทำงานเหมือน axios: ใส่ { method } เปลี่ยน verb (พิมพ์เล็ก/ใหญ่ก็ได้) และ { body: {...} } ส่ง JSON body เข้าไปตรง ๆ — แม้ HTTP node นั้นจะถูกตั้งไว้เป็น form/none ก็จะถูกส่งเป็น raw JSON ให้อัตโนมัติ. เท่ากับ axios.post(url, data) / axios.get(url).',
      scene: {
        nodes: [
          { id: 'script', type: 'function', label: '📜 Login Loop', subtitle: 'call(…, { method, body })', x: 18, y: 40, badge: '📜 script • running…' },
          { id: 'login', type: 'http-request', label: 'Login API', subtitle: 'POST /login', x: 66, y: 64 },
        ],
        edges: [{ id: 'e', from: 'script', to: 'login', label: 'call', draw: true }],
        sheet: {
          title: '📞 call() = axios · 📜 Script',
          from: 'bottom',
          code:
            '// เหมือน axios.post(url, { username, password })\n' +
            "const res = await call('Login API', {\n" +
            "  method: 'POST',\n" +
            '  body: { username: env.USER, password: env.PASS },\n' +
            '});\n' +
            '\n' +
            '// เหมือน axios.get(url) — เปลี่ยน verb ไม่ต้องมี body\n' +
            "const me = await call('Get Profile', { method: 'GET' });\n" +
            '\n' +
            'return { token: res.token, me };',
        },
      },
    },
    {
      label: '3️⃣ await send() — ยิงทิ้งโดยไม่รอ (fire & forget)',
      detail:
        'send("Notify") เตะ node ให้ทำงานแล้วไปต่อทันที ไม่รอผล. เหมาะกับงานข้างเคียงที่ไม่ต้องใช้ผลลัพธ์ — เช่นส่ง notification, log, webhook. งานหลัก return ได้เลยไม่ติดบล็อก. (Template: "Send (Fire & Forget)")',
      scene: {
        nodes: [
          { id: 'script', type: 'function', label: '🔔 Main Process', subtitle: 'await send(...)', x: 18, y: 46, badge: '✓ done' },
          { id: 'notify', type: 'http-request', label: '📨 Notify', subtitle: 'POST /post', x: 66, y: 46 },
        ],
        edges: [{ id: 'e', from: 'script', to: 'notify', label: 'send', draw: true }],
        sheet: {
          title: '🔔 Main Process · 📜 Script',
          from: 'bottom',
          code:
            "const result = { status: 'done' };\n" +
            '\n' +
            '// ยิง notify ไปโดยไม่รอผล\n' +
            "await send('📨 Notify');\n" +
            '\n' +
            '// ทำงานต่อทันที ไม่รอ Notify เสร็จ\n' +
            'return result;',
        },
      },
    },
    {
      label: '4️⃣ return value — ส่งค่าต่อ downstream',
      detail:
        'ค่าที่ return กลายเป็น output ของ node — node ถัดไปอ่านผ่าน inputs["ชื่อ node"]. รวมกับ for-loop + call() ในตัวเดียว = วน array → ยิง API ทีละตัว → return รวมเป็น list. (Template: "Loop + Call + Return")',
      scene: {
        nodes: [
          { id: 'env', type: 'env', label: 'Config', subtitle: 'USERS=[3]', x: 14, y: 24 },
          { id: 'loop', type: 'function', label: '🔁 Loop Script', subtitle: '📜 script · 3 calls', x: 52, y: 30, badge: '✓ done' },
          { id: 'http', type: 'http-request', label: 'Get User Data', subtitle: 'GET /users/1', x: 52, y: 70 },
        ],
        edges: [
          { id: 'e', from: 'env', to: 'loop', label: 'env' },
          { id: 'e2', from: 'loop', to: 'http', label: 'call' },
        ],
        output: {
          status: 200,
          statusText: 'OK',
          ms: 642,
          slideIn: true,
          body:
            '[\n  { "user": "alice", "name": "Leanne" },\n  { "user": "bob",   "name": "Ervin"  },\n  { "user": "carol", "name": "Clementine" }\n]',
        },
      },
    },
  ],
};

export const CHAPTERS: Chapter[] = [
  canvasBasics,
  httpNode,
  functionNode,
  serverNode,
  puppeteerNode,
  envNode,
  loopMode,
  tagsConnections,
  runWorkflow,
  scriptLoop,
];
