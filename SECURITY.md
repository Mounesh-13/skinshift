# Security Policy

SkinShift is a 100% local browser extension: it makes zero network requests of
its own (see [docs/PRIVACY.md](docs/PRIVACY.md)). Most "vulnerabilities" here
look like a wallpaper that escapes its layer, a site reading more than it
should, or stored settings being abused. Those reports are welcome.

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

Only the latest release is supported. If you are on an older zip, update from
the [Releases page](https://github.com/Mounesh-13/skinshift/releases) first.

## Reporting a vulnerability

**Do not open a public issue for a suspected vulnerability.** Report privately
through [GitHub Security Advisories](https://github.com/Mounesh-13/skinshift/security/advisories/new)
(private vulnerability reporting on this repository).

Include if you can:

- What you did (steps to reproduce) and what you expected
- Extension version (`manifest.json`), Chrome version, site and theme
- Whether any network request left the browser (DevTools → Network,
  `chrome-extension://` filter) — this decides severity here

What happens next:

- Acknowledgement on a best-effort basis (maintainers aim for 7 days)
- We reproduce, fix, and credit you in the release notes (unless you prefer
  to stay anonymous)
- Coordinated disclosure: please give us a chance to ship the fix before
  publishing details

## Scope

In scope:

- The extension code in `src/` and `manifest.json`
- The build/packaging scripts in `tools/` (a trojaned zip is a real threat)
- Privacy-promise violations: any network request, telemetry, or EXIF leak
  attributable to SkinShift

Out of scope:

- Vulnerabilities in ChatGPT, Claude, or Gemini themselves — report those to
  OpenAI, Anthropic, or Google
- Social engineering, physical access, or a compromised browser/OS
- Reports that the sites redesigned and an adapter went stale (that is a
  regular [bug report](https://github.com/Mounesh-13/skinshift/issues/new/choose),
  not a security issue)
