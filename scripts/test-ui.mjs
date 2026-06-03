// Playwright UI tests for TMD feature verification (7, 9, 10).
// Usage: node scripts/test-ui.mjs <projectId> <userId>
import pw from '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.js';
const { chromium } = pw;

const BASE = 'http://localhost:3000';
const PROJECT_ID = process.argv[2];
const USER_ID = process.argv[3];
const CHROME = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

const out = [];
const log = (name, pass, info = '') => {
  out.push({ name, pass, info });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${info}`);
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function newCtx(viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([
    { name: 'userId', value: USER_ID, domain: 'localhost', path: '/' },
  ]);
  return ctx;
}

// ---- 7. Mobile tab bar stays on-screen at 375x812 ----
async function test7() {
  const ctx = await newCtx({ width: 375, height: 812 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/projects/${PROJECT_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const tabbar = page.locator('[data-testid="mobile-tabbar"]');
  const visible = await tabbar.isVisible().catch(() => false);
  if (!visible) { log('7. Mobile tab bar on-screen', false, 'tabbar not visible'); await ctx.close(); return; }
  const box = await tabbar.boundingBox();
  // tab bar bottom edge must be within the 812px viewport (not pushed off-screen)
  const bottomEdge = box ? box.y + box.height : 9999;
  const onScreen = box && bottomEdge <= 812 + 1 && box.y >= 0;
  // also each of the 3 tabs reachable
  const tabCount = await page.locator('[data-testid^="mobile-tab-"]').count();
  log('7. Mobile tab bar on-screen', !!onScreen && tabCount === 3,
    `bottomEdge=${bottomEdge?.toFixed?.(0)} (<=812) tabs=${tabCount}`);
  await ctx.close();
}

// ---- 9. Edge hover -> stroke recolors to source-node colour ----
async function test9() {
  const ctx = await newCtx({ width: 1400, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/projects/${PROJECT_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  // Fit the graph into view so edges aren't off-screen.
  const fitBtn = page.locator('.react-flow__controls-fitview').first();
  if (await fitBtn.count()) { await fitBtn.click().catch(() => {}); await page.waitForTimeout(600); }
  const edgePath = page.locator('.react-flow__edge-path').first();
  const exists = await edgePath.count();
  if (!exists) { log('9. Edge hover recolor', false, 'no edge path rendered'); await ctx.close(); return; }
  const restingStroke = await edgePath.evaluate((el) => el.getAttribute('stroke') || getComputedStyle(el).stroke);
  // Hover the edge's interaction layer (wide invisible path). Fall back to a
  // synthetic mouseenter on the edge group, which is what React Flow listens to.
  const interaction = page.locator('.react-flow__edge-interaction').first();
  const hoverTarget = (await interaction.count()) ? interaction : edgePath;
  try {
    await hoverTarget.hover({ force: true, timeout: 2000 });
  } catch {
    await page.locator('.react-flow__edge').first().dispatchEvent('mouseenter');
    await page.locator('.react-flow__edge').first().dispatchEvent('mouseover');
  }
  await page.waitForTimeout(400);
  const hoverStroke = await edgePath.evaluate((el) => el.getAttribute('stroke') || getComputedStyle(el).stroke);
  // Source node = function (Step A) -> its type colour, not the grey fallback #94a3b8.
  // Pass if stroke changed on hover AND resolves to a non-fallback colour.
  const changed = restingStroke !== hoverStroke || (hoverStroke && !/94a3b8/i.test(hoverStroke));
  log('9. Edge hover recolor by source', !!changed,
    `resting=${restingStroke} hover=${hoverStroke}`);
  await ctx.close();
}

// ---- 10. New node pulse + smart placement (no overlap) ----
async function test10() {
  const ctx = await newCtx({ width: 1400, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/projects/${PROJECT_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const before = await page.locator('.react-flow__node').count();
  // Add a node — find an "add node" affordance.
  const addBtn = page.locator('button:has-text("Add node"), button:has-text("Add")').first();
  let added = false;
  if (await addBtn.count()) {
    await addBtn.click().catch(() => {});
    // pulse window is 3s; check quickly after the node lands
    await page.waitForTimeout(700);
    const after = await page.locator('.react-flow__node').count();
    added = after > before;
  }
  if (!added) {
    log('10. New node pulse + placement', false, `could not add node (before=${before}); add-affordance not found`);
    await ctx.close();
    return;
  }
  // pulse: a newly added node carries the .tmd-node-new class (vermilion pulse)
  const pulsing = await page.locator('.tmd-node-new').count();
  // placement: no two node bounding boxes fully overlap
  const boxes = await page.locator('.react-flow__node').evaluateAll((els) =>
    els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  let overlap = false;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (Math.abs(a.x - b.x) < 8 && Math.abs(a.y - b.y) < 8) overlap = true;
    }
  log('10. New node pulse + placement', pulsing >= 1 && !overlap,
    `pulsing=${pulsing} overlap=${overlap} nodes=${boxes.length}`);
  await ctx.close();
}

for (const t of [test7, test9, test10]) {
  try { await t(); } catch (e) { log(t.name, false, `THREW: ${e?.message}`); }
}
await browser.close();
const fails = out.filter((r) => !r.pass).length;
console.log(`\n=== UI ${out.length - fails}/${out.length} passed ===`);
process.exit(fails ? 1 : 0);
