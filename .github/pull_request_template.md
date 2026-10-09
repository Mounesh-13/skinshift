# Pull request

## What and why

Link the issue (`Fixes #...`) and explain the change in a sentence or two.

## Ground-rules checklist

SkinShift's rules from [CONTRIBUTING.md](../CONTRIBUTING.md) — tick all that apply:

- [ ] No network code (`fetch`, XHR, WebSocket, remote fonts, CDNs, analytics)
- [ ] No reading of conversation content (structural selectors only)
- [ ] Fail-silent: unknown layouts are a no-op, no uncaught errors on the host page
- [ ] No `innerHTML`, `eval`, or `new Function`
- [ ] Privacy promise intact (see [docs/PRIVACY.md](../docs/PRIVACY.md))

## Verification

- [ ] `npm run test:unit` passes
- [ ] `npm run test:e2e` passes (real Chromium, mock pages)
- [ ] Live check on the real site(s) in light **and** dark mode, ticked in [docs/QA_CHECKLIST.md](../docs/QA_CHECKLIST.md) — or marked N/A with a reason
- [ ] New behavior has a test (see `test/regress-*.test.js` for the pattern)

## Screenshots (for visual changes)

Before / after, with the affected area marked.
