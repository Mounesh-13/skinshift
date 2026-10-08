// Generates docs/screenshots from a real Chromium run with the extension loaded.
// Uses MOCK chat pages (see docs/QA_CHECKLIST.md): these are not captures of the live sites.
// Run: node tools/screenshots.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinshift-shot-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--no-sandbox']
});
const sw = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
const extId = sw.url().split('/')[2];

const MOCK = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font-family:system-ui,sans-serif;color:#0d0d0d;background:#fff}
  main{min-height:100vh;padding:40px 0;box-sizing:border-box;background:#fff;display:flex;flex-direction:column;align-items:center;gap:14px}
  .u{align-self:center;max-width:560px;background:#f4f4f4;border-radius:18px;padding:12px 16px;font-size:15px}
  .a{max-width:620px;font-size:15px;line-height:1.6;padding:0 16px}
  h2{font-size:14px;color:#666;font-weight:600;margin:0}
</style></head><body><div id="__next"><main id="main">
  <div class="u">Plan a calm weekend in Hyderabad.</div>
  <div class="a">Here is a relaxed two-day plan: a slow breakfast in Banjara Hills, a walk around Hussain Sagar at sunset, and a quiet evening at a rooftop cafe.</div>
  <div class="u">Add something outdoors for Sunday.</div>
  <div class="a">Sunday works well for Shilparamam crafts village in the morning, then lunch near Jubilee Hills.</div>
</main></div></body></html>`;

await context.route('https://chatgpt.com/**', (r) => {
  const u = new URL(r.request().url());
  if (u.pathname !== '/') return r.fulfill({ status: 404, body: '' });
  return r.fulfill({ status: 200, contentType: 'text/html', body: MOCK });
});

const popup = await context.newPage();
await popup.setViewportSize({ width: 380, height: 900 });
await popup.goto(`chrome-extension://${extId}/src/popup/popup.html`);
await popup.setInputFiles('#file-input', path.join(ROOT, 'test/fixtures/wallpaper-sample.jpg'));
await popup.waitForFunction(() => document.getElementById('msg').textContent.startsWith('Saved'));
await popup.click('.preset[data-preset="light"]');
await sleep(400);

const chat = await context.newPage();
await chat.setViewportSize({ width: 1280, height: 800 });
const before = await context.newPage();
await before.setViewportSize({ width: 1280, height: 800 });
await before.route('https://chatgpt.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: MOCK.replace('<div id="__next">', '<div id="__next" data-stock="1">') }));
await chat.goto('https://chatgpt.com/', { waitUntil: 'load' });
await chat.waitForSelector('#skinshift-root', { state: 'attached', timeout: 10000 });
await sleep(900);

// Stock comparison: same page with no overlay (second context so no extension is involved).
const plain = await (await chromium.launch({ channel: 'chromium', headless: true })).newPage({ viewport: { width: 1280, height: 800 } });
await plain.route('https://chatgpt.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: MOCK }));
await plain.goto('https://chatgpt.com/', { waitUntil: 'load' });

await plain.screenshot({ path: path.join(OUT, 'before-stock-chat.png') });
await chat.screenshot({ path: path.join(OUT, 'after-skinshift-chat.png') });
await popup.screenshot({ path: path.join(OUT, 'popup.png'), fullPage: true });
console.log('screenshots written to docs/screenshots');
await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
process.exit(0);
