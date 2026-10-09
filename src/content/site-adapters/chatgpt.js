/*
 * Site adapter: chatgpt.com
 *
 * Date last verified:      2026-10-09 live by Mounesh (Profile 6, wallpaper + blur confirmed)
 * Chrome version tested:   154.0.8037.99
 * Site URL / version:      https://chatgpt.com (live DOM 2026-10-09)
 * Known fragile selectors: everything under "surfaces" and "transparent" except the generic
 *                          `main` and `[role="main"]`. ChatGPT redesigns often. Run
 *                          test/selector-check.spec.js after every site change.
 *
 * Contract: `surfaces` is an ordered fallback list (most specific first). The first selector
 * that matches marks the site "supported". Zero matches means the adapter is a no-op and the
 * popup shows "unsupported". `transparent` lists the opaque containers to clear so the
 * wallpaper shows through.
 */
(function (g) {
  'use strict';
  const NS = (g.SkinShift = g.SkinShift || {});
  NS.adapters = NS.adapters || [];

  NS.adapters.push({
    id: 'chatgpt',
    name: 'ChatGPT',
    hosts: ['chatgpt.com'],
    surfaces: ['main#main', 'main', '[role="main"]', '#__next'],
    transparent: [
      'main',
      '#__next',
      '[role="presentation"]',
      'div[class*="bg-token-main-surface"]',
      // Page chrome (plain tags, not classes): top bars, bottom composer
      // bands and sidebars keep opaque seams at the viewport edges otherwise.
      'header',
      'footer',
      'aside',
      'nav',
      'form'
    ]
  });
})(typeof self !== 'undefined' ? self : window);
