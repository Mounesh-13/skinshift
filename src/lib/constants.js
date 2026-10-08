/*
 * Shared constants. Loaded first in every context (service worker, content scripts, popup)
 * so all of them agree on storage keys, limits and defaults.
 *
 * Everything hangs off one namespace, `self.SkinShift`, because we ship classic scripts
 * with no bundler (see DECISIONS.md D-001).
 */
(function (g) {
  'use strict';
  const NS = (g.SkinShift = g.SkinShift || {});

  NS.DB = Object.freeze({ name: 'skinshift', version: 1, store: 'wallpapers', key: 'current' });

  NS.LIMITS = Object.freeze({
    maxUploadBytes: 15 * 1024 * 1024, // rejected BEFORE decoding, so a 200 MB file never hits memory
    maxWidth: 1920,
    maxHeight: 1080,
    jpegQuality: 0.8,
    acceptedTypes: Object.freeze(['image/jpeg', 'image/png', 'image/webp']) // no SVG: it can carry script
  });

  // The scrim tint follows the host site's theme so the layer sits underneath the site's own
  // dark/light toggle instead of fighting it.
  NS.THEME = Object.freeze({
    light: Object.freeze({ rgb: Object.freeze([255, 255, 255]), text: Object.freeze([13, 13, 13]) }),
    dark: Object.freeze({ rgb: Object.freeze([33, 33, 33]), text: Object.freeze([236, 236, 236]) })
  });

  NS.SITES = Object.freeze([
    Object.freeze({ id: 'chatgpt', label: 'ChatGPT' })
  ]);

  NS.PRESETS = Object.freeze({
    light: Object.freeze({ label: 'Light overlay', opacity: 0.82, blur: 6, note: 'Airy light tint' }),
    dark: Object.freeze({ label: 'Dark overlay', opacity: 0.86, blur: 10, note: 'Deeper tint for bright photos' }),
    'high-blur': Object.freeze({ label: 'High blur', opacity: 0.74, blur: 28, note: 'Strong frosted glass' })
  });

  NS.WCAG_AA_RATIO = 4.5;

  NS.STATUS = Object.freeze({ PENDING: 'pending', SUPPORTED: 'supported', UNSUPPORTED: 'unsupported' });

  NS.defaultSettings = function defaultSettings() {
    return {
      version: 1,
      preset: 'light',
      opacity: NS.PRESETS.light.opacity,
      blur: NS.PRESETS.light.blur,
      performanceMode: false,
      sites: Object.fromEntries(NS.SITES.map((s) => [s.id, true])),
      hasWallpaper: false,
      sample: null,
      wallpaperUpdatedAt: 0
    };
  };

  // Merges whatever is in storage with defaults. Missing or malformed data falls back to
  // defaults, so a corrupted settings blob can't brick the extension.
  NS.normalizeSettings = function normalizeSettings(stored) {
    const base = NS.defaultSettings();
    if (!stored || typeof stored !== 'object') return base;
    const out = Object.assign(base, stored);
    out.sites = Object.assign(base.sites, stored.sites && typeof stored.sites === 'object' ? stored.sites : {});
    out.opacity = clamp(Number(out.opacity), 0, 1, base.opacity);
    out.blur = clamp(Number(out.blur), 0, 40, base.blur);
    out.performanceMode = !!out.performanceMode;
    out.hasWallpaper = !!out.hasWallpaper;
    return out;
  };

  function clamp(v, lo, hi, fallback) {
    if (!Number.isFinite(v)) return fallback;
    return Math.min(hi, Math.max(lo, v));
  }
  NS.clamp = clamp;
})(typeof self !== 'undefined' ? self : window);
