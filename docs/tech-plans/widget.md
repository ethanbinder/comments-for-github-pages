---
title: Comments widget
author: ethan-binder
date: 2026-08-25
---

# Tech Plan: Comments widget (PR 2 of 4)

## Objective

Ship the browser half of comments-for-github-pages: a single-file,
dependency-free widget that renders the synced JSON as a comment thread.

## Problem Statement

The sync engine (PR 1) publishes Discussion comments as static JSON, but
nothing renders them on a page yet. The renderer must be safe against
malicious comment content, vendorable as one file, and must never touch a
GitHub API or token from the browser.

## Changes Made

- `widget/comments.js` — script-tag config (`data-repo`, `data-category`,
  `data-mapping`, `data-term`, `data-data-url`, `data-target`, `data-theme`,
  `data-server-url`), slug computation identical to the sync script (spec:
  `docs/json-schema.md`), same-origin JSON fetch, DOMParser allowlist
  sanitizer over GitHub's `bodyHTML` (defense-in-depth: drops scripts,
  event handlers, `javascript:`/`data:` URLs; unwraps unknown tags; links get
  `rel="noopener noreferrer nofollow ugc"`), comment/reply/reaction
  rendering, empty/locked/error states, light/dark/auto themes via
  `--cfgp-*` custom properties.
- `demo/fixtures/fixture-demo.json` — real sync output for manual testing.
- `demo/fixtures/xss-test.json` — adversarial fixture (script tags,
  `onerror`/`onload`/`ontoggle`, `javascript:`/`data:`/`vbscript:` URLs,
  iframe/form/svg/object/embed, style attributes) for sanitizer verification.

## Testing

- Serve a scratch page with `python3 -m http.server`; point the widget at the
  fixtures via `data-mapping="term"`.
- `fixture-demo`: thread, threaded reply, reactions, themes render correctly.
- `xss-test`: no dialogs, none of the `window.__xss*` markers set, no
  `javascript:` hrefs in the DOM; legit markdown content still renders.
- Missing fixture: 404 renders the empty state with a prefilled
  new-discussion link.
- Slug parity: `termToSlug` in widget and sync script produce identical
  output for a shared list of terms.

## Risks

- Sanitizer allowlist too strict for some GitHub rendering (mitigated:
  unknown tags are unwrapped, not dropped, so text content always survives).
- Slug drift between the two implementations (mitigated: shared spec +
  parity fixture check; both files carry pointer comments).
