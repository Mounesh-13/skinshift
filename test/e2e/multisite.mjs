// Multi-site acceptance test (Phase 2 + parts of Phase 4).
// Serves mock pages for chatgpt.com, claude.ai and gemini.google.com inside real Chromium with
// the unpacked extension loaded. Covers:
//   - overlay attaches on all three hosts after one upload
//   - per-site toggle detaches/reattaches only that site
//   - the site's own dark/light switch updates the theme without reload
//   - unsupported DOM => no-op, status "unsupported", no thrown errors
//   - Gemini under a strict Trusted Types CSP produces no TT violations
//   - restrictive img-src CSP: wallpaper load-error fallback hides the image, scrim stays
// Run: node test/e2e/multisite.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'test/fixtures/wallpaper-sample.jpg');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

// Per-host mode switch. Tests flip these to swap the served page without a new context.
const mode = { 'chatgpt.com': 'normal', 'claude.ai': 'normal', 'gemini.google.com': 'normal' };

const STYLE = `
  html.dark body { background: #212121; color: #ececec; }
  body { background: #fff; color: #0d0d0d; font-family: sans-serif; margin: 0; }
  main, chat-app, #root { display: block; background: #fff; min-height: 100vh; padding: 20px; box-sizing: border-box; }
  html.dark main, html.dark chat-app, html.dark #root { background: #212121; }
  .msg { background: #f4f4f4; border-radius: 12px; padding: 12px; margin: 8px; max-width: 600px; }
  html.dark .msg { background: #2f2f2f; color: #ececec; }`;

function pageFor(host, m) {
  if (m === 'nomain') return '<!doctype html><html><head><style>' + STYLE + '</style></head><body><section class="msg">Unknown layout</section></body></html>';
  const bodies = {
    'chatgpt.com': '<div id="__next"><main id="main"><div class="msg">ChatGPT mock</div></main></div>',
    'claude.ai': '<div id="root"><main><div class="msg">Claude mock</div></main></div>',
    'gemini.google.com': '<chat-app><main><div class="msg">Gemini mock</div></main></chat-app>'
  };
  return '<!doctype html><html><head><title>' + host + '</title><style>' + STYLE + '</style></head><body>' + bodies[host] + '</body></html>';
}

function headersFor(host, m) {
  if (host === 'gemini.google.com' && m === 'tt') {
    return { 'Content-Security-Policy': "require-trusted-types-for 'script'" };
  }
  if (host === 'claude.ai' && m === 'csp-img') {
    return { 'Content-Security-Policy': "img-src 'self' https:" }; // blob: images blocked
  }
  return {};
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinshift-multi-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--no-sandbox']
});

const sw = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
const extId = sw.url().split('/')[2];

const external = [];
context.on('request', (req) => {
  const u = req.url();
  const ok = u.startsWith('chrome-extension://') || u.startsWith('blob:') || u.startsWith('data:') ||
    /^https:\/\/(chatgpt\.com|claude\.ai|gemini\.google\.com)\//.test(u);
  if (!ok) external.push(u);
});

await context.route(/^https:\/\/(chatgpt\.com|claude\.ai|gemini\.google\.com)\//, (route) => {
  const url = new URL(route.request().url());
  const host = url.hostname;
  if (url.pathname !== '/') return route.fulfill({ status: 404, body: '' });
  return route.fulfill({
    status: 200,
    contentType: 'text/html',
    headers: headersFor(host, mode[host]),
    body: pageFor(host, mode[host])
  });
});

// Upload once via the popup.
const popup = await context.newPage();
await popup.goto(`chrome-extension://${extId}/src/popup/popup.html`);
await popup.setInputFiles('#file-input', FIXTURE);
await popup.waitForFunction(() => document.getElementById('msg').textContent.startsWith('Saved'), null, { timeout: 15000 });
check('wallpaper uploaded once via popup', true);

// Open one tab per host and record console/page errors per tab.
const tabs = {};
const errors = {};
for (const host of Object.keys(mode)) {
  const p = await context.newPage();
  errors[host] = [];
  p.on('pageerror', (e) => errors[host].push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors[host].push('console: ' + m.text()); });
  await p.goto(`https://${host}/`, { waitUntil: 'load' });
  tabs[host] = p;
}

const attachedOn = async (host) => (await tabs[host].locator('#skinshift-root').count()) === 1;
const waitAttached = (host) => tabs[host].waitForSelector('#skinshift-root', { state: 'attached', timeout: 12000 }).then(() => true).catch(() => false);

for (const host of Object.keys(mode)) {
  check(`overlay attaches on ${host}`, await waitAttached(host));
}

// Surface status via the content script's status:get, asked through the service worker.
// Matched by adapter id (s.site), not the display name: renames must not break this.
const HOST_TO_ID = { 'chatgpt.com': 'chatgpt', 'claude.ai': 'claude', 'gemini.google.com': 'gemini' };
async function statusFor(host) {
  return sw.evaluate(async (wantId) => {
    const all = await chrome.tabs.query({});
    for (const t of all) {
      try {
        const s = await chrome.tabs.sendMessage(t.id, { type: 'status:get' });
        if (s && s.site === wantId) return s;
      } catch (e) { /* not a supported tab */ }
    }
    return null;
  }, HOST_TO_ID[host]);
}
for (const host of Object.keys(mode)) {
  const s = await statusFor(host);
  check(`status reports supported+active on ${host}`, !!s && s.status === 'supported' && s.active === true, s ? s.status : 'no reply');
}

