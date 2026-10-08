# DECISIONS.md

Running log of design decisions and deviations from the original plan. Each entry:
**what changed → why → tradeoffs considered.**

---

## D-001 — No bundler; plain classic scripts (Phase 0)
- **Plan:** "use esbuild/Vite only if genuinely needed to bundle idb."
- **Decision:** No build step at all. Every file is a plain classic script that attaches to a single
  namespace (`self.SkinShift`). The IndexedDB helper is a ~80-line hand-written wrapper, so there is
  nothing to bundle.
- **Why:** The product's selling point is auditability. Anyone can read `src/` and see exactly what
  runs. A bundler adds a transpile step and a `dist/` that could drift from source.
- **Tradeoffs:** No ES module imports between content-script files. Load order is controlled by the
  `content_scripts.js` array in `manifest.json` and the `<script>` tag order in `popup.html`. This is
  simple enough at this size. If the codebase passes roughly 3–4k lines, revisit.

## D-002 — Own IndexedDB wrapper instead of vendoring `idb`
- **Plan:** "vendor a tiny wrapper."
- **Decision:** Write a small wrapper in `src/lib/idb-wrapper.js` instead of copying the `idb`
  library.
- **Why:** The needs are narrow (one store, get/put/delete). Vendoring a third-party file adds
  licensing and update overhead, and it is one more file to audit.

## D-003 — Wallpaper bytes are read by the service worker, not the content script
- **Plan (implied):** the content script reads the wallpaper Blob from IndexedDB.
- **Problem found in design:** content scripts run in the *host page's origin*
  (`https://chatgpt.com`). IndexedDB is origin-scoped, so a content script cannot see the
  `chrome-extension://` database the popup writes to.
- **Decision:** The service worker (extension origin) reads the Blob from IndexedDB and returns it
  to the content script as a base64 string over `chrome.runtime` messaging. The content script
  decodes it locally with `atob` into a `Blob`, then calls `URL.createObjectURL`.
- **Why it's still private:** no network. `chrome.runtime` messaging is in-process. `fetch()` is not
  used, so page `connect-src` CSP does not apply.
- **Tradeoff:** base64 inflates about 33%. A 1920×1080 JPEG at 80% is typically 300–600 KB, so this
  is acceptable.

## D-004 — Metadata in `chrome.storage.local`, Blob in IndexedDB (as planned)
- Kept as planned. Only the sampled luminance statistics (`sample`) are stored with the metadata,
  so contrast can be recomputed without decoding the image.

## D-005 — No `tabs` permission
- **Plan:** minimal permissions: `storage`, `unlimitedStorage`, scoped host permissions.
- **Decision:** `chrome.tabs.query` is used only to obtain a tab id, which works without the `tabs`
  permission. Messages to a tab work under the host permission. The popup never reads tab URLs.
- **Result:** the permission list matches the hard constraint exactly.

## D-006 — `chat.openai.com` is not in host permissions
- It redirects to `chatgpt.com`. Requesting a second host for a redirect is an unnecessary
  permission. Revisit only if users report the redirect is not followed.

## D-007 — No `trusted-types.js` in v0.1.0 (provisional)
- **Plan:** `lib/trusted-types.js` "if needed."
- **Decision:** not created. Trusted Types only restricts string-to-DOM sinks (`innerHTML`,
  `eval`, `script.src` from strings, and so on). The content scripts use `createElement`,
  `setAttribute`, `style.setProperty`, and `textContent` on our own `<style>` elements. Nothing
  reaches a string sink.
- **Status:** to be confirmed by a live Gemini test in Phase 4. If a violation appears, add a
  scoped policy then and log it here.

## D-008 — Presets are verified by math, not by eye
- Contrast for presets is checked against worst-case pure black and pure white wallpapers, which
  bounds any real image. `test/contrast.test.js` enforces this, so the "presets always pass"
  promise is a test, not a claim.

## D-009 — Surface wait shortened from 20 s to 10 s
- The content script polls for the site's main surface before declaring a site supported. At 20 s,
  a non-chat page showed "waiting…" in the popup for most of that time. Real chat UIs mount well
  inside 10 s. Chosen as a UX fix found by `test/e2e/multisite.mjs`.

## D-010 — Wallpaper is an `<img>`, not a CSS background; CSP behaviour recorded as observed
- **First design:** a CSS `background-image` set via `style.setProperty`.
- **Problem found in testing:** a page CSP that blocks `blob:` images (`img-src 'self'`) left the
  layer blank with no signal. A separate probe `Image()` loaded fine in the content-script world
  even while the page's CSS background was blocked, so it could not detect the failure.
- **Decision:** render the wallpaper as an `<img>` inside the layer. Its `error` event fires in the
  page context, and the handler hides the image and keeps the scrim. The image is still a Blob
  object URL, regenerated on each page load (failure mode #10).
- **Observed behaviour (Chromium, 2026-10-08):** under `img-src 'self' https:`, the content-script
  `<img>` with a blob URL still decoded (1920 px wide, no CSP violation logged). The CSS-background
  version was blocked. We do not rely on this either way. The fallback is tested by firing the
  `error` event directly, and the test suite asserts only what it can observe.
- **Tradeoff / open question:** if a host CSP can block our `<img>` in some browser build, the
  fallback handles it. Whether Chrome deliberately exempts content-script images from page CSP is
  not something we have confirmed from the spec.

## D-011 — E2E tests run against routed mock pages
- The build sandbox cannot reach chatgpt.com (HTTP 403) and has no logged-in account. Live-site
  verification is therefore deferred to a manual run (see docs/QA_CHECKLIST.md, Phase 4).
- `test/e2e/smoke.mjs` and `test/e2e/multisite.mjs` use Playwright `context.route()` to serve
  ChatGPT-, Claude- and Gemini-shaped DOMs inside real Chromium with the unpacked extension loaded.
  They verify the extension's own logic, not the real sites' current markup. That is the job of
  `test/selector-check.spec.js`, run manually against live sites.
- Required system libraries were installed with `playwright install-deps` (sandbox only).

## D-012 — Readability verdict uses the wallpaper's average colour, not per-pixel analysis
- The plan asked for "average luminance under the text column". Alpha compositing is linear, so the
  average of the composite equals the composite of the average. One stored RGB triple (`sample`)
  therefore gives an exact verdict for any opacity, with no re-decode on slider drag.
- Blur does not change the average, so the verdict ignores blur. This is stated in the popup copy.
- Tradeoff: an image with a very bright strip and a very dark strip can average to a passing value
  while some individual words sit on a failing patch. A per-pixel worst-case check is a possible
  v0.2 upgrade. The presets are unaffected, since they are verified at the extremes.
- The verdict is the WORST of light and dark themes, because the site's own toggle can flip.

## D-013 — Presets verified at the extremes, not on sample photos
- `test/contrast.test.js` checks each preset against pure black, pure white and mid-grey in both
  themes. Pure white at 74–86% opacity is the worst realistic case, and every preset passes it.

## D-014 — Toolbar badge carries the non-blocking warning
- The popup is the only place the verdict is explained, and users rarely open it on a chat page.
  The toolbar badge shows `!` in amber when the verdict fails and `ON` in violet when it passes.
  Neither state blocks anything.

## D-015 — Bug fixes found by the Phase 3 suite (recorded so they stay fixed)
- `normalizeSettings` threw on `sites: null` because a stored null overwrote the defaults object.
  Corrupt storage would have silently disabled the overlay. Fixed; unit test added.
- `[hidden]` lost to `display:flex` in popup CSS, so an empty readability panel showed with no
  wallpaper. Fixed with a global `[hidden] { display: none !important }`.
