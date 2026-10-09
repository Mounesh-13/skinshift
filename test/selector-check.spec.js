// LIVE selector-resilience check (failure mode #1: "make maintenance debt visible").
//
// This runs against the REAL sites, so it cannot run headless in CI without logins.
// Manual run steps (also in docs/QA_CHECKLIST.md):
//   1. npm i && npx playwright install chromium
//   2. HEADED=1 npx playwright test test/selector-check.spec.js
//   3. A browser opens with a persistent profile in test/.profile/. Log in to ChatGPT, Claude
//      and Gemini in its tabs, then return to the terminal and press Enter.
//   4. The test reads each adapter's selector list from src/content/site-adapters/*.js and
//      reports which fallbacks resolve. It fails only when a site has NO surface match at all,
//      which means the extension is a silent no-op there and the adapter needs updating.
//
// Why this reads the adapter files: the adapter is the single source of truth. Duplicating its
// selectors here would let the two drift apart, which is exactly the rot this file exists to catch.
const { test, expect, chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const ADAPTER_DIR = path.join(__dirname, '..', 'src', 'content', 'site-adapters');
const PROFILE = path.join(__dirname, '.profile');

// Reads the `surfaces` and `transparent` arrays out of an adapter file without executing it in
// a browser context. The files are plain JS, so we evaluate them against a stub `self`.
function loadAdapters() {
  const adapters = [];
  for (const f of fs.readdirSync(ADAPTER_DIR)) {
    const src = fs.readFileSync(path.join(ADAPTER_DIR, f), 'utf8');
    const sandbox = { self: {}, window: {} };
    sandbox.self.SkinShift = {};
    new Function('self', 'window', src)(sandbox.self, sandbox.window);
    adapters.push(...(sandbox.self.SkinShift.adapters || []));
  }
  return adapters;
}

const URLS = { chatgpt: 'https://chatgpt.com/', claude: 'https://claude.ai/new', gemini: 'https://gemini.google.com/app' };

function waitForEnter(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(msg, () => { rl.close(); resolve(); }));
}

test.describe('live selector check', () => {
  test.skip(!process.env.HEADED, 'Live check: set HEADED=1 and log in when prompted.');

  for (const adapter of loadAdapters()) {
    test(`${adapter.name}: at least one surface selector resolves`, async () => {
      const context = await chromium.launchPersistentContext(PROFILE, { headless: false, channel: 'chromium' });
      const page = await context.newPage();
      await page.goto(URLS[adapter.id], { waitUntil: 'domcontentloaded' });
      await waitForEnter(`[${adapter.name}] Log in if needed and let the chat load, then press Enter… `);

      const report = await page.evaluate(({ surfaces, transparent }) => {
        const count = (sel) => { try { return document.querySelectorAll(sel).length; } catch (e) { return 'INVALID'; } };
        return {
          surfaces: surfaces.map((s) => ({ s, n: count(s) })),
          transparent: transparent.map((s) => ({ s, n: count(s) }))
        };
      }, { surfaces: adapter.surfaces, transparent: adapter.transparent });

      console.log(`\n=== ${adapter.name} ===`);
      report.surfaces.forEach((r) => console.log(`  surface     ${r.n === 'INVALID' ? 'INVALID' : String(r.n).padStart(4)}  ${r.s}`));
      report.transparent.forEach((r) => console.log(`  transparent ${r.n === 'INVALID' ? 'INVALID' : String(r.n).padStart(4)}  ${r.s}`));

      const firstHit = report.surfaces.find((r) => typeof r.n === 'number' && r.n > 0);
      // Maintenance signal: a fallback other than the first one is working, so the top choice is stale.
      if (firstHit && firstHit.s !== adapter.surfaces[0]) {
        console.warn(`  WARNING: primary selector is stale; fallback "${firstHit.s}" is carrying ${adapter.name}.`);
      }
      const transparentHits = report.transparent.filter((r) => typeof r.n === 'number' && r.n > 0).length;
      // A supported page with zero transparency matches hides the wallpaper
      // behind opaque site UI: fail, do not just warn. Run logged-in; a login
      // wall is not a supported page.
      expect(transparentHits, `No transparency selector matched on ${adapter.name}: the wallpaper would hide behind opaque site UI.`).toBeGreaterThan(0);
      await context.close();
      expect(firstHit, `No surface selector matched on ${adapter.name}. Update src/content/site-adapters/${adapter.id}.js`).toBeTruthy();
    });
  }
});
