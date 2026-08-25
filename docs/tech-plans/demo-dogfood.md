---
title: Demo site & Pages dogfood
author: ethan-binder
date: 2026-08-25
---

# Tech Plan: Demo site & Pages dogfood (PR 3 of 4)

## Objective

Prove the whole loop publicly on this repo's own GitHub Pages: Discussion →
sync workflow → static JSON → widget, with live pages for both the populated
thread and the empty state.

## Problem Statement

PRs 1–2 shipped the sync engine and the widget, each verified in isolation.
Nothing yet demonstrates them working together on real GitHub Pages, and the
project needs a public demo prospective users can click.

## Changes Made

- `demo/index.html` — demo home page; widget bound to the existing `/index`
  discussion via `data-mapping="term"` (explicit terms because project Pages
  are served under `/comments-for-github-pages/`, so pathname mapping would
  include the repo name).
- `demo/second-page.html` — second page mapped to `/second-page`, which has
  no discussion yet: demonstrates per-page threads and the empty state with
  the prefilled new-discussion link.
- `.github/workflows/pages.yml` — the artifact-mode template applied to this
  repo: builds `_site/` from `demo/` + the widget, runs the sync against the
  repo's own "General" category, deploys via `configure-pages` /
  `upload-pages-artifact` / `deploy-pages`. Full trigger set:
  `discussion`, `discussion_comment`, push to main, `workflow_dispatch`,
  daily cron.
- Side setup (repo settings, not in git): Discussions enabled, Pages set to
  build via GitHub Actions.

## Testing

- Local: build `_site/` exactly as the workflow does, run the sync into
  `_site/comments`, serve with `python3 -m http.server`, and verify the
  index page renders the live `/index` thread and the second page renders
  the empty state.
- Post-merge (full-loop proof): push to main triggers the deploy; then post
  a comment on the `/index` discussion via the GitHub UI and confirm the
  `discussion_comment` event re-syncs and the comment appears on the
  published page after the redeploy.

## Risks

- Workflow triggers only exercise fully after merge to main (the `push`
  filter and Pages deploy target main); mitigated by local build parity and
  `workflow_dispatch` for manual re-runs.
