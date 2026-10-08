/*
 * Content-script entrypoint. It picks the adapter for this host, waits for the site's main
 * surface to render (SPAs mount late), then keeps the overlay in step with settings.
 *
 * Every path fails silently. A broken selector or a missing API must never break the host page
 * (hard constraint #5), so the whole flow is guarded and nothing is rethrown.
 *
 * What this file deliberately does NOT do: read message text, walk the chat tree, or
 * intercept network traffic. The only DOM query is `querySelector` on the adapter's surface
 * list, to decide whether the site is supported.
 */
(function () {
  'use strict';
  const NS = self.SkinShift;
  const SURFACE_WAIT_MS = 10000; // real chat UIs mount well inside this; longer just delays 'unsupported'
  const SURFACE_POLL_MS = 500;

  const host = location.hostname;
  const adapter = (NS.adapters || []).find((a) =>
    a.hosts.some((h) => host === h || host.endsWith('.' + h))
  );
  if (!adapter) return;

  let status = NS.STATUS.PENDING;
  let settings = null;
  let seq = 0;

  function findSurface() {
    for (const sel of adapter.surfaces) {
      try {
        if (document.querySelector(sel)) return sel;
      } catch (e) {
        // bad selector: skip to the next fallback
      }
    }
    return null;
  }

  function waitForSurface() {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (findSurface()) return resolve(true);
        if (Date.now() - started > SURFACE_WAIT_MS) return resolve(false);
        setTimeout(tick, SURFACE_POLL_MS);
      };
      tick();
    });
  }

  function safeSend(msg) {
    try {
      return chrome.runtime.sendMessage(msg).catch(() => null);
    } catch (e) {
      return Promise.resolve(null); // extension was reloaded: this page is orphaned, do nothing
    }
  }

  async function reconcile() {
    if (!settings) return;
    const mySeq = ++seq;
    const enabled =
      status === NS.STATUS.SUPPORTED && settings.hasWallpaper && settings.sites[adapter.id] !== false;
    try {
      if (enabled) {
        await NS.overlay.attach(settings, adapter);
      } else {
        NS.overlay.detach();
      }
    } catch (e) {
      NS.overlay.detach();
    }
    if (mySeq !== seq) return;
    safeSend({ type: 'badge:set', active: NS.overlay.isMounted() });
  }

  // Popup asks for status. Synchronous reply, so return false from the listener.
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === 'status:get') {
        sendResponse({
          site: adapter.id,
          name: adapter.name,
          status,
          active: NS.overlay.isMounted(),
          enabled: !!(settings && settings.sites[adapter.id] !== false),
          hasWallpaper: !!(settings && settings.hasWallpaper)
        });
      }
      return false;
    });
  } catch (e) {
    // no runtime: nothing to listen to
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      settings = NS.normalizeSettings(changes.settings.newValue);
      reconcile();
    });
  } catch (e) {
    // storage unavailable: overlay stays in its last state
  }

  (async function init() {
    try {
      const stored = await chrome.storage.local.get('settings');
      settings = NS.normalizeSettings(stored.settings);
      const found = await waitForSurface();
      status = found ? NS.STATUS.SUPPORTED : NS.STATUS.UNSUPPORTED;
      await reconcile();
    } catch (e) {
      status = NS.STATUS.UNSUPPORTED;
    }
  })();
})();
