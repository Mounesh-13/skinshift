/*
 * Popup controller. Reads and writes settings, owns the upload pipeline, renders the live
 * preview and the readability verdict.
 *
 * Settings go to chrome.storage.local (metadata only). The wallpaper Blob goes to IndexedDB.
 * Content scripts pick up changes through storage.onChanged, so the popup never messages tabs
 * to change a setting.
 */
(function () {
  'use strict';
  const NS = self.SkinShift;
  const store = NS.createIDBStore(NS.DB);
  const $ = (id) => document.getElementById(id);

  let settings = null;
  let previewUrl = null;
  let previewTheme = 'light';
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
    clearTimeout(saveTimer); // cancel any pending slider debounce: this write supersedes it
    saveTimer = null;
    settings = NS.normalizeSettings(Object.assign({}, settings, patch));
    await chrome.storage.local.set({ settings });
  }

  // Slider drags fire many input events. Write storage once the user pauses, not per pixel.
  function saveDebounced(patch) {
    settings = NS.normalizeSettings(Object.assign({}, settings, patch));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => chrome.storage.local.set({ settings }), 180);
  }

  // A drag paused <180 ms then a popup close would lose the change, so flush
  // any pending debounce on unload. Fire-and-forget: pagehide allows no awaits.
  function flushPendingSave() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    chrome.storage.local.set({ settings });
  }

  function say(text, isError) {
    const el = $('msg');
    el.textContent = text;
    el.classList.toggle('error', !!isError);
  }

  // Regenerated on every popup open and never stored (failure mode #10).
  async function refreshPreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    $('pv-wall').style.removeProperty('background-image');
    $('preview').classList.toggle('has-wall', false);
    $('remove').hidden = !settings.hasWallpaper;
    if (!settings.hasWallpaper) return;
    const record = await store.get(NS.DB.key);
    if (record && record.blob) {
      previewUrl = URL.createObjectURL(record.blob);
      $('pv-wall').style.setProperty('background-image', 'url("' + previewUrl + '")');
      $('preview').classList.add('has-wall');
      return;
    }
    // Self-heal: the flag says a wallpaper exists but its bytes are gone
    // (e.g. cleared site data). Clear the flag so open tabs detach and the
    // status pill stops saying "waiting…" forever.
    await save({ hasWallpaper: false, sample: null, wallpaperUpdatedAt: 0 });
    say('Stored photo was missing, so SkinShift was turned off. Upload a photo to re-enable.');
  }

  function renderPreview() {
    const scrim = $('pv-scrim');
    const tint = NS.THEME[previewTheme].rgb.join(', ');
    scrim.style.setProperty('background-color', 'rgba(' + tint + ', ' + settings.opacity + ')');
    scrim.style.setProperty(
      'backdrop-filter',
      settings.performanceMode ? 'none' : 'blur(' + settings.blur + 'px)'
    );
    $('preview').classList.toggle('is-dark', previewTheme === 'dark');
    document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.theme === previewTheme));
  }

  function renderPresets() {
    const wrap = $('presets');
    wrap.textContent = '';
    Object.entries(NS.PRESETS).forEach(([id, p]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset' + (settings.preset === id ? ' is-on' : '');
      btn.dataset.preset = id;
      btn.setAttribute('aria-pressed', String(settings.preset === id));

      const swatch = document.createElement('span');
      swatch.className = 'preset-swatch';
      const name = document.createElement('strong');
      name.textContent = p.label;
      const note = document.createElement('small');
      note.textContent = p.note;

      btn.append(swatch, name, note);
      btn.addEventListener('click', () => applyPreset(id));
      wrap.appendChild(btn);
    });
  }

  function renderControls() {
    const pct = Math.round(settings.opacity * 100);
    $('opacity').value = pct;
    $('opacity-out').textContent = pct + '%';
    $('blur').value = settings.blur;
    $('blur-out').textContent = settings.blur + 'px';
    $('blur').disabled = settings.performanceMode;
    $('perf').checked = settings.performanceMode;
  }

  function renderReadability() {
    const box = $('readability');
    if (!settings.sample) {
      box.hidden = true;
      return;
    }
    const v = NS.evaluateContrast(settings.sample, settings.opacity);
    box.hidden = false;
    box.className = 'readability ' + (v.pass ? 'pass' : 'warn');
    $('read-ratio').textContent = v.ratio.toFixed(1) + ':1';
    $('read-text').textContent = v.pass
      ? 'Chat text clears WCAG AA (4.5:1) in light and dark mode.'
      : 'Below WCAG AA (4.5:1) on the ' + v.worst + ' theme. Raise opacity or try a darker photo. The wallpaper still applies.';
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
        save({ sites: Object.assign({}, settings.sites, { [site.id]: box.checked }) });
      });

      row.append(name, box);
      wrap.appendChild(row);
    });
  }

  function renderAll() {
    renderPresets();
    renderControls();
    renderPreview();
    renderReadability();
    renderSites();
  }

  async function applyPreset(id) {
    const p = NS.PRESETS[id];
    if (!p) return;
    await save({ preset: id, opacity: p.opacity, blur: p.blur });
    renderAll();
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
      if (status.status === NS.STATUS.UNSUPPORTED) setPill(status.name + ': layout not recognised', 'pill-warn');
      else if (status.active) setPill(status.name + ': active', 'pill-ok');
      else if (!status.hasWallpaper) setPill(status.name + ': upload a photo', 'pill-muted');
      else if (!status.enabled) setPill(status.name + ': off for this site', 'pill-muted');
      else setPill(status.name + ': waiting…', 'pill-muted');
    } catch (e) {
      setPill('Open a supported chat to see status', 'pill-muted');
    }
  }

  async function onFile(file) {
    try {
      const out = await NS.prepareWallpaper(file);
      const updatedAt = Date.now(); // one timestamp for both stores, so versions always agree
      await store.put(NS.DB.key, { blob: out.blob, width: out.width, height: out.height, updatedAt });
      await save({ hasWallpaper: true, sample: out.sample, wallpaperUpdatedAt: updatedAt });
      say('Saved (' + out.width + '×' + out.height + '). Applied to open chat tabs.');
      await refreshPreview();
      renderAll();
    } catch (err) {
      say(ERRORS[err && err.code] || 'Something went wrong saving that image.', true);
    }
  }

  async function removeWallpaper() {
    // The flag must clear even if the bytes stick, or tabs stay attached to a
    // photo that can never load. The user is told when it was not clean.
    let clean = true;
    try {
      await store.delete(NS.DB.key);
    } catch (e) { clean = false; }
    await save({ hasWallpaper: false, sample: null, wallpaperUpdatedAt: 0 });
    say(clean ? 'Wallpaper removed. Chat pages are back to stock.'
              : 'SkinShift was turned off, but the stored photo could not be deleted.', !clean);
    await refreshPreview();
    renderAll();
  }

  // Resets the look only. Keeps the wallpaper, site toggles and everything else the user chose.
  async function resetLook() {
    const d = NS.defaultSettings();
    await save({
      preset: d.preset,
      opacity: d.opacity,
      blur: d.blur,
      performanceMode: d.performanceMode
    });
    say('Look reset to Light overlay defaults.');
    renderAll();
  }

  function wire() {
    window.addEventListener('pagehide', () => {
      flushPendingSave();
      if (previewUrl) {
        try { URL.revokeObjectURL(previewUrl); } catch (e) {}
        previewUrl = null;
      }
    });
    $('file-input').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = ''; // allow re-selecting the same file
      if (file) onFile(file);
    });
    $('remove').addEventListener('click', removeWallpaper);
    $('reset').addEventListener('click', resetLook);

    document.querySelectorAll('.seg-btn').forEach((b) => {
      b.addEventListener('click', () => {
        previewTheme = b.dataset.theme;
        renderPreview();
      });
    });

    $('opacity').addEventListener('input', (e) => {
      const v = Number(e.target.value) / 100;
      $('opacity-out').textContent = e.target.value + '%';
      saveDebounced({ opacity: v, preset: 'custom' });
      renderPreview();
      renderReadability();
      renderPresets();
    });
    $('blur').addEventListener('input', (e) => {
      $('blur-out').textContent = e.target.value + 'px';
      saveDebounced({ blur: Number(e.target.value), preset: 'custom' });
      renderPreview();
      renderPresets();
    });
    $('perf').addEventListener('change', (e) => {
      $('blur').disabled = e.target.checked;
      save({ performanceMode: e.target.checked });
      renderPreview();
    });
  }

  (async function init() {
    settings = await loadSettings();
    wire();
    renderAll();
    await refreshPreview();
    await refreshSiteStatus();
  })();
})();
