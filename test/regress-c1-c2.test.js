// Regression tests for two review findings (C1, C2). Run: node --test test/regress-c1-c2.test.js
//
// J1: As a user, I drag the opacity slider then immediately pick a preset.
//     The preset sticks and no stale debounce timer writes afterwards.
// J2: As a user on a chat page where the contrast check throws (missing/corrupt
//     lib), the page sees no unhandled rejection and the overlay detaches quietly.
//
// C1 note: the stale timer writes the *live* settings variable, so it cannot
// revive a stale value — but it does emit a redundant storage write (extra
// onChanged churn to every open chat tab). This test pins exactly that:
// one user action sequence => exactly one storage write.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- C1 harness: exercise the REAL save/saveDebounced source from popup.js ---
const popupSrc = fs.readFileSync(path.join(ROOT, 'src', 'popup', 'popup.js'), 'utf8');

function extractBody(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, 'function header not found: ' + header);
  const end = src.indexOf('\n  }', i);
  assert.ok(end > i, 'function end not found for: ' + header);
  return src.slice(src.indexOf('{', i) + 1, end);
}

// Map the closure variables onto a shared state object so the extracted
// functions behave exactly as they do inside popup.js.
function adapt(body) {
  return body
    .replaceAll('Object.assign({}, settings, patch)', 'Object.assign({}, st.settings, patch)')
    .replaceAll('settings = NS.normalizeSettings', 'st.settings = NS.normalizeSettings')
    .replaceAll('({ settings })', '({ settings: st.settings })')
    .replaceAll('saveTimer', 'st.saveTimer');
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function buildFn(body) {
  return new AsyncFunction('st', 'patch', 'NS', 'chrome', 'clearTimeout', 'setTimeout', body);
}

function loadNS() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'constants.js'), 'utf8');
  const sandbox = { self: {}, window: undefined };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.SkinShift;
}

test('C1: immediate save cancels a pending slider debounce (exactly one write)', async () => {
  const NS = loadNS();
  const save = buildFn(adapt(extractBody(popupSrc, 'async function save(patch)')));
  const saveDebounced = buildFn(adapt(extractBody(popupSrc, 'function saveDebounced(patch)')));
  const writes = [];
  const chrome = {
    storage: { local: { set: async (obj) => { writes.push(JSON.parse(JSON.stringify(obj.settings))); } } },
  };
  const st = { settings: NS.defaultSettings(), saveTimer: null };
  const callSave = (patch) => save(st, patch, NS, chrome, clearTimeout, setTimeout);
  const callSaveDebounced = (patch) => saveDebounced(st, patch, NS, chrome, clearTimeout, setTimeout);

  await callSaveDebounced({ opacity: 0.4, preset: 'custom' }); // slider drag: memory updated, write pending
  await callSave({ preset: 'light', opacity: 0.82, blur: 6 }); // preset click: immediate write
  await sleep(300); // let any stale timer fire

  assert.equal(writes.length, 1, `stale debounce timer wrote after an immediate save (${writes.length} writes)`);
  assert.equal(writes[0].preset, 'light');
  assert.equal(writes[0].opacity, 0.82);
});

// --- C2 harness: load the REAL content-script.js in a sandbox with a throwing contrast check ---
test('C2: reconcile never rejects when the contrast check throws', async () => {
  const constSrc = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'constants.js'), 'utf8');
  const csSrc = fs.readFileSync(path.join(ROOT, 'src', 'content', 'content-script.js'), 'utf8');
  const settings = {
    version: 1, preset: 'light', opacity: 0.2, blur: 6, performanceMode: false,
    sites: { chatgpt: true, claude: true, gemini: true },
    hasWallpaper: true, sample: { r: 255, g: 255, b: 255 }, wallpaperUpdatedAt: 123,
  };
  let onChangedFn = null;
  let detachCalls = 0;
  const sandbox = {
    self: {},
    window: undefined,
    location: { hostname: 'chatgpt.com' },
    document: { querySelector: () => ({}) }, // surface present immediately
    chrome: {
      runtime: { sendMessage: () => Promise.resolve(null), onMessage: { addListener: () => {} } },
      storage: {
        local: { get: async () => ({ settings }) },
        onChanged: { addListener: (fn) => { onChangedFn = fn; } },
      },
    },
    setTimeout, clearTimeout, Date, Promise, console,
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(constSrc, sandbox);
  sandbox.SkinShift.evaluateContrast = () => { throw new Error('contrast lib broken'); };
  sandbox.SkinShift.adapters = [
    { id: 'chatgpt', name: 'ChatGPT', hosts: ['chatgpt.com'], surfaces: ['main'], transparent: [] },
  ];
  sandbox.SkinShift.overlay = {
    attach: async () => true,
    detach: () => { detachCalls++; },
    isMounted: () => true,
  };

  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    vm.runInContext(csSrc, sandbox);
    await sleep(300); // let init() settle
    assert.ok(onChangedFn, 'storage.onChanged listener was not registered');

    detachCalls = 0;
    onChangedFn({ settings: { newValue: settings } }, 'local'); // fire-and-forget path from storage.onChanged
    await sleep(300);

    assert.equal(unhandled.length, 0, 'reconcile() rejected on the chat page');
    assert.ok(detachCalls >= 1, 'expected a safe detach when the contrast check throws');
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
});
