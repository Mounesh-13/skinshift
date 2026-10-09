---
name: New site support
about: Request (or offer) a SkinShift adapter for another chat site
title: "[site] "
labels: new-site
assignees: ""
---

## Site

- Name:
- Host (e.g. `perplexity.ai`):

## Layout hints (if you looked)

- Surface selector (the chat container — prefer `main`, `[role="main"]`, stable custom elements; avoid hashed classes):
- Transparent containers (wrappers that paint an opaque background):
- Anything fragile (token class names, Angular element names):

## Live check

New adapters need a hand check in the site's own light and dark mode
(see [docs/QA_CHECKLIST.md](../../docs/QA_CHECKLIST.md)):

- [ ] I can test this site logged-in and report back, **or**
- [ ] I am offering a PR (see "Add a new site adapter" in [CONTRIBUTING.md](../../CONTRIBUTING.md)).

Good first candidates already noted by maintainers: Meta AI (`meta.ai`),
Perplexity (`perplexity.ai`), Mistral Le Chat (`chat.mistral.ai`).
