// Edge-seam regression tests: site nav/composer chrome (top bars, bottom
// composer bands, sidebars, fades) must not keep opaque backgrounds that cut
// the wallpaper off at the viewport edges.
// Run: node --test test/regress-edges.test.js
//
// T1: applyAdapterCss neutralizes ::before/::after of every cleared container
//     (fades and vignettes live on pseudos; pseudos can't be querySelector-
//     validated, so they are derived from validated bases only).
// T2: every adapter's transparent list covers the structural chrome landmarks
//     (header/footer/aside/nav/form) with plain tag selectors — no site-
//     specific class names that redesigns rename.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function extractBody(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, 'function header not found: ' + header);
  const end = src.indexOf('\n  }', i);
  assert.ok(end > i, 'function end not found for: ' + header);
  return src.slice(src.indexOf('{', i) + 1, end);
}

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

test('T1: cleared containers lose their ::before/::after backgrounds too', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'content', 'overlay-manager.js'), 'utf8');
  const body = extractBody(src, 'function applyAdapterCss()');
  const run = new Function('state', 'document', 'isValidSelector', 'STYLE_ID', body);
  const styleEl = { textContent: '', id: '', isConnected: true };
  const document = { createElement: () => styleEl, head: { appendChild() {} }, documentElement: {} };
  const isValidSelector = (s) => !s.includes('bogus');
  const state = { styleEl: null, adapter: { transparent: ['main', 'bogus-selector', 'header'] } };
  run(state, document, isValidSelector, 'skinshift-adapter-style');
  const css = styleEl.textContent;
  assert.ok(css.includes('main::before'), 'no ::before rule emitted:\n' + css);
  assert.ok(css.includes('header::after'), 'no ::after rule emitted:\n' + css);
  assert.ok(!css.includes('bogus'), 'invalid selector leaked into the rule:\n' + css);
});

test('T2: every adapter clears the structural chrome landmarks', () => {
  const required = ['header', 'footer', 'aside', 'nav', 'form'];
  for (const a of loadAdapters()) {
    const list = a.transparent || [];
    for (const tag of required) {
      assert.ok(list.includes(tag), `${a.id}: transparent list misses <${tag}> (top bars / composer / sidebars keep opaque seams)`);
    }
  }
});
