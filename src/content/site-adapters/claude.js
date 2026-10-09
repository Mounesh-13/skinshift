/*
 * Site adapter: claude.ai
 *
 * Date last verified:      2026-10-09 live by Mounesh (Profile 6, wallpaper + blur confirmed)
 * Chrome version tested:   154.0.8037.99
 * Site URL / version:      https://claude.ai (live DOM 2026-10-09)
 * Known fragile selectors: the token-class selectors (`bg-bg-*`, `font-claude*`) depend on
 *                          Claude's utility-class naming, which changes with design refreshes.
 *                          `main` and `[role="main"]` are the most stable anchors.
 *
 * Contract: see chatgpt.js. `surfaces` is ordered fallback, first match marks the site
 * supported. `transparent` clears the site's own opaque containers.
 */
(function (g) {
  'use strict';
  const NS = (g.SkinShift = g.SkinShift || {});
  NS.adapters = NS.adapters || [];

  NS.adapters.push({
    id: 'claude',
    name: 'Claude',
    hosts: ['claude.ai'],
    surfaces: ['main', '[role="main"]', 'div[class*="font-claude"]', '#root'],
    transparent: [
      'main',
      '#root',
      'div[class*="bg-bg-100"]',
      'div[class*="bg-bg-200"]',
      'div[class*="bg-bg-000"]',
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
