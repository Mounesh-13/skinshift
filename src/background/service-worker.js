/*
 * MV3 service worker. Deliberately tiny. It does two jobs:
 *   1. Owns the IndexedDB handle. IDB is extension-origin here, which content scripts cannot
 *      reach (they run in the host page's origin). See DECISIONS.md D-003.
 *   2. Sets the per-tab toolbar badge when a content script reports its state.
 *
 * It holds no state of its own. MV3 can kill this worker at any time, so everything it needs
 * is read from storage on each message.
 */
importScripts('../lib/constants.js', '../lib/idb-wrapper.js');

const NS = self.SkinShift;
const store = NS.createIDBStore(NS.DB);

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) await chrome.storage.local.set({ settings: NS.defaultSettings() });
});

// Chunked to avoid blowing the call-stack limit on large wallpapers (String.fromCharCode.apply).
function bytesToBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function handle(msg, sender) {
  switch (msg && msg.type) {
    case 'wallpaper:get': {
      const record = await store.get(NS.DB.key);
      if (!record || !record.blob) return null;
      const bytes = new Uint8Array(await record.blob.arrayBuffer());
      return { base64: bytesToBase64(bytes), mime: record.blob.type || 'image/jpeg', updatedAt: record.updatedAt };
    }
    case 'badge:set': {
      const tabId = sender.tab && sender.tab.id;
      if (tabId == null) return false;
      // '!' = wallpaper is applied but fails WCAG AA readability. A warning, never a block.
      const text = msg.active ? (msg.warn ? '!' : 'ON') : '';
      await chrome.action.setBadgeBackgroundColor({ tabId, color: msg.warn ? '#ffb020' : '#7c5cff' });
      await chrome.action.setBadgeText({ tabId, text });
      return true;
    }
    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only accept messages from our own extension (content scripts and popup).
  if (!sender || sender.id !== chrome.runtime.id) return false;
  handle(msg, sender).then(sendResponse, () => sendResponse(null));
  return true; // keep the channel open for the async reply
});
