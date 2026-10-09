// Regression tests for the 5 deferred review findings (F1–F5).
// Run: node --test test/regress-followups.test.js  (~15 s, F2 waits out the real 10 s surface window)
//
// F1: slider drag flushed on popup unload (pagehide), not lost.
// F2: SPA late-mount / pushState nav after the 10 s window promotes to SUPPORTED.
// F3: hasWallpaper=true + missing IDB bytes self-heals to hasWallpaper=false.
// F4: upload validation sniffs magic bytes (File.type is spoofable).
// F5: decompression-bomb pixel cap before canvas allocation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function extractBody(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, 'function header not found: ' + header);
  const end = src.indexOf('\n  }', i);
  assert.ok(end > i, 'function end not found for: ' + header);
  return src.slice(src.indexOf('{', i) + 1, end);
}

function loadNS(...files) {
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const sandbox = { self: {}, window: undefined };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.SkinShift;
}

// --- F1: pagehide flush (real save/saveDebounced/flushPendingSave source from popup.js) ---
test('F1: pending slider debounce is flushed on popup unload', async () => {
  const popupSrc = fs.readFileSync(path.join(ROOT, 'src', 'popup', 'popup.js'), 'utf8');
  assert.ok(popupSrc.includes("addEventListener('pagehide'"), 'pagehide handler is not wired in wire()');
  const adapt = (body) => body
    .replaceAll('Object.assign({}, settings, patch)', 'Object.assign({}, st.settings, patch)')
    .replaceAll('settings = NS.normalizeSettings', 'st.settings = NS.normalizeSettings')
    .replaceAll('({ settings })', '({ settings: st.settings })')
    .replaceAll('saveTimer', 'st.saveTimer');
  const NS = loadNS('src/lib/constants.js');
  const mk = (header) => new AsyncFunction('st', 'patch', 'NS', 'chrome', 'clearTimeout', 'setTimeout',
    adapt(extractBody(popupSrc, header)));
  const save = mk('async function save(patch)');
  const saveDebounced = mk('function saveDebounced(patch)');
  const flushPendingSave = mk('function flushPendingSave()');
  const call = (fn, patch) => fn(st, patch, NS, chrome, clearTimeout, setTimeout);

  const writes = [];
  const chrome = {
    storage: { local: { set: async (obj) => { writes.push(JSON.parse(JSON.stringify(obj.settings))); } } },
  };
  const st = { settings: NS.defaultSettings(), saveTimer: null };

  await call(saveDebounced, { opacity: 0.4, preset: 'custom' }); // drag: write pending, none yet
  assert.equal(writes.length, 0);
  await call(flushPendingSave, undefined); // popup closes <180 ms later
  await sleep(50);
  assert.equal(writes.length, 1, 'drag was lost on unload: no write was flushed');
  assert.equal(writes[0].opacity, 0.4);
  await sleep(300); // stale timer must not double-write
  assert.equal(writes.length, 1);
});

// --- F2: late surface watch (real content-script.js, 10 s window waited out) ---
test('F2: surface mounting after the 10 s window promotes to SUPPORTED', async () => {
  const constSrc = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'constants.js'), 'utf8');
  const csSrc = fs.readFileSync(path.join(ROOT, 'src', 'content', 'content-script.js'), 'utf8');
  const settings = {
    version: 1, preset: 'light', opacity: 0.8, blur: 6, performanceMode: false,
    sites: { chatgpt: true, claude: true, gemini: true },
    hasWallpaper: true, sample: { r: 0, g: 0, b: 0 }, wallpaperUpdatedAt: 7,
  };
  let surfacePresent = false;
  let msgListener = null;
  let attachCalls = 0;
  const observers = [];
  const winListeners = {};
  const loc = { hostname: 'chatgpt.com', href: 'https://chatgpt.com/' };
  const sandbox = {
    self: {},
    window: { addEventListener: (t, fn) => { winListeners[t] = fn; } },
    location: loc,
    document: { querySelector: () => (surfacePresent ? {} : null), documentElement: {}, body: {} },
    MutationObserver: function (cb) { observers.push({ cb, observe() {}, disconnect() {} }); },
    chrome: {
      runtime: { sendMessage: () => Promise.resolve(null), onMessage: { addListener: (fn) => { msgListener = fn; } } },
      storage: {
        local: { get: async () => ({ settings }) },
        onChanged: { addListener: () => {} },
      },
    },
    setTimeout, clearTimeout, Date, Promise, console,
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(constSrc, sandbox);
  sandbox.SkinShift.adapters = [
    { id: 'chatgpt', name: 'ChatGPT', hosts: ['chatgpt.com'], surfaces: ['main'], transparent: [] },
  ];
  sandbox.SkinShift.evaluateContrast = () => ({ pass: true, ratio: 10, worst: 'light' });
  sandbox.SkinShift.overlay = {
    attach: async () => { attachCalls++; return true; },
    detach: () => {},
    isMounted: () => true,
  };

  vm.runInContext(csSrc, sandbox);
  await sleep(11500); // wait out the real 10 s surface window
  assert.ok(msgListener, 'status listener was not registered');
  const statusOf = () => {
    let out = null;
    msgListener({ type: 'status:get' }, null, (r) => { out = r; });
    return out && out.status;
  };
  assert.equal(statusOf(), 'unsupported', 'precondition: surface must be missing after the window');

  // SPA renders late (or pushState-navigates): surface appears, DOM mutates.
  assert.ok(observers.length >= 1, 'late surface watch was not armed after an unsupported verdict');
  surfacePresent = true;
  loc.href = 'https://chatgpt.com/c/abc123';
  observers.forEach((o) => o.cb());
  await sleep(500);

  assert.equal(statusOf(), 'supported', 'late-mounted surface was never promoted to SUPPORTED');
  assert.ok(attachCalls >= 1, 'overlay was not attached after the late surface match');
}, { timeout: 60000 });

