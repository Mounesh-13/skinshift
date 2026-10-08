# QA checklist

Two kinds of checks live here:

- **[A] Automated.** Run with `npm run test:unit` and `npm run test:e2e`. These use a real Chromium
  with the unpacked extension and mock chat pages.
- **[M] Manual, live.** Needs a logged-in account on the real sites. Run `HEADED=1 npm run
  test:selectors` for the selector part, then go through the rest by hand.

Tick each item in the release PR. An unticked [M] item means the release is not verified on that site.

## Status at v0.1.0

| Area | Status |
|---|---|
| [A] unit tests (contrast maths, settings repair) | 16/16 passing |
| [A] smoke (upload, persist, SPA re-render, pointer-events) | 14/14 passing |
| [A] multi-site (3 hosts, per-site toggle, dark/light, unsupported DOM, strict Trusted Types, restrictive img-src) | 20/20 passing |
| [A] popup (presets, readability warning, badge, perf mode, reset) | 18/18 passing |
| [M] live ChatGPT / Claude / Gemini | **not yet run.** The build sandbox cannot reach the sites and has no account. |

## 1. Fresh install
- [A] Service worker starts; default settings written on install.
- [A] No overlay on any supported site before a wallpaper is uploaded.
- [M] Load unpacked from `chrome://extensions` with no errors shown on the card.

## 2. Uploads
- [A] Normal JPEG/PNG/WebP photo is accepted and resized to ≤1920×1080.
- [A] Tiny image (64×36) is accepted and not upscaled.
- [A] Oversized file (>15 MB) is rejected before decoding, with a clear message.
- [A] Wrong type (GIF, SVG) is rejected.
- [A] Corrupt file gives "could not read", with no crash.
- [A] Remove wallpaper detaches the overlay on open tabs.
- [M] Very large phone photo (≈12 MP, 8–14 MB) completes within about 2 s.

## 3. Persistence and reload
- [A] Overlay survives a page refresh.
- [A] Settings survive closing and reopening the browser (`launchPersistentContext` profile).
- [A] Extension reload leaves the stored wallpaper and settings intact.
- [M] After "Reload" on `chrome://extensions`, refresh the chat tab once. The old tab is orphaned
  until refresh by design. Confirm it does not throw in the console.

## 4. Per-site toggles
- [A] Turning one site off detaches it and leaves the others attached.
- [A] Turning it back on reattaches without a page reload.

## 5. Site's own dark / light switch
- [A] Overlay tint flips to dark when the site's text colour becomes light (no reload).
- [M] Toggle each site's own theme switch and check the tint follows.

## 6. Layout behaviour
- [A] Overlay does not intercept pointer events (clicks reach the chat).
- [M] Window resize keeps the wallpaper covering the viewport with no gaps.
- [M] Sidebar open/closed and mobile-width layout keep the overlay behind all content.

## 7. Multiple tabs
- [M] Two chat tabs open, change opacity in the popup: both update.
- [M] Badge state is per tab (ON in the active chat, blank elsewhere).

## 8. SPA re-render resilience
- [A] Removing the overlay node from the DOM re-attaches it within about 300 ms.
- [A] Continuous DOM mutation (simulated React re-renders) does not break the overlay.
- [M] Start a new chat, switch conversations, and open settings on each site. The overlay persists.

## 9. Accessibility
- [A] Pure-white wallpaper at 20% opacity triggers the warning (popup and toolbar `!`).
- [A] Each built-in preset passes on pure white in both themes.
- [A] Warning is non-blocking: wallpaper still applies, chat text colour unchanged.
- [M] Run Chrome DevTools' contrast checker on a real conversation with a mid-tone photo.

## 10. Performance
- [A] Performance mode removes `backdrop-filter` and keeps the tint.
- [M] Chrome Task Manager / Performance panel: with blur on, scrolling a long chat stays near 60 fps
  on a mid-range laptop. Record the result in this file before release.

## 11. Trusted Types / CSP
- [A] Gemini-shaped page with `require-trusted-types-for 'script'`: zero TT violations.
- [A] Restrictive `img-src` page: wallpaper still decodes; load-error fallback hides the image and
  keeps the scrim.
- [M] Confirm no TT violations on the live Gemini page in the console (filter: "Trusted").

## 12. Network and privacy
- [A] No non-local request from the extension, popup, or mock pages during the suites.
- [M] DevTools → Network on each live site with the overlay active: no requests originate from
  the extension (`chrome-extension://` or from our code). Site requests are unchanged from stock.

## 13. Console hygiene
- [A] No uncaught errors from SkinShift on mock pages.
- [M] No uncaught errors on each live site with the overlay on, and off, after 5 minutes of use.

## 14. Selector health (live)
- [M] `HEADED=1 npm run test:selectors`: each adapter has at least one surface selector matching.
- [M] Review the WARNING lines. A non-primary surface match means the primary selector is stale.

## Known gaps (v0.1.0)
- Live site selectors are unverified (see the header of each adapter file).
- Chrome version and site versions for the live pass are not recorded yet.
- No Firefox, Edge or Safari support was tested. Chromium-family browsers are expected to work.
