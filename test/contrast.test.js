// Unit tests for the pure contrast maths (src/lib/contrast.js). Run: node --test test/
// These are the proof behind two product claims:
//   1. Built-in presets pass WCAG AA for ANY wallpaper, because we test the two extremes.
//   2. A genuinely low-contrast setup triggers the warning.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// contrast.js is a browser classic script that writes to `self`. Load it into a sandbox.
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'constants.js'), 'utf8') +
  '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'contrast.js'), 'utf8');
const sandbox = { self: {}, window: undefined };
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const NS = sandbox.SkinShift;

const BLACK = { r: 0, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };
const GREY = { r: 128, g: 128, b: 128 };

test('parseRgb reads rgb() and rgba(), rejects transparent', () => {
  // Arrays from the vm sandbox are a different realm, so compare by value, not prototype.
  const eq = (a, b) => assert.equal(JSON.stringify(Array.from(a)), JSON.stringify(b));
  eq(NS.parseRgb('rgb(10, 20, 30)'), [10, 20, 30]);
  eq(NS.parseRgb('rgba(10, 20, 30, 0.5)'), [10, 20, 30]);
  eq(NS.parseRgb('rgb(10 20 30 / 50%)'), [10, 20, 30]);
  assert.equal(NS.parseRgb('rgba(0, 0, 0, 0)'), null);
  assert.equal(NS.parseRgb('not a colour'), null);
});

test('luminance and ratio match WCAG reference values', () => {
  assert.ok(Math.abs(NS.relativeLuminance([255, 255, 255]) - 1) < 1e-9);
  assert.ok(Math.abs(NS.relativeLuminance([0, 0, 0]) - 0) < 1e-9);
  assert.ok(Math.abs(NS.contrastRatio([0, 0, 0], [255, 255, 255]) - 21) < 1e-9);
  // Reference pair from the WCAG spec: #767676 on white is 4.54:1.
  assert.ok(Math.abs(NS.contrastRatio([118, 118, 118], [255, 255, 255]) - 4.54) < 0.01);
});

test('effective background composites tint over wallpaper linearly', () => {
  const bg = NS.effectiveBackground(GREY, 0.5, 'light'); // 0.5*255 + 0.5*128
  assert.ok(bg.every((v) => Math.abs(v - 191.5) < 1e-9));
  assert.equal(JSON.stringify(Array.from(NS.effectiveBackground(GREY, 1, 'light'))), '[255,255,255]');
  assert.equal(JSON.stringify(Array.from(NS.effectiveBackground(GREY, 0, 'light'))), '[128,128,128]');
});

for (const [id, preset] of Object.entries(NS.PRESETS)) {
  for (const [label, sample] of [['pure black', BLACK], ['pure white', WHITE], ['mid grey', GREY]]) {
    test(`preset "${id}" passes WCAG AA over ${label} in both themes`, () => {
      const r = NS.evaluateContrast(sample, preset.opacity);
      assert.equal(r.pass, true, `worst=${r.worst} ratio=${r.ratio.toFixed(2)}`);
    });
  }
}

test('pure-white wallpaper at low opacity on a dark site triggers the warning', () => {
  const r = NS.evaluateContrast(WHITE, 0.2);
  assert.equal(r.pass, false);
  assert.equal(r.worst, 'dark');
  assert.ok(r.ratio < NS.WCAG_AA_RATIO);
});

test('worst theme is reported, not the first one', () => {
  const r = NS.evaluateContrast(WHITE, 0.2);
  const other = r.results.find((x) => x.theme !== r.worst);
  assert.ok(r.ratio <= other.ratio);
});

test('null sample yields no verdict (no wallpaper uploaded)', () => {
  assert.equal(NS.evaluateContrast(null, 0.5), null);
});

test('normalizeSettings repairs malformed storage instead of throwing', () => {
  const s = NS.normalizeSettings({ opacity: 'banana', blur: 999, sites: null, performanceMode: 'yes' });
  assert.equal(s.opacity, NS.PRESETS.light.opacity);
  assert.equal(s.blur, 40);
  assert.equal(s.performanceMode, true);
  assert.equal(s.sites.chatgpt, true);
});
