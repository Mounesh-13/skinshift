/*
 * Site adapter: gemini.google.com
 *
 * Date last verified:      NOT YET VERIFIED LIVE (authored 2026-10-08 without live access)
 * Chrome version tested:   none yet
 * Site URL / version:      https://gemini.google.com (DOM as of authoring; unverified)
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
      '.content-wrapper'
    ]
  });
})(typeof self !== 'undefined' ? self : window);
