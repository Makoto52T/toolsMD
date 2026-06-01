import pw from '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.js';
const { chromium } = pw;
const EXEC = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const BASE = 'https://tools-md.vercel.app';
const PROJECT_ID = process.argv[2];
const UID = process.argv[3];

const results = [];
const check = (n, c, e='') => { results.push({n,p:!!c}); console.log(`${c?'PASS':'FAIL'}  ${n}${e?'  :: '+e:''}`); };

async function openNodeDesktop(page, nodeId) {
  await page.evaluate((id) => {
    const el = document.querySelector(`.react-flow__node[data-id="${id}"]`);
    const btns = el ? Array.from(el.querySelectorAll('button')) : [];
    const edit = btns.find(b => b.textContent.trim() === 'Edit');
    if (edit) edit.click();
  }, nodeId);
  await page.waitForTimeout(600);
}

async function run(viewport, label) {
  const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: 'userId', value: UID, domain: 'tools-md.vercel.app', path: '/' }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/projects/${PROJECT_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const isMobile = viewport.width < 768;

  // Open a node's Edit modal by node name. Desktop = react-flow node Edit button;
  // mobile = MobileNodeList card Edit button (no canvas).
  async function openByName(name) {
    if (!isMobile) {
      const id = await page.evaluate((nm) => {
        const nodes = Array.from(document.querySelectorAll('.react-flow__node'));
        for (const n of nodes) if (n.textContent.includes(nm)) return n.getAttribute('data-id');
        return null;
      }, name);
      if (id) await openNodeDesktop(page, id);
      return !!id;
    }
    return page.evaluate((nm) => {
      const cards = Array.from(document.querySelectorAll('div'));
      for (const c of cards) {
        const head = c.querySelector('.font-semibold');
        if (head && head.textContent.trim() === nm) {
          const edit = Array.from(c.querySelectorAll('button')).find(b => b.textContent.trim() === 'Edit');
          if (edit) { edit.click(); return true; }
        }
      }
      return false;
    }, name);
  }

  check(`[${label}] open form-post`, await openByName('form-post'));
  await page.waitForTimeout(600);

  // Body tab
  const bodyTab = await page.$('[data-testid="http-tab-body"]');
  check(`[${label}] body tab present`, !!bodyTab);
  if (bodyTab) { await bodyTab.click(); await page.waitForTimeout(300); }

  // mode toggle present
  check(`[${label}] body mode toggle`, !!(await page.$('[data-testid="body-mode-toggle"]')));
  // form mode active (node saved as form) -> rows visible
  check(`[${label}] form rows render`, (await page.$$('[data-testid="body-form-row"]')).length >= 2,
    `rows=${(await page.$$('[data-testid="body-form-row"]')).length}`);
  // preview shows resolved (masked) body
  const previewTxt = await page.$eval('[data-testid="body-form-preview"]', el => el.textContent).catch(()=>'');
  check(`[${label}] form preview has username key`, previewTxt.includes('username'), previewTxt.replace(/\s+/g,' ').slice(0,80));
  // add from tag control present
  check(`[${label}] add-from-tag control`, !!(await page.$('[data-testid="body-add-from-tag"]')));

  // switch to raw -> textarea, none -> note
  await page.click('[data-testid="body-mode-raw"]'); await page.waitForTimeout(250);
  check(`[${label}] raw textarea`, !!(await page.$('[data-testid="http-body"]')));
  await page.click('[data-testid="body-mode-none"]'); await page.waitForTimeout(250);
  check(`[${label}] none note`, !!(await page.$('[data-testid="body-none-note"]')));
  // back to form for cleanliness
  await page.click('[data-testid="body-mode-form"]'); await page.waitForTimeout(200);

  // Preview tab mirrors form body
  await page.click('[data-testid="http-tab-preview"]'); await page.waitForTimeout(300);
  const cfgTxt = await page.$eval('[data-testid="http-config-preview"]', el => el.textContent).catch(()=>'');
  check(`[${label}] Preview tab data mirrors form`, cfgTxt.includes('username') && cfgTxt.includes('data:'), cfgTxt.replace(/\s+/g,' ').slice(0,120));

  // close modal
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim()==='Cancel'); if (b) b.click(); });
  await page.waitForTimeout(400);

  // ===== Realtime: open RTServer node, check Realtime editor =====
  check(`[${label}] open RTServer`, await openByName('RTServer'));
  await page.waitForTimeout(600);
  check(`[${label}] realtime editor present`, !!(await page.$('[data-testid="realtime-editor"]')));
  check(`[${label}] realtime mock note`, !!(await page.$('[data-testid="realtime-mock-note"]')));
  // transport suggested for JS includes Socket.io option
  const transportOpts = await page.$$eval('[data-testid="realtime-transport"] option', els => els.map(e=>e.value));
  check(`[${label}] transport suggests Socket.io (JS stack)`, transportOpts.includes('Socket.io'), transportOpts.join(','));
  check(`[${label}] event rows present`, (await page.$$('[data-testid="event-row"]')).length >= 2,
    `events=${(await page.$$('[data-testid="event-row"]')).length}`);

  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim()==='Cancel'); if (b) b.click(); });
  await page.waitForTimeout(400);

  // ===== Caller node realtime picker =====
  check(`[${label}] open rt-caller`, await openByName('rt-caller'));
  await page.waitForTimeout(600);
  check(`[${label}] call-route-picker present`, !!(await page.$('[data-testid="call-route-picker"]')));
  check(`[${label}] kind toggle present`, !!(await page.$('[data-testid="call-kind-toggle"]')));
  // realtime kind is active -> event select present
  check(`[${label}] realtime event select`, !!(await page.$('[data-testid="call-event-select"]')),
    `eventSelVal=${await page.$eval('[data-testid="call-event-select"]', e=>e.value).catch(()=>'-')}`);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim()==='Cancel'); if (b) b.click(); });
  await page.waitForTimeout(400);

  // ===== FlowNode badges (desktop only — mobile has no canvas) =====
  if (!isMobile) {
    const callerHasBadge = await page.evaluate(() => {
      const c = Array.from(document.querySelectorAll('.react-flow__node')).find(n => n.textContent.includes('rt-caller'));
      return c ? !!c.querySelector('[data-testid="mock-call-badge"]') : false;
    });
    check(`[${label}] caller mock badge (realtime)`, callerHasBadge);
    const evBadge = await page.evaluate(() => {
      const s = Array.from(document.querySelectorAll('.react-flow__node')).find(n => n.textContent.includes('RTServer'));
      return s ? !!s.querySelector('[data-testid="event-count-badge"]') : false;
    });
    check(`[${label}] server event-count badge`, evBadge);
  }

  await browser.close();
}

(async () => {
  await run({ width: 1280, height: 900 }, 'desktop');
  await run({ width: 390, height: 844 }, 'mobile');
  const fails = results.filter(r=>!r.p);
  console.log(`\n==== UI ${results.length-fails.length}/${results.length} PASS ====`);
  if (fails.length) { console.log('FAIL:', fails.map(f=>f.n).join(', ')); process.exitCode=1; }
})();
