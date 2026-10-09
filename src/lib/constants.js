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
    Object.freeze({ id: 'chatgpt', label: 'ChatGPT' }),
    Object.freeze({ id: 'claude', label: 'Claude' }),
    Object.freeze({ id: 'gemini', label: 'Gemini' })
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
  // Allowlist pick (not Object.assign): stored keys such as __proto__ must not
  // reach the output object, and each field is validated to its domain.
  NS.normalizeSettings = function normalizeSettings(stored) {
    const defaults = NS.defaultSettings();
    if (!stored || typeof stored !== 'object') return defaults;
    const out = defaults;
    if (typeof stored.preset === 'string' && (NS.PRESETS[stored.preset] || stored.preset === 'custom')) {
      out.preset = stored.preset;
    }
    out.opacity = clamp(Number(stored.opacity), 0, 1, NS.PRESETS.light.opacity);
    out.blur = clamp(Number(stored.blur), 0, 40, NS.PRESETS.light.blur);
    out.performanceMode = !!stored.performanceMode;
    out.hasWallpaper = !!stored.hasWallpaper;
    if (Number.isFinite(stored.wallpaperUpdatedAt) && stored.wallpaperUpdatedAt >= 0) {
      out.wallpaperUpdatedAt = stored.wallpaperUpdatedAt;
    }
    const storedSites = stored.sites && typeof stored.sites === 'object' ? stored.sites : {};
    for (const s of NS.SITES) out.sites[s.id] = storedSites[s.id] !== false;
    const smp = stored.sample;
    out.sample = smp && typeof smp === 'object' &&
      Number.isFinite(smp.r) && Number.isFinite(smp.g) && Number.isFinite(smp.b) &&
      smp.r >= 0 && smp.r <= 255 && smp.g >= 0 && smp.g <= 255 && smp.b >= 0 && smp.b <= 255
      ? { r: smp.r, g: smp.g, b: smp.b }
      : null;
    return out;
  };

  function clamp(v, lo, hi, fallback) {
    if (!Number.isFinite(v)) return fallback;
    return Math.min(hi, Math.max(lo, v));
  }
  NS.clamp = clamp;
})(typeof self !== 'undefined' ? self : window);
