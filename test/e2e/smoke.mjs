// End-to-end smoke test: loads the unpacked extension into real Chromium, serves a mock
// ChatGPT-shaped page (chatgpt.com itself is not reachable from the build sandbox), and checks
// the Phase 1 acceptance criteria. Run: node test/e2e/smoke.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'test/fixtures/wallpaper-sample.jpg');
const MOCK_HTML = `<!doctype html><html><head><title>ChatGPT</title><style>
  body{color:#0d0d0d;background:#fff;font-family:sans-serif;margin:0}
  main{background:#fff;min-height:100vh;padding:20px;box-sizing:border-box}
  .msg{background:#f4f4f4;border-radius:12px;padding:12px;margin:8px 0;max-width:600px}
</style></head><body><div id="__next"><main id="main">
  <div class="msg">Hello from the mock chat</div><div class="msg">Second turn</div>
</main></div>
<script>
  // Simulate a React-style re-render that keeps mutating the chat tree.
  setInterval(() => { const m = document.querySelector('main'); const d = document.createElement('div');
    d.className = 'msg'; d.textContent = 'tick'; m.appendChild(d); if (m.children.length > 30) m.firstChild.remove(); }, 1500);
</script></body></html>`;

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinshift-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--no-sandbox']
});

const externalRequests = [];
context.on('request', (req) => {
  const u = req.url();
  if (!u.startsWith('chrome-extension://') && !u.startsWith('blob:') && !u.startsWith('data:') && !u.startsWith('https://chatgpt.com/')) {
    externalRequests.push(u);
  }
});

let sw = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
const extId = sw.url().split('/')[2];
check('service worker boots', !!extId, extId);

await context.route('https://chatgpt.com/**', (route) => {
  const url = route.request().url();
  if (url.endsWith('/') || url.includes('?')) return route.fulfill({ status: 200, contentType: 'text/html', body: MOCK_HTML });
  return route.fulfill({ status: 404, body: '' });
});

const chat = await context.newPage();
const chatErrors = [];
chat.on('pageerror', (e) => chatErrors.push('pageerror: ' + e.message));
chat.on('console', (m) => { if (m.type() === 'error') chatErrors.push('console: ' + m.text()); });

await chat.goto('https://chatgpt.com/', { waitUntil: 'load' });
// Absence assertion: passes immediately when no overlay exists, waits only if one appears.
await chat.waitForFunction(() => !document.querySelector('#skinshift-root'), null, { timeout: 5000 });
check('no overlay before a wallpaper is uploaded', (await chat.locator('#skinshift-root').count()) === 0);

const popup = await context.newPage();
const popupErrors = [];
popup.on('pageerror', (e) => popupErrors.push(e.message));
await popup.goto(`chrome-extension://${extId}/src/popup/popup.html`);
await popup.setInputFiles('#file-input', FIXTURE);
await popup.waitForFunction(() => document.getElementById('msg').textContent.startsWith('Saved'), null, { timeout: 15000 })
  .then(() => check('upload -> resize -> persist succeeds', true))
  .catch(async () => check('upload -> resize -> persist succeeds', false, await popup.textContent('#msg')));

await chat.bringToFront();
const attached = await chat.waitForSelector('#skinshift-root', { timeout: 10000, state: 'attached' }).then(() => true).catch(() => false);
check('overlay attaches on ChatGPT after upload (no reload needed)', attached);

if (attached) {
  const src = await chat.evaluate(() => document.querySelector('#skinshift-root .ss-wallpaper').getAttribute('src'));
  const loaded = await chat.evaluate(() => document.querySelector('#skinshift-root .ss-wallpaper').complete && document.querySelector('#skinshift-root .ss-wallpaper').naturalWidth > 0);
  check('wallpaper object URL applied and decoded', !!src && src.startsWith('blob:') && loaded, (src || '').slice(0, 30));
  const mainBg = await chat.evaluate(() => getComputedStyle(document.querySelector('main')).backgroundColor);
  check('site surface cleared to transparent', mainBg === 'rgba(0, 0, 0, 0)', mainBg);
  const zIndex = await chat.evaluate(() => getComputedStyle(document.getElementById('skinshift-root')).zIndex);
  check('layer sits behind content (z-index -1)', zIndex === '-1', zIndex);
}

// Persistence across reload.
await chat.reload({ waitUntil: 'load' });
const afterReload = await chat.waitForSelector('#skinshift-root', { timeout: 10000, state: 'attached' }).then(() => true).catch(() => false);
check('overlay survives page refresh', afterReload);

// SPA re-render defence: remove the layer as a framework would; it must come back.
await chat.evaluate(() => document.getElementById('skinshift-root').remove());
await chat.waitForSelector('#skinshift-root', { state: 'attached', timeout: 5000 });
check('MutationObserver re-attaches removed layer', (await chat.locator('#skinshift-root').count()) === 1);

// Settings change propagates to the open tab.
await popup.bringToFront();
await popup.evaluate(() => { const el = document.getElementById('opacity'); el.value = '40'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await chat.waitForFunction(
  () => getComputedStyle(document.getElementById('skinshift-root')).getPropertyValue('--ss-opacity').trim() === '0.4',
  null, { timeout: 8000 });
const op = await chat.evaluate(() => getComputedStyle(document.getElementById('skinshift-root')).getPropertyValue('--ss-opacity').trim());
check('opacity slider propagates to ChatGPT tab', op === '0.4', 'opacity=' + op);

// Chat remains usable: text, scroll, click targets not intercepted.
const pointerOk = await chat.evaluate(() => {
  const el = document.querySelector('.msg'); const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + 5, r.top + 5);
  return hit && hit.closest('#skinshift-root') === null;
});
check('overlay does not intercept pointer events', !!pointerOk);

check('no uncaught errors on ChatGPT mock', chatErrors.filter((e) => !/favicon|404/.test(e)).length === 0, chatErrors.slice(0, 3).join(' | '));
check('no uncaught errors in popup', popupErrors.length === 0, popupErrors.slice(0, 2).join(' | '));
check('zero non-local network requests from extension/popup/page', externalRequests.length === 0, externalRequests.slice(0, 3).join(' | '));

await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
