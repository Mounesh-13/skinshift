// Popup + accessibility acceptance test (Phase 3). Runs in real Chromium with the unpacked
// extension. Verifies the readability warning fires on a deliberately low-contrast setup, every
// preset passes on the worst-case white wallpaper, and performance mode / reset behave.
// Run: node test/e2e/popup-ui.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = (name) => path.join(ROOT, 'test/fixtures', name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinshift-ui-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--no-sandbox']
});
const sw = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
const extId = sw.url().split('/')[2];

await context.route('https://chatgpt.com/**', (route) => {
  const u = new URL(route.request().url());
  if (u.pathname !== '/') return route.fulfill({ status: 404, body: '' });
  return route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><html><head><style>body{background:#fff;color:#0d0d0d;margin:0}main{background:#fff;min-height:100vh;padding:20px}</style></head><body><div id="__next"><main id="main"><p>Chat</p></main></div></body></html>'
  });
});

const popup = await context.newPage();
const popupErrors = [];
popup.on('pageerror', (e) => popupErrors.push(e.message));
await popup.goto(`chrome-extension://${extId}/src/popup/popup.html`);

const chat = await context.newPage();
await chat.goto('https://chatgpt.com/', { waitUntil: 'load' });

const readClass = () => popup.getAttribute('#readability', 'class');
const isHidden = () => popup.locator('#readability').isHidden();

// 1. Readability hidden until a wallpaper exists.
check('readability panel hidden with no wallpaper', await isHidden());

// 2. Worst-case deliberately low-contrast setup: pure white photo, opacity 20%.
await popup.setInputFiles('#file-input', FIX('white.png'));
await popup.waitForFunction(() => document.getElementById('msg').textContent.startsWith('Saved'), null, { timeout: 15000 });
await popup.evaluate(() => { const el = document.getElementById('opacity'); el.value = '20'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await popup.waitForFunction(() => document.getElementById('readability').className.includes('warn'), null, { timeout: 8000 });
check('low-contrast setup (white photo, 20% opacity) shows warning in popup', (await readClass()).includes('warn'), await readClass());
check('warning text names the failing theme and the WCAG bar', (await popup.textContent('#read-text')).includes('WCAG AA'));

// Toolbar badge shows '!' for the same tab (non-blocking). The badge path is
// popup -> storage -> content script -> service worker (4 hops), so poll it.
let badge = null;
for (let i = 0; i < 20 && badge !== '!'; i++) {
  await sleep(500);
  badge = await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      const text = await chrome.action.getBadgeText({ tabId: t.id });
      if (text === '!') return '!';
    }
    return null;
  });
}
check('toolbar badge shows "!" on low-contrast setup', badge === '!', String(badge));

// The page itself keeps working: wallpaper still applied, chat text untouched.
const chatOk = await chat.evaluate(() => {
  const root = document.getElementById('skinshift-root');
  const p = document.querySelector('p');
  return !!root && getComputedStyle(p).color === 'rgb(13, 13, 13)';
});
check('warning is non-blocking: wallpaper applied, chat text colour untouched', chatOk);

// 3. Every preset passes on the worst-case white wallpaper (both themes, per the math test).
for (const id of ['light', 'dark', 'high-blur']) {
  await popup.click(`.preset[data-preset="${id}"]`);
  await popup.waitForFunction(
    () => document.getElementById('readability').className.includes('pass'), null, { timeout: 8000 });
  const cls = await readClass();
  check(`preset "${id}" passes readability on worst-case white wallpaper`, cls.includes('pass'), cls);
}
const aria = await popup.getAttribute('.preset[data-preset="high-blur"]', 'aria-pressed');
check('active preset is marked pressed', aria === 'true');
const storedBlur = await popup.evaluate(async () => (await chrome.storage.local.get('settings')).settings.blur);
check('high-blur preset writes blur=28 to storage', storedBlur === 28, String(storedBlur));

// 4. Performance mode: blur disabled and swapped for plain dimming.
await popup.check('#perf');
await chat.waitForFunction(() => document.getElementById('skinshift-root')?.dataset.ssMode === 'perf', null, { timeout: 8000 });
const perfMode = await chat.evaluate(() => document.getElementById('skinshift-root')?.dataset.ssMode);
check('performance mode switches the layer to "perf" (no backdrop blur)', perfMode === 'perf', String(perfMode));
const blurDisabled = await popup.evaluate(() => document.getElementById('blur').disabled);
check('blur slider disabled in performance mode', blurDisabled === true);
const backdrop = await chat.evaluate(() => getComputedStyle(document.querySelector('#skinshift-root .ss-scrim')).backdropFilter);
check('performance mode removes the backdrop-filter', backdrop === 'none', backdrop);
await popup.uncheck('#perf');
await chat.waitForFunction(() => document.getElementById('skinshift-root')?.dataset.ssMode === 'blur', null, { timeout: 8000 });
const blurMode = await chat.evaluate(() => document.getElementById('skinshift-root')?.dataset.ssMode);
check('turning performance mode off restores blur', blurMode === 'blur', String(blurMode));

// 5. Reset look restores defaults, keeps the wallpaper.
await popup.click('.preset[data-preset="high-blur"]');
await popup.click('#reset');
await popup.waitForFunction(() => document.getElementById('opacity-out').textContent === '82%', null, { timeout: 8000 });
const afterReset = await popup.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
check('reset look restores Light overlay defaults', afterReset.preset === 'light' && afterReset.opacity === 0.82 && afterReset.blur === 6, JSON.stringify({ p: afterReset.preset, o: afterReset.opacity, b: afterReset.blur }));
check('reset look keeps the uploaded wallpaper', afterReset.hasWallpaper === true);

// 6. A normal photo passes at defaults.
await popup.setInputFiles('#file-input', FIX('wallpaper-sample.jpg'));
await popup.waitForFunction(() => document.getElementById('msg').textContent.startsWith('Saved'), null, { timeout: 15000 });
await popup.waitForFunction(() => document.getElementById('readability').className.includes('pass'), null, { timeout: 8000 });
check('normal photo at defaults passes readability', (await readClass()).includes('pass'));

check('no uncaught errors in popup', popupErrors.length === 0, popupErrors.slice(0, 2).join(' | '));

await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