// --- F3: IDB self-heal (real refreshPreview source from popup.js) ---
test('F3: missing wallpaper bytes clear a stale hasWallpaper flag', async () => {
  const popupSrc = fs.readFileSync(path.join(ROOT, 'src', 'popup', 'popup.js'), 'utf8');
  const body = extractBody(popupSrc, 'async function refreshPreview()')
    .replaceAll(/\bpreviewUrl\b/g, 'st.previewUrl')
    .replaceAll(/\bsettings\b/g, 'st.settings');
  const refreshPreview = new AsyncFunction('st', 'NS', '$', 'store', 'URL', 'save', 'say', body);
  const NS = loadNS('src/lib/constants.js');

  const el = () => ({ style: { setProperty() {}, removeProperty() {} }, classList: { toggle() {}, add() {} }, hidden: false });
  const $ = () => el();
  const store = { get: async () => null }; // IDB wiped: no bytes
  const URLmock = { revokeObjectURL() {}, createObjectURL: () => 'blob:mock' };
  const st = {
    settings: { ...NS.defaultSettings(), hasWallpaper: true, sample: { r: 1, g: 2, b: 3 }, wallpaperUpdatedAt: 5 },
    previewUrl: null,
  };
  const saved = [];
  const said = [];
  const save = async (patch) => {
    saved.push(patch);
    st.settings = NS.normalizeSettings(Object.assign({}, st.settings, patch));
  };
  await refreshPreview(st, NS, $, store, URLmock, save, (t) => said.push(t));

  assert.equal(saved.length, 1, 'stale hasWallpaper flag was not repaired');
  assert.equal(saved[0].hasWallpaper, false);
  assert.equal(st.settings.hasWallpaper, false);
  assert.equal(st.settings.sample, null);
  assert.ok(said.length >= 1, 'user was not told the stored photo was missing');
});

// --- F4 + F5: image pipeline guards (real image-utils.js, pure parts in Node) ---
function loadImageUtils(extra) {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'constants.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(ROOT, 'src', 'lib', 'image-utils.js'), 'utf8');
  const sandbox = { self: {}, window: undefined, ...(extra || {}) };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.SkinShift;
}

test('F4: magic-byte sniff accepts real types and rejects spoofs', async () => {
  const NS = loadImageUtils();
  assert.equal(typeof NS.sniffImageKind, 'function', 'NS.sniffImageKind is not implemented');
  const u8 = (arr) => new Uint8Array(arr);
  assert.equal(NS.sniffImageKind(u8([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg');
  assert.equal(NS.sniffImageKind(u8([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])), 'image/png');
  assert.equal(NS.sniffImageKind(u8([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])), 'image/webp');
  assert.equal(NS.sniffImageKind(u8([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0])), null); // GIF
  assert.equal(NS.sniffImageKind(u8([0x3C, 0x73, 0x76, 0x67, 0x20, 0, 0, 0, 0, 0, 0, 0])), null); // SVG text
  assert.equal(NS.sniffImageKind(u8([1, 2, 3])), null); // too short

  // End-to-end through validateFile: spoofed JPEG claim with PNG bytes must fail.
  const spoofed = {
    size: 100, type: 'image/jpeg',
    slice: () => ({ arrayBuffer: async () => u8([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]).buffer }),
  };
  let code = null;
  try { await NS.validateFile(spoofed); } catch (e) { code = e && e.code; }
  assert.equal(code, 'bad-type', 'spoofed MIME was not rejected, got: ' + code);

  const honest = {
    size: 100, type: 'image/png',
    slice: () => ({ arrayBuffer: async () => u8([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]).buffer }),
  };
  await NS.validateFile(honest); // must not throw
});

test('F5: absurd bitmap dimensions are rejected before canvas allocation', async () => {
  const NS = loadImageUtils();
  assert.equal(typeof NS.bitmapSizeOk, 'function', 'NS.bitmapSizeOk is not implemented');
  assert.equal(NS.bitmapSizeOk(1920, 1080), true);
  assert.equal(NS.bitmapSizeOk(1, 1), true);
  assert.equal(NS.bitmapSizeOk(30000, 30000), false); // decompression bomb
  assert.equal(NS.bitmapSizeOk(20000, 10), false); // side-length cap

  // End-to-end through prepareWallpaper: no canvas may be allocated for the bomb.
  const NS2 = loadImageUtils({
    createImageBitmap: async () => ({ width: 30000, height: 30000, close() {} }),
    document: { createElement: () => { throw new Error('canvas must not be allocated for absurd bitmaps'); } },
  });
  const file = {
    size: 100, type: 'image/jpeg',
    slice: () => ({
      arrayBuffer: async () => new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer,
    }),
  };
  let code = null;
  try { await NS2.prepareWallpaper(file); } catch (e) { code = e && (e.code || e.message); }
  assert.equal(code, 'too-large', 'bomb was not rejected with too-large, got: ' + code);
});
