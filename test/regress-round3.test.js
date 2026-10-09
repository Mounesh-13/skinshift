// Round-3 regression tests: detectTheme guard, removeWallpaper resilience,
// normalizeSettings allowlist, parseRgb pins, manifest/adapter consistency.
// Run: node --test test/regress-round3.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
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

// --- detectTheme: real source from overlay-manager.js ---
function loadDetectTheme() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'content', 'overlay-manager.js'), 'utf8');
  const body = extractBody(src, 'function detectTheme()');
  const NS = loadNS('src/lib/constants.js', 'src/lib/contrast.js');
  return new Function('NS', 'document', 'getComputedStyle', body);
}

const colorDoc = (bodyColor, rootColor) => ({
  body: bodyColor === null ? null : { _color: bodyColor },
  documentElement: { _color: rootColor },
});
const gcs = (el) => ({ color: el._color });

test('detectTheme falls back to light when body is missing', () => {
  const detectTheme = loadDetectTheme();
  assert.equal(detectTheme(loadNS('src/lib/constants.js', 'src/lib/contrast.js'), colorDoc(null, 'rgb(0,0,0)'), gcs), 'light');
});

test('detectTheme reads the site text colour (dark site <-> light text)', () => {
  const NS = loadNS('src/lib/constants.js', 'src/lib/contrast.js');
  const detectTheme = loadDetectTheme();
  assert.equal(detectTheme(NS, colorDoc('rgb(236, 236, 236)', 'rgb(0,0,0)'), gcs), 'dark');
  assert.equal(detectTheme(NS, colorDoc('rgb(13, 13, 13)', 'rgb(0,0,0)'), gcs), 'light');
  assert.equal(detectTheme(NS, colorDoc('rgb(128, 128, 128)', 'rgb(0,0,0)'), gcs), 'light'); // 0.216 <= 0.25 threshold pin
});

// --- removeWallpaper: real source from popup.js, IDB delete throws ---
test('removeWallpaper still clears the flag when IDB delete throws', async () => {
  const popupSrc = fs.readFileSync(path.join(ROOT, 'src', 'popup', 'popup.js'), 'utf8');
  const body = extractBody(popupSrc, 'async function removeWallpaper()');
  const removeWallpaper = new AsyncFunction('store', 'save', 'say', 'NS', 'refreshPreview', 'renderAll', body);
  const NS = loadNS('src/lib/constants.js');
  const saved = [];
  const said = [];
  const st = { settings: { ...NS.defaultSettings(), hasWallpaper: true, sample: { r: 1, g: 1, b: 1 } } };
  const store = { delete: async () => { throw new Error('IDB dead'); } };
  const save = async (patch) => {
    saved.push(patch);
    st.settings = NS.normalizeSettings(Object.assign({}, st.settings, patch));
  };
  await removeWallpaper(store, save, (t) => said.push(t), NS, async () => {}, () => {});
  assert.equal(saved.length, 1, 'flag was not cleared when IDB delete threw');
  assert.equal(saved[0].hasWallpaper, false);
  assert.equal(st.settings.hasWallpaper, false);
  assert.ok(said.length >= 1, 'user was not told anything about the failure');
});

// --- normalizeSettings: poisoned storage must not pollute or crash ---
test('normalizeSettings drops __proto__ and repairs a garbage sample', () => {
  const NS = loadNS('src/lib/constants.js');
  const poisoned = JSON.parse('{"preset":"dark","opacity":0.5,"sites":{"chatgpt":false},"__proto__":{"polluted":true}}');
  const out = NS.normalizeSettings(poisoned);
  // Note: out lives in the vm sandbox realm, so its prototype is compared by
  // behaviour (polluted flag visible?) rather than by realm identity.
  assert.equal(out.polluted, undefined, 'settings object prototype was polluted');
  assert.equal({}.polluted, undefined);
  assert.equal(out.preset, 'dark');
  assert.equal(out.sites.chatgpt, false);
  assert.equal(out.sites.claude, true);

  const badSample = NS.normalizeSettings({ ...NS.defaultSettings(), sample: { r: 'x', g: NaN, b: 999 } });
  assert.equal(badSample.sample, null, 'garbage sample must degrade to null (readability hidden)');
  const goodSample = NS.normalizeSettings({ ...NS.defaultSettings(), sample: { r: 1, g: 2, b: 3 } });
  assert.equal(JSON.stringify(goodSample.sample), '{"r":1,"g":2,"b":3}'); // realm-safe value compare
});

// --- parseRgb pins (documented limitations, must not silently change) ---
test('parseRgb pins: percentage channels rejected, alpha ignored (opaque scoring)', () => {
  const NS = loadNS('src/lib/constants.js', 'src/lib/contrast.js');
  assert.equal(NS.parseRgb('rgb(100%, 0%, 0%)'), null);
  assert.deepEqual(Array.from(NS.parseRgb('rgba(10, 20, 30, 0.5)')), [10, 20, 30]);
});

// --- manifest / adapters / selector-spec URLS / SITES consistency guard ---
function loadAdapters() {
  const dir = path.join(ROOT, 'src', 'content', 'site-adapters');
  const sandbox = { self: {}, window: {} };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const f of fs.readdirSync(dir)) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox);
  }
  return sandbox.SkinShift.adapters || [];
}

function collectIssues(manifest, adapters, urlKeys, siteIds) {
  const issues = [];
  const shorts = new Set();
  for (const a of adapters) {
    for (const h of a.hosts || []) shorts.add(h);
    if (!urlKeys.includes(a.id)) issues.push(`adapter ${a.id} has no URLS entry in selector-check.spec.js`);
    if (!siteIds.includes(a.id)) issues.push(`adapter ${a.id} missing from NS.SITES`);
  }
  const matches = new Set((manifest.content_scripts || []).flatMap((cs) => cs.matches || []));
  const perms = new Set(manifest.host_permissions || []);
  for (const h of shorts) {
    if (!matches.has(`https://${h}/*`)) issues.push(`host ${h} missing from manifest content_scripts.matches`);
    if (!perms.has(`https://${h}/*`)) issues.push(`host ${h} missing from manifest host_permissions`);
  }
  return issues;
}

test('manifest, adapters, selector-spec URLS and SITES agree', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const adapters = loadAdapters();
  const specSrc = fs.readFileSync(path.join(ROOT, 'test', 'selector-check.spec.js'), 'utf8');
  const urlKeys = [...specSrc.matchAll(/(\w+):\s*'https:\/\//g)].map((m) => m[1]);
  const NS = loadNS('src/lib/constants.js');
  const siteIds = NS.SITES.map((s) => s.id);
  assert.deepEqual(collectIssues(manifest, adapters, urlKeys, siteIds), []);
  // Sensitivity proof: the same checker must flag a drifted manifest.
  const drifted = JSON.parse(JSON.stringify(manifest));
  drifted.host_permissions = drifted.host_permissions.filter((p) => !p.includes('claude'));
  assert.ok(collectIssues(drifted, adapters, urlKeys, siteIds).length >= 1, 'consistency checker is blind to drift');
});
