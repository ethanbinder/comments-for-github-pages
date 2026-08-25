---
title: Launch docs & README
author: ethan-binder
date: 2026-08-25
---

# Tech Plan: Launch docs & README (PR 4 of 4)

## Objective

Replace the stub README with the full product-facing one and add the GHES
install guide and security model, completing the v1 launch surface.

## Problem Statement

PRs 1–3 shipped a working system with a live demo, but the README is still
an "under construction" stub and there is no install guide for GitHub
Enterprise Server (the environment where vendoring and token-permission
defaults need explanation) and no written security model.

## Changes Made

- `README.md` — product-first: what it is, flow diagram, why choose it over
  hosted-backend alternatives (no third-party service, no client tokens,
  runs on GHES/locked-down networks, zero deps), 3-file quick start, widget
  config table, doc links.
- `docs/install-ghes.md` — vendoring walkthrough, GHES requirements
  (3.6+, Node 20 on runners), GitHub Connect caveat for the composite
  action, token-permission notes, latency/API-budget/visibility notes.
- `docs/security.md` — design guarantees, two-layer sanitization rationale,
  trust boundaries (push access, site visibility, titles-as-data,
  scoped stale-deletion), recommended CSP, reporting channel.

## Testing

N/A — docs-only, no runtime behavior changed. All relative links checked
against files present in the branch; demo URL matches the Pages deployment
configured in PR 3. Post-merge follow-up: tag `v1` so
`ethanbinder/comments-for-github-pages/action@v1` resolves.

## Risks

- Docs drifting from code; mitigated by CLAUDE.md's rule that behavior
  changes must update the matching docs in the same PR.
