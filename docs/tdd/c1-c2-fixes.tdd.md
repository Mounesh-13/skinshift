# TDD evidence — C1 + C2 fixes (2026-10-09)

Source plan: code-review findings C1/C2 from the 2026-10-09 whole-codebase review
(no `*.plan.md`; journeys derived during this TDD run).

## User journeys

- J1: As a user, I drag the opacity slider then immediately pick a preset.
  The preset sticks and no stale debounce timer writes afterwards.
- J2: As a user on a chat page where the contrast check throws, the page sees
  no unhandled rejection and the overlay detaches quietly.

## Task report

- C1 (`src/popup/popup.js:32-42`): `save()` never cleared the slider's 180 ms
  debounce timer, so every drag-then-click sequence emitted a redundant second
  storage write (extra `onChanged` churn to all open chat tabs).
  RED: `node --test test/regress-c1-c2.test.js` → C1 fails, 2 writes ≠ 1.
  GREEN: after adding `clearTimeout(saveTimer); saveTimer = null;` → 1 write.
  Note: the stale timer writes the *live* settings variable, so it could not
  revive a stale value — the reviewer's "clobber" mechanism was overstated;
  the redundant write is real and is what the test pins.
- C2 (`src/content/content-script.js:59-76`): `evaluateContrast()`/`isMounted()`
  ran outside the try/catch while `storage.onChanged` calls `reconcile()`
  fire-and-forget → unhandled rejection on the chat page.
  RED: C2 fails with `Error: contrast lib broken` escaping from `reconcile`.
  GREEN: after moving verdict/badge inside `try` (detach guarded with
  `try { … } catch (_) {}`) → no rejection, safe detach observed.

## Test specification

| # | Guarantee | Test file / command | Type | Result |
|---|-----------|---------------------|------|--------|
| 1 | Slider-then-preset produces exactly one storage write with preset values | `test/regress-c1-c2.test.js` C1 / `node --test test/regress-c1-c2.test.js` | unit (vm sandbox, real `save`/`saveDebounced` source + real `normalizeSettings`) | PASS |
| 2 | `reconcile()` never rejects when `evaluateContrast` throws; overlay detaches | `test/regress-c1-c2.test.js` C2 / same command | unit (vm sandbox, real `content-script.js` + throwing contrast stub) | PASS |
| 3 | No regressions in existing suites | `npm run test:unit` (16/16), `npm run test:e2e` (smoke 14/14, multisite 20/20, popup-ui 18/18) | unit + e2e (real Chromium) | PASS |

Validation commands actually run (all in `C:\Users\Nirmaan2\skinshift`):

- `node --test test/regress-c1-c2.test.js` → RED (2 fail), then GREEN (2 pass)
- `node --test test/contrast.test.js test/regress-c1-c2.test.js` → 18/18 pass
- `npm run test:e2e` → 14/14 + 20/20 + 18/18 pass
- `grep -rn "innerHTML|outerHTML|eval(|fetch(|XMLHttpRequest" src/` → only pre-existing comments, no new sinks

## Coverage and known gaps

No coverage tooling in this repo (`node --test` only), so no % measured.
Deliberately deferred (review backlog, not regressions): popup-close
`pagehide` flush for sub-180 ms slider drags, SPA `pushState` re-check after
the 10 s surface window, `hasWallpaper`/IDB desync self-heal, magic-byte
upload sniffing, decompression-bomb pixel cap.

## Merge evidence

- Checkpoint RED: `a63ae7c` — `test: add reproducers for C1 (debounce churn) and C2 (reconcile rejection)`
- Checkpoint GREEN: `bcfa9e1` — `fix: cancel pending slider debounce on immediate save; harden reconcile against contrast failures`
- Uncommitted (pre-existing, unrelated): live-verification header notes in
  `docs/QA_CHECKLIST.md`, `src/content/site-adapters/*.js`.
