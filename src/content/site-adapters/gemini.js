/*
 * Site adapter: gemini.google.com
 *
 * Date last verified:      2026-10-09 live by Mounesh (Profile 6, wallpaper + blur confirmed)
 * Chrome version tested:   154.0.8037.99
 * Site URL / version:      https://gemini.google.com (live DOM 2026-10-09)
 * Known fragile selectors: `chat-app` and `bard-sidenav-container` are Angular custom element
 *                          names that Google renames without notice. Expect breakage here first.
 *
 * Trusted Types note (failure mode #5): we only write to our own <style>.textContent and
 * element attributes via setProperty. There is no innerHTML, eval or string-to-DOM sink, so
 * Gemini's `require-trusted-types-for 'script'` policy should not fire. Test/e2e/multisite.mjs
 * enforces this with a strict-CSP mock page.
 */
(function (g) {
  'use strict';
  const NS = (g.SkinShift = g.SkinShift || {});
  NS.adapters = NS.adapters || [];

  NS.adapters.push({
    id: 'gemini',
    name: 'Gemini',
    hosts: ['gemini.google.com'],
    surfaces: ['chat-app', 'main', '[role="main"]', 'bard-sidenav-container'],
    transparent: [
      'chat-app',
      'main',
      'bard-sidenav-container',
      'mat-sidenav-content',
      '.chat-app-container',
      '.content-wrapper',
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
