/*
 * Popup controller. Reads and writes settings, owns the upload pipeline, and renders the live
 * preview. Settings go to chrome.storage.local (metadata only). The wallpaper Blob goes to
 * IndexedDB. Content scripts pick up changes through storage.onChanged, so the popup never
 * messages tabs directly for settings.
 */
(function () {
  'use strict';
  const NS = self.SkinShift;
  const store = NS.createIDBStore(NS.DB);
  const $ = (id) => document.getElementById(id);

  let settings = null;
  let previewUrl = null;
  let saveTimer = null;

  const ERRORS = {
    'too-large': 'That file is over 15 MB. Try a smaller image.',
    'bad-type': 'Use a JPEG, PNG or WebP image.',
    'decode-failed': 'Could not read that image. It may be corrupted.',
    'encode-failed': 'Could not process the image. Try another file.'
  };

  async function loadSettings() {
    const r = await chrome.storage.local.get('settings');
    return NS.normalizeSettings(r.settings);
  }

  async function save(patch) {
    settings = NS.normalizeSettings(Object.assign({}, settings, patch));
    await chrome.storage.local.set({ settings });
  }

  function saveDebounced(patch) {
    settings = NS.normalizeSettings(Object.assign({}, settings, patch));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => chrome.storage.local.set({ settings }), 180);
  }

  function say(text, isError) {
    const el = $('msg');
    el.textContent = text;
    el.classList.toggle('error', !!isError);
  }

  // Regenerated on every popup open. Never persisted (failure mode #10).
  async function refreshPreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    $('pv-wall').style.setProperty('background-image', '');
    $('remove').hidden = !settings.hasWallpaper;
    if (!settings.hasWallpaper) return;
    const record = await store.get(NS.DB.key);
    if (record && record.blob) {
      previewUrl = URL.createObjectURL(record.blob);
      $('pv-wall').style.setProperty('background-image', 'url("' + previewUrl + '")');
    }
  }

  function renderPreviewScrim() {
    const tint = NS.THEME.light.rgb.join(', ');
    $('pv-scrim').style.setProperty('background-color', 'rgba(' + tint + ', ' + settings.opacity + ')');
    $('pv-scrim').style.setProperty(
      'backdrop-filter',
      settings.performanceMode ? 'none' : 'blur(' + settings.blur + 'px)'
    );
  }

  function renderControls() {
    $('opacity').value = Math.round(settings.opacity * 100);
    $('opacity-out').textContent = Math.round(settings.opacity * 100) + '%';
    $('blur').value = settings.blur;
    $('blur-out').textContent = settings.blur + 'px';
    $('blur').disabled = settings.performanceMode;
    $('perf').checked = settings.performanceMode;
    renderPreviewScrim();
  }

  function renderSites() {
    const wrap = $('sites');
    wrap.textContent = '';
    NS.SITES.forEach((site) => {
      const row = document.createElement('label');
      row.className = 'site';

      const name = document.createElement('span');
      name.textContent = site.label;

      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = settings.sites[site.id] !== false;
      box.addEventListener('change', () => {
        const sites = Object.assign({}, settings.sites, { [site.id]: box.checked });
        save({ sites });
      });

      row.append(name, box);
      wrap.appendChild(row);
    });
  }

  async function refreshSiteStatus() {
    const pill = $('site-status');
    const setPill = (text, cls) => {
      pill.textContent = text;
      pill.className = 'pill ' + cls;
    };
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || tab.id == null) throw new Error('no-tab');
      const status = await chrome.tabs.sendMessage(tab.id, { type: 'status:get' });
      if (!status) throw new Error('no-content');
      if (status.status === NS.STATUS.UNSUPPORTED) setPill(status.name + ': unsupported', 'pill-warn');
      else if (status.active) setPill(status.name + ': active', 'pill-ok');
      else if (!status.hasWallpaper) setPill(status.name + ': upload a wallpaper', 'pill-muted');
      else if (!status.enabled) setPill(status.name + ': off for this site', 'pill-muted');
      else setPill(status.name + ': waiting…', 'pill-muted');
    } catch (e) {
      setPill('Open ChatGPT to preview', 'pill-muted');
    }
  }

  async function onFile(file) {
    try {
      const out = await NS.prepareWallpaper(file);
      const updatedAt = Date.now();
      await store.put(NS.DB.key, { blob: out.blob, width: out.width, height: out.height, updatedAt });
      await save({ hasWallpaper: true, sample: out.sample, wallpaperUpdatedAt: updatedAt });
      say('Saved (' + out.width + '×' + out.height + '). Applied to open chat tabs.');
      await refreshPreview();
    } catch (err) {
      say(ERRORS[err && err.code] || 'Something went wrong saving that image.', true);
    }
  }

  async function removeWallpaper() {
    await store.delete(NS.DB.key);
    await save({ hasWallpaper: false, sample: null, wallpaperUpdatedAt: 0 });
    say('Wallpaper removed. Chat pages are back to stock.');
    await refreshPreview();
  }

  function wire() {
    $('file-input').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = ''; // allow re-selecting the same file
      if (file) onFile(file);
    });
    $('remove').addEventListener('click', removeWallpaper);

    $('opacity').addEventListener('input', (e) => {
      const v = Number(e.target.value) / 100;
      $('opacity-out').textContent = e.target.value + '%';
      saveDebounced({ opacity: v });
      renderPreviewScrim();
    });
    $('blur').addEventListener('input', (e) => {
      $('blur-out').textContent = e.target.value + 'px';
      saveDebounced({ blur: Number(e.target.value) });
      renderPreviewScrim();
    });
    $('perf').addEventListener('change', (e) => {
      $('blur').disabled = e.target.checked;
      save({ performanceMode: e.target.checked });
      renderPreviewScrim();
    });
  }

  (async function init() {
    settings = await loadSettings();
    wire();
    renderControls();
    renderSites();
    await refreshPreview();
    await refreshSiteStatus();
  })();
})();
