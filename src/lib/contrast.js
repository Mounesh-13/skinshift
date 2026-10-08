/*
 * Pure colour math (WCAG 2.x). No DOM access, so it runs in the popup, the content script and
 * in Node for unit tests (test/contrast.test.js).
 *
 * Why this is possible at all: the overlay is a translucent scrim over the wallpaper. Alpha
 * compositing is linear per channel, so the *average* colour of the effective background is
 * exactly the composite of the average wallpaper colour. That means contrast can be judged from
 * one stored average, with no re-decoding of the image on every slider move.
 */
(function (g) {
  'use strict';
  const NS = (g.SkinShift = g.SkinShift || {});

  // Parses rgb()/rgba() strings from getComputedStyle. Returns null for transparent/invalid
  // values so callers can fall back rather than guess.
  function parseRgb(str) {
    if (typeof str !== 'string') return null;
    const m = str.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/);
    if (!m) return null;
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (a === 0) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  function channelToLinear(c) {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  function relativeLuminance(rgb) {
    return (
      0.2126 * channelToLinear(rgb[0]) +
      0.7152 * channelToLinear(rgb[1]) +
      0.0722 * channelToLinear(rgb[2])
    );
  }

  function contrastRatio(rgbA, rgbB) {
    const la = relativeLuminance(rgbA);
    const lb = relativeLuminance(rgbB);
    const hi = Math.max(la, lb);
    const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  // Background as the reader sees it: theme tint at `opacity`, composited over the wallpaper's
  // average colour. `sample` is {r,g,b} in 0..255.
  function effectiveBackground(sample, opacity, themeKey) {
    const tint = NS.THEME[themeKey].rgb;
    const a = NS.clamp(opacity, 0, 1, 0);
    return [0, 1, 2].map((i) => a * tint[i] + (1 - a) * sample[['r', 'g', 'b'][i]]);
  }

  // Evaluates both themes, because the host site can flip between them and the text colour
  // changes with it. Reports the WORST case so the badge never shows a false pass.
  NS.evaluateContrast = function evaluateContrast(sample, opacity) {
    if (!sample) return null;
    const results = Object.keys(NS.THEME).map((themeKey) => {
      const bg = effectiveBackground(sample, opacity, themeKey);
      const ratio = contrastRatio(NS.THEME[themeKey].text, bg);
      return { theme: themeKey, ratio };
    });
    const worst = results.reduce((a, b) => (b.ratio < a.ratio ? b : a));
    return { worst: worst.theme, ratio: worst.ratio, pass: worst.ratio >= NS.WCAG_AA_RATIO, results };
  };

  NS.parseRgb = parseRgb;
  NS.relativeLuminance = relativeLuminance;
  NS.contrastRatio = contrastRatio;
  NS.effectiveBackground = effectiveBackground;
})(typeof self !== 'undefined' ? self : window);
