# Privacy

SkinShift is designed so that privacy does not depend on promises. The extension has no network
code, and that can be checked (see the instructions in the README).

## What SkinShift does with data

| Data | Stored where | Leaves the device? |
|---|---|---|
| Your wallpaper image | IndexedDB, your browser profile | **No** |
| Settings: preset, opacity, blur, performance mode, site on/off, the wallpaper's average colour | `chrome.storage.local`, your browser profile | **No** |
| Chat text or page content | **Not read, not stored, not transmitted** | **No** |
| Analytics, crash reports, telemetry | **None** | **No** |

SkinShift does not read conversation text. The only DOM access is a `querySelector` on the
structural selectors listed in the adapter file, to find the chat container and confirm the site
is supported. It does not walk the message tree and does not inspect text nodes.

## Permissions, one by one

| Permission | Why it is needed | What it does not allow |
|---|---|---|
| `storage` | Keep settings in `chrome.storage.local` so every tab sees the same look. | Does not sync to other devices (we use `local`, not `sync`). |
| `unlimitedStorage` | Wallpapers are a few hundred KB each. Without this, Chrome's per-origin quota could fail a large upload silently. | Does not grant network access. It only lifts the disk quota. |
| Host: `https://chatgpt.com/*` | Inject the content script and draw the layer on ChatGPT. | Limited to that host. No other site is touched. |
| Host: `https://claude.ai/*` | Same, for Claude. | Same. |
| Host: `https://gemini.google.com/*` | Same, for Gemini. | Same. |

Not requested, deliberately:

- `tabs`. The popup reads the active tab's id with `chrome.tabs.query`, and that works without the permission. The popup never reads a URL or a title.
- `activeTab`, `scripting`, `webRequest`, `cookies`, `history`, `bookmarks`, `clipboardRead`, `<all_urls>`. None are needed.
- `externally_connectable`. No other extension or web page can message SkinShift.

## Network, verified

The extension contains **no** `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon` call. Remote
fonts, remote scripts and CDNs are not used. Every asset is bundled. A grep of `src/` for these APIs
is run by hand before each release (there is no CI yet), and the end-to-end suites assert zero non-local requests.

To verify on your own machine: see the **Privacy** section of the [README](../README.md).

## Content Security Policy

Extension pages use the default MV3 policy, which forbids inline scripts and `eval`. The popup
loads scripts from files only. The content script creates DOM nodes and sets `textContent`,
`style` and attributes through the DOM API. It does not use string-to-DOM sinks, so it does not
depend on Trusted Types exemptions.

## What you give up

- **Sync across devices.** Your wallpaper lives on this computer. Reinstalling the browser loses it.
- **Automatic updates of the site's selectors.** If a site changes its layout, SkinShift stays inert on that site until a new release. That is also why it cannot silently start doing anything else.

## Reporting a privacy concern

Open an issue on the repository, or see [CONTRIBUTING.md](../CONTRIBUTING.md) for security contact
guidance.
