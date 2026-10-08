# Contributing to SkinShift

Thanks for helping. SkinShift stays small on purpose: every file should be readable in one sitting
and every line should be justifiable against the privacy promise in [docs/PRIVACY.md](docs/PRIVACY.md).

## Ground rules

1. **No network code.** No `fetch`, XHR, WebSocket, remote fonts, CDNs or analytics. Check with: `grep -rnE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon" src`.
2. **No reading of conversation content.** Only structural selectors, to find the layout.
3. **Fail silently.** A missing selector means a no-op, never an uncaught error on the host page.
4. **No `innerHTML`, `eval` or `new Function`.** Use `createElement`, `textContent`, `classList`, `style.setProperty`.
5. **Original artwork only.** No logos or trademarks of OpenAI, Anthropic or Google.

## Set up

```bash
git clone https://github.com/Mounesh-13/skinshift.git
cd skinshift
npm install
npx playwright install chromium
npm run test            # must pass before you open a PR
```

Load the unpacked extension from `chrome://extensions` (Developer mode → Load unpacked → the repo folder)
to try changes by hand.

## Add a new site adapter (under 10 minutes)

Example: Perplexity. Replace the names with the site you want.

1. **Find the layout.** Open the site, press `F12`, and use the element picker. Find:
   - a **surface**: the chat container. Prefer `main`, `[role="main"]`, or a stable custom element. Avoid hashed class names such as `css-1x2y3z`.
   - **transparent** containers: the big wrapper elements that paint an opaque background.
2. **Copy an existing adapter.** Start from `src/content/site-adapters/claude.js`.
3. **Write the adapter file** in `src/content/site-adapters/<id>.js`:
   - a header comment with the date last verified, the Chrome version tested, the site URL and the fragile selectors;
   - `id`, `name`, `hosts`, an ordered `surfaces` list (most specific first), and `transparent`.
4. **Register it.** Add the host to `host_permissions` and to `content_scripts[0].matches` in `manifest.json`. Add the file to `content_scripts[0].js` in the right order (after `overlay-manager.js`). Add `{ id, label }` to `NS.SITES` in `src/lib/constants.js`.
5. **Add a mock.** Add a page for it in `test/e2e/multisite.mjs` and the host to its route. Run `npm run test:e2e`.
6. **Add a live check.** Add the site URL to `URLS` in `test/selector-check.spec.js`.
7. **Tick the live items** for the new site in `docs/QA_CHECKLIST.md` after you have checked it by hand in light and dark mode.

Good first adapter ideas: Meta AI (`meta.ai`), Perplexity (`perplexity.ai`), Mistral Le Chat (`chat.mistral.ai`).

## Keeping selectors healthy

Sites change. When a live check fails:

- If a **surface** no longer matches, add the new selector to the top of `surfaces` and keep the old ones as fallbacks. Then update the "date last verified" header.
- If a **transparent** selector stops matching, remove it. Stale selectors do no harm but add noise.
- If the fallback is now carrying the site, the selector-check output will say so. Update the primary.

## Code style

- Plain JavaScript, no framework and no build step. Classic scripts that attach to `self.SkinShift`.
- 2-space indentation, single quotes, semicolons.
- Comment the **why**, not the **what**. Non-trivial functions need a comment saying why they exist and what would break without them.
- Keep modules pure where you can. `contrast.js` runs in Node for unit tests. Put DOM work in the content script or the popup.

## Testing locally

| Command | What it covers |
|---|---|
| `npm run test:unit` | contrast maths, preset guarantees, settings repair |
| `npm run test:e2e` | real Chromium, extension loaded, mock sites |
| `HEADED=1 npm run test:selectors` | live sites, logged-in profile (manual) |

A change is ready when `npm run test` passes and the change is checked by hand on at least one live site in light and dark mode.

## Pull requests

- One logical change per PR. Keep the commit history readable.
- Describe what changed and why. If the change is a deviation from the plan, add an entry to [DECISIONS.md](DECISIONS.md).
- Screenshots help for UI changes. Use mock pages, not logged-in accounts, and never include personal chat content.

## Reporting a security or privacy issue

Please don't file a public issue for a suspected data leak or a bug that could expose user content.
Contact the maintainers privately first. Use GitHub's private vulnerability reporting on the repository's Security tab.
