/*
 * Site adapter: claude.ai
 *
 * Date last verified:      NOT YET VERIFIED LIVE (authored 2026-10-08 without live access)
 * Chrome version tested:   none yet
 * Site URL / version:      https://claude.ai (DOM as of authoring; unverified)
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
      'div[class*="bg-bg-000"]'
    ]
  });
})(typeof self !== 'undefined' ? self : window);
