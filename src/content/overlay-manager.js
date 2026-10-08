/*
 * OverlayManager: owns the single background layer SkinShift draws.
 *
 * Why the layer is a direct child of <body> at z-index:-1:
 *   React re-renders replace chat nodes. A layer injected deep inside them is wiped with them.
 *   Ours is a sibling of the app root, so most re-renders don't touch it. A MutationObserver
 *   re-inserts it if something does (failure mode #2).
 *
 * Why site backgrounds are cleared with a selector-based <style> rule, not inline styles:
 *   a selector keeps applying to nodes React creates later. Inline styles would be lost on
 *   the next render.
 *
 * Why the wallpaper object URL is created fresh on every page load:
 *   object URLs die on reload and on service-worker restart. We never persist one. We store
 *   the Blob and regenerate the URL each time (failure mode #10).
 *
 * Every public path is wrapped so that a failure degrades to "no overlay", never to a thrown
 * error on the host page (hard constraint #5).
 */
(function (g) {
  'use strict';
  const NS = (g.SkinShift = g.SkinShift || {});

  const ROOT_ID = 'skinshift-root';
  const STYLE_ID = 'skinshift-adapter-style';
  const THROTTLE_MS = 250;

  const state = {
    epoch: 0,
    root: null,
    wallpaperEl: null,
    scrimEl: null,
    styleEl: null,
    adapter: null,
    settings: null,
    objectUrl: null,
    loadedVersion: null,
    blocked: false,
    mounted: false,
    observers: [],
    lastTheme: null
  };

  // Trailing-edge throttle: runs immediately, then at most once per `ms`, and always once more
  // after a burst so the final state is never missed.
  function throttle(fn, ms) {
    let waiting = false;
    let queued = false;
    const run = () => {
      if (waiting) {
        queued = true;
        return;
      }
      fn();
      waiting = true;
      setTimeout(() => {
        waiting = false;
        if (queued) {
          queued = false;
          run();
        }
      }, ms);
    };
    return run;
  }

  function isValidSelector(sel) {
    try {
      document.createDocumentFragment().querySelector(sel);
      return true;
    } catch (e) {
      return false; // one bad selector must not invalidate the whole rule
    }
  }

  // Theme is read from the site's own text colour. Our layer makes backgrounds transparent, so
  // background colour is no longer a reliable signal. Light text means a dark site.
  function detectTheme() {
    const color =
      NS.parseRgb(getComputedStyle(document.body).color) ||
      NS.parseRgb(getComputedStyle(document.documentElement).color);
    if (!color) return 'light';
    return NS.relativeLuminance(color) > 0.25 ? 'dark' : 'light';
  }

  function buildElements() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-hidden', 'true');

    const wallpaper = document.createElement('div');
    wallpaper.className = 'ss-wallpaper';

    const scrim = document.createElement('div');
    scrim.className = 'ss-scrim';

    root.appendChild(wallpaper);
    root.appendChild(scrim);
    state.root = root;
    state.wallpaperEl = wallpaper;
    state.scrimEl = scrim;
  }

  function applyVisuals() {
    const s = state.settings;
    if (!state.root || !s) return;

    const theme = detectTheme();
    state.lastTheme = theme;

    state.root.dataset.ssTheme = theme;
    state.root.dataset.ssMode = s.performanceMode ? 'perf' : 'blur';
    state.root.style.setProperty('--ss-rgb', NS.THEME[theme].rgb.join(', '));
    state.root.style.setProperty('--ss-opacity', String(NS.clamp(s.opacity, 0, 1, 0.8)));
    state.root.style.setProperty('--ss-blur', NS.clamp(s.blur, 0, 40, 6) + 'px');

    if (state.blocked || !state.objectUrl) {
      state.wallpaperEl.style.setProperty('display', 'none');
    } else {
      state.wallpaperEl.style.setProperty('display', 'block');
      state.wallpaperEl.style.setProperty('background-image', 'url("' + state.objectUrl + '")');
    }
  }

  // Clears the site's own opaque surfaces so the layer shows through. Only surfaces are touched.
  // Cards and message bubbles keep their own backgrounds, which keeps the site's text contrast.
  function applyAdapterCss() {
    if (!state.styleEl) {
      state.styleEl = document.createElement('style');
      state.styleEl.id = STYLE_ID;
    }
    const selectors = ['html', 'body'].concat(state.adapter.transparent || []).filter(isValidSelector);
    // textContent, not innerHTML: keeps us clear of Trusted Types string sinks (failure mode #5).
    state.styleEl.textContent =
      selectors.join(', ') + ' { background-color: transparent !important; background-image: none !important; }';
    if (!state.styleEl.isConnected) (document.head || document.documentElement).appendChild(state.styleEl);
  }

  function mountRoot() {
    const body = document.body;
    if (!body || !state.root) return;
    if (!state.root.isConnected) body.insertBefore(state.root, body.firstChild);
    if (state.styleEl && !state.styleEl.isConnected) {
      (document.head || document.documentElement).appendChild(state.styleEl);
    }
  }

  // Probe the wallpaper with a separate Image. A page CSP that blocks blob: images would
  // otherwise fail silently and leave a blank layer.
  function probe(url) {
    const img = new Image();
    img.onerror = () => {
      if (url !== state.objectUrl) return; // a newer wallpaper has replaced this one
      state.blocked = true;
      applyVisuals();
    };
    img.src = url;
  }

  async function ensureWallpaper(version) {
    if (state.objectUrl && state.loadedVersion === version) return true;

    const payload = await chrome.runtime.sendMessage({ type: 'wallpaper:get' });
    if (!payload || !payload.base64) return false;

    // Decode base64 locally. No fetch(), so the page's connect-src CSP doesn't apply.
    const binary = atob(payload.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: payload.mime || 'image/jpeg' });

    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = URL.createObjectURL(blob);
    state.loadedVersion = version;
    state.blocked = false;
    probe(state.objectUrl);
    return true;
  }

  function startObservers() {
    if (state.observers.length) return;

    // Re-attach the layer if the host removes it (failure mode #2).
    const ensureMounted = throttle(() => {
      if (!state.mounted) return;
      mountRoot();
    }, THROTTLE_MS);
    const bodyObserver = new MutationObserver(ensureMounted);
    bodyObserver.observe(document.body, { childList: true });

    // Re-check the theme when the site flips its own dark/light toggle.
    const checkTheme = throttle(() => {
      if (state.mounted && detectTheme() !== state.lastTheme) applyVisuals();
    }, 500);
    const themeObserver = new MutationObserver(checkTheme);
    const attrs = { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-mode'] };
    themeObserver.observe(document.documentElement, attrs);
    themeObserver.observe(document.body, attrs);

    state.observers = [bodyObserver, themeObserver];
  }

  function stopObservers() {
    state.observers.forEach((o) => o.disconnect());
    state.observers = [];
  }

  // Idempotent: called on every settings change. Re-applies visuals, reloads the wallpaper only
  // if its version changed, and reports whether the layer is mounted.
  async function attach(settings, adapter) {
    const epoch = ++state.epoch;
    state.settings = settings;
    state.adapter = adapter;

    const ok = await ensureWallpaper(settings.wallpaperUpdatedAt);
    if (epoch !== state.epoch) return state.mounted; // a newer call superseded this one
    if (!ok) {
      detach();
      return false;
    }

    if (!state.root) buildElements();
    applyAdapterCss();
    mountRoot();
    applyVisuals();
    state.mounted = true;
    startObservers();
    return true;
  }

  function detach() {
    state.epoch++;
    stopObservers();
    if (state.root) state.root.remove();
    if (state.styleEl) state.styleEl.remove();
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
      state.loadedVersion = null;
    }
    state.mounted = false;
  }

  NS.overlay = {
    attach,
    detach,
    isMounted: () => state.mounted
  };
})(typeof self !== 'undefined' ? self : window);