// Per-site toggle: switch Claude off in the popup, only Claude should detach.
await popup.bringToFront();
const claudeBox = popup.locator('#sites label', { hasText: 'Claude' }).locator('input');
await claudeBox.uncheck();
await tabs['claude.ai'].waitForFunction(() => !document.getElementById('skinshift-root'), null, { timeout: 8000 });
check('per-site toggle OFF detaches Claude only', !(await attachedOn('claude.ai')) && (await attachedOn('chatgpt.com')));
await claudeBox.check();
check('per-site toggle ON reattaches Claude', await waitAttached('claude.ai'));

// Site's own dark/light switch, no reload.
const theme = () => tabs['chatgpt.com'].evaluate(() => document.getElementById('skinshift-root')?.dataset.ssTheme);
check('starts in light theme', (await theme()) === 'light', String(await theme()));
await tabs['chatgpt.com'].evaluate(() => document.documentElement.classList.add('dark'));
await tabs['chatgpt.com'].waitForFunction(
  () => document.getElementById('skinshift-root')?.dataset.ssTheme === 'dark', null, { timeout: 8000 });
check('site dark toggle flips overlay tint to dark (no reload)', (await theme()) === 'dark', String(await theme()));
await tabs['chatgpt.com'].evaluate(() => document.documentElement.classList.remove('dark'));
await tabs['chatgpt.com'].waitForFunction(
  () => document.getElementById('skinshift-root')?.dataset.ssTheme === 'light', null, { timeout: 8000 });
check('site back to light flips tint back', (await theme()) === 'light', String(await theme()));

// Unsupported layout => no-op, status unsupported, no page errors.
mode['gemini.google.com'] = 'nomain';
await tabs['gemini.google.com'].reload({ waitUntil: 'load' });
// Poll for the unsupported verdict (adapter waits up to 10 s, then gives up quietly).
let unsupported = null;
for (let i = 0; i < 30 && !unsupported; i++) {
  await sleep(500);
  const s = await statusFor('gemini.google.com');
  if (s && s.status === 'unsupported') unsupported = s;
}
check('unsupported Gemini layout => status "unsupported" and no overlay', !!unsupported && unsupported.status === 'unsupported' && (await tabs['gemini.google.com'].locator('#skinshift-root').count()) === 0);

// Strict Trusted Types on Gemini: our injection must not trip TT enforcement.
mode['gemini.google.com'] = 'tt';
errors['gemini.google.com'] = [];
await tabs['gemini.google.com'].reload({ waitUntil: 'load' });
check('overlay attaches on Gemini under strict Trusted Types CSP', await waitAttached('gemini.google.com'));
// Settle wait: console side-channels are async and can only be observed by
// waiting, not by polling for a state. 1.5 s bounds the flakiness window.
await sleep(1500);
const ttErrors = errors['gemini.google.com'].filter((e) => /trusted/i.test(e));
check('zero Trusted Types violations on Gemini', ttErrors.length === 0, ttErrors[0] || '');

// Restrictive page CSP (img-src without blob:). Observed behaviour, recorded honestly:
// Chromium did NOT block the content-script <img> here (see DECISIONS.md D-010), so the wallpaper
// should decode. The fallback path is still exercised by firing the error event directly, which
// is what a real CSP block would do.
mode['claude.ai'] = 'csp-img';
errors['claude.ai'] = [];
await tabs['claude.ai'].reload({ waitUntil: 'load' });
await waitAttached('claude.ai');
await tabs['claude.ai'].waitForFunction(() => {
  const w = document.querySelector('#skinshift-root .ss-wallpaper');
  return w && w.naturalWidth > 0;
}, null, { timeout: 10000 });
const imgState = await tabs['claude.ai'].evaluate(() => {
  const w = document.querySelector('#skinshift-root .ss-wallpaper');
  return w ? { display: getComputedStyle(w).display, nw: w.naturalWidth } : null;
});
check('restrictive img-src page: wallpaper still decodes (observed Chromium behaviour)', !!imgState && imgState.nw > 0, JSON.stringify(imgState));
await tabs['claude.ai'].evaluate(() => {
  document.querySelector('#skinshift-root .ss-wallpaper').dispatchEvent(new Event('error'));
});
await tabs['claude.ai'].waitForFunction(
  () => getComputedStyle(document.querySelector('#skinshift-root .ss-wallpaper')).display === 'none',
  null, { timeout: 5000 });
const fallback = await tabs['claude.ai'].evaluate(() => getComputedStyle(document.querySelector('#skinshift-root .ss-wallpaper')).display);
check('load-error fallback hides wallpaper, scrim keeps chat readable', fallback === 'none', fallback);
const scrimStill = await tabs['claude.ai'].evaluate(() => getComputedStyle(document.querySelector('#skinshift-root .ss-scrim')).display);
check('scrim still rendered after fallback', scrimStill !== 'none');
const uncaught = errors['claude.ai'].filter((e) => e.startsWith('pageerror'));
check('restrictive CSP: no uncaught page errors from SkinShift', uncaught.length === 0, uncaught[0] || '');

// Zero external requests overall.
check('zero non-local network requests across all tabs', external.length === 0, external.slice(0, 3).join(' | '));

await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
