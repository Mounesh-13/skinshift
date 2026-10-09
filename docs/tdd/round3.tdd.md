# TDD evidence — round-3 backlog (2026-10-09)

Source: remaining review backlog after C1/C2 (`docs/tdd/c1-c2-fixes.tdd.md`)
and F1–F5 (`docs/tdd/f1-f5-fixes.tdd.md`).

## User journeys

- As a user on a half-loaded page, no theme read ever throws onto the chat.
- As a user removing my wallpaper when storage is broken, the overlay still
  turns off and I am told it was not clean.
- As a user with corrupt stored settings, the extension falls back to
  defaults without prototype pollution or NaN contrast math.

## Task report

- `detectTheme` guard (`src/content/overlay-manager.js`): null-body early
  return + full try/catch → `'light'`.
  RED: throws on missing body. GREEN: `'light'`; color reads pinned.
- `removeWallpaper` (`src/popup/popup.js`): try/finally shape — flag always
  clears, message reflects clean vs failed delete.
  RED: `save` skipped when `store.delete` throws. GREEN: flag cleared + user told.
- `normalizeSettings` allowlist (`src/lib/constants.js`): field-by-field pick
  with domain validation; `sites` rebuilt from `NS.SITES`; garbage sample →
  `null`; `__proto__` never copied.
  RED: prototype polluted (`out.polluted === true`, verified against the old
  code via `git stash`). GREEN: clean prototype, valid fields preserved.
  Existing `contrast.test.js` malformed-storage test still passes unchanged.
- Manifest: explicit `extension_pages` CSP (`script-src 'self'; object-src
  'none'`) + 128 px action icon aligned with top-level icons.
- e2e robustness: `statusFor` matches `s.site` id; deterministic sleeps
  converted to `waitForFunction`/polls in smoke/multisite/popup-ui; dead
  `popup.fill` line removed. Remaining sleeps are documented settles for
  async side-channels (console errors) or capture timing (screenshots).
- `screenshots.mjs`: dead `before` page removed, plain browser closed.
- `selector-check.spec.js`: zero transparent-selector matches now fails the
  spec (was warn-only). Not runnable here (needs logged-in headed run).
- `package.mjs`: pre-flight checks (required files, icons, content-script
  paths, manifest↔package version), junk pruning extended to `Thumbs.db`,
  cross-platform zip (`zip` CLI → absolute-path PowerShell fallback → clear
  error), `SHA256SUMS.txt` regenerated.
  Verified: `npm run package` → 21-entry zip, manifest at root, no
  tests/docs, no unsafe paths, checksum matches.
- Icons: new `tools/run-icons.mjs` (`py -3.13` on win32, `python3` else,
  Pillow-missing hint); `npm run icons` verified end-to-end after
  `pip install pillow` (all 4 icons regenerated).
- Deleted unreferenced `test/fixtures/black.png` (zero references repo-wide).

## Test specification

| # | Guarantee | Test file / command | Type | Result |
|---|-----------|---------------------|------|--------|
| 1 | detectTheme null-body → light; color reads pinned | `test/regress-round3.test.js` (real overlay-manager.js source) | unit (vm) | PASS |
| 2 | removeWallpaper clears flag on IDB failure | round3 (real popup.js source) | unit (vm) | PASS |
| 3 | settings allowlist: no proto pollution, sample repaired | round3 (real constants.js) | unit (vm) | PASS |
| 4 | parseRgb limitation pins; manifest/adapters/URLS/SITES agree (+drift sensitivity proof) | round3 | unit (vm) | PASS |
| 5 | No regressions | unit trio 29/23→29/29; `npm run test:e2e` 14/14+20/20+18/18 | unit + e2e (real Chromium) | PASS |
| 6 | Packaging + icons runnable on Windows | `npm run package`, `npm run icons` | execution | PASS |

Validation commands actually run (in `C:\Users\Nirmaan2\skinshift`):
`node --test` trio → 29/29; `npm run test:e2e` → 52/52; `npm run package`
+ zip-content/ checksum verification; `npm run icons` (post Pillow install).

## Coverage and known gaps

No coverage tooling in repo. Deliberately not changed: contrast math for
semi-transparent text (would alter WCAG verdicts — v0.2 decision, pinned by
tests instead); `loadAdapters()` at spec-collect time (works as-is);
orphan-blob-with-flag-false direction (benign, converges via F3 self-heal);
`save()` `Object.assign` call sites (patches are internally built, no
attacker-controlled keys — noted, not a reachable sink).

## Merge evidence

- Checkpoint RED: `2bcda88` — `test: add reproducers for round-3 fixes …`
- Checkpoint GREEN: (this round's fix commit) — `fix: round-3 backlog …`
- Uncommitted (pre-existing, unrelated): live-verification header notes in
  `docs/QA_CHECKLIST.md`, `src/content/site-adapters/*.js`.
