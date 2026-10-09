# TDD evidence — F1–F5 follow-up fixes (2026-10-09)

Source: review backlog from the 2026-10-09 whole-codebase review
(C1/C2 evidence: `docs/tdd/c1-c2-fixes.tdd.md`).

## User journeys

- F1: As a user, I drag a slider and close the popup within 180 ms.
  The drag is still saved.
- F2: As a user, I open a chat URL that renders late (or the SPA navigates
  without reload). The overlay attaches without a manual refresh.
- F3: As a user whose stored photo bytes went missing, I open the popup and
  get the flag repaired + an explanation instead of a stuck `waiting…` pill.
- F4: As a user, a renamed SVG/GIF (spoofed MIME) is rejected at upload.
- F5: As a user, a tiny-file/gigapixel image is rejected before any canvas
  allocation (no popup OOM).

## Task report

- F1 (`src/popup/popup.js`): new `flushPendingSave()` + `pagehide` wiring
  (also revokes the preview object URL on unload).
  RED: `pagehide handler is not wired in wire()`. GREEN: 1 flushed write, no double-write.
- F2 (`src/content/content-script.js`): new `armLateSurfaceWatch()` —
  throttled (1x/2 s) MutationObserver + `popstate` re-check, disarms on first
  match, all fail-quiet. Called when the 10 s window finds no surface.
  RED: `late surface watch was not armed`. GREEN: `unsupported` → `supported`, overlay attached.
- F3 (`src/popup/popup.js` `refreshPreview`): missing-bytes path now
  `save({hasWallpaper:false,…})` + explanatory `say()`.
  RED: `stale hasWallpaper flag was not repaired`. GREEN: flag cleared, user told.
- F4 (`src/lib/image-utils.js`): new pure `NS.sniffImageKind()` (JPEG/PNG/WebP
  magic bytes); `validateFile` is now async and requires sniffed kind ===
  claimed type. Only caller `prepareWallpaper` already awaits.
  RED: `NS.sniffImageKind is not implemented`. GREEN: GIF/SVG/spoof→null, spoofed upload→`bad-type`, honest PNG passes.
- F5 (`src/lib/image-utils.js`): new pure `NS.bitmapSizeOk()` (≤16384 px/side,
  ≤64 MP); `prepareWallpaper` rejects `too-large` (bitmap closed) before canvas.
  RED: `NS.bitmapSizeOk is not implemented`. GREEN: 30k×30k rejected end-to-end with zero canvas allocation.

## Test specification

| # | Guarantee | Test file / command | Type | Result |
|---|-----------|---------------------|------|--------|
| 1 | Unload flushes pending debounce exactly once | `test/regress-followups.test.js` F1 | unit (vm, real popup.js source) | PASS |
| 2 | Late surface → SUPPORTED + attach, no reload | F2 (real content-script.js, real 10 s window) | unit (vm sandbox) | PASS |
| 3 | Missing bytes repair flag + message | F3 (real refreshPreview source) | unit (vm sandbox) | PASS |
| 4 | Magic-byte accept/reject + spoof rejected via validateFile | F4 (real image-utils.js) | unit (vm sandbox) | PASS |
| 5 | Pixel cap pure + enforced pre-canvas via prepareWallpaper | F5 (real image-utils.js) | unit (vm sandbox) | PASS |
| 6 | No regressions | `node --test test/contrast.test.js test/regress-c1-c2.test.js test/regress-followups.test.js` → 23/23; `npm run test:e2e` → 14/14 + 20/20 + 18/18 (real Chromium upload through async validation) | unit + e2e | PASS |

Validation commands actually run (in `C:\Users\Nirmaan2\skinshift`):

- `node --test test/regress-followups.test.js` → RED (5 fail with the 5 messages above), then GREEN (5 pass)
- Full unit trio → 23/23 pass; `npm run test:e2e` → all suites pass
- Sink grep over `src/` → only pre-existing comments, no new `innerHTML`/`eval`/`fetch` sinks

## Coverage and known gaps

No coverage tooling in repo. Remaining review backlog (minor, untouched):
test-suite sleeps→`waitForFunction` polls, dead `popup.fill` line in
`test/e2e/smoke.mjs:98`, selector-check hardening (fail on zero transparent
hits, hosts↔manifest↔URLS equality), `tools/package.mjs` Windows `zip` +
`SHA256SUMS` regeneration, `__proto__` allowlist in `normalizeSettings`,
explicit extension-pages CSP pin. Orphan-blob-with-flag-false direction
(intentionally left: benign single-JPEG leak, converges via F3).

## Merge evidence

- Checkpoint RED: `3b45e57` — `test: add reproducers for F1-F5 follow-up fixes`
- Checkpoint GREEN: `a3354cc` — `fix: pagehide flush, SPA late-surface watch, IDB self-heal, magic-byte sniff, pixel cap`
- Uncommitted (pre-existing, unrelated): live-verification header notes in
  `docs/QA_CHECKLIST.md`, `src/content/site-adapters/*.js`.
