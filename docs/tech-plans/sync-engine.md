---
title: Sync engine — Discussions → static JSON
author: ethan-binder
date: 2026-08-25
---

# Tech Plan: Sync engine (PR 1 of 4)

## Objective

Ship the server-side half of comments-for-github-pages: a zero-dependency
script that mirrors a repo's Discussion comments into per-page static JSON,
plus the GitHub Actions templates and composite action that run it.

## Problem Statement

GitHub Discussions are GraphQL-only and always require an authenticated
token, so a static site cannot read them from the browser without a backend
or exposed credentials. Running the read inside GitHub Actions with the
built-in `GITHUB_TOKEN` and publishing the result as static JSON removes the
need for both.

## Changes Made

- `scripts/sync-comments.mjs` — Node 20+, zero deps. Category lookup,
  paginated discussion/comment/reply fetch, reaction maps with a legacy-GHES
  schema fallback, minimized-comment filtering, slug computation (spec:
  `docs/json-schema.md`), full-resync directory rewrite with stale-file
  deletion, `CFGP_PAGE_SIZE` test override.
- `templates/sync-comments-artifact-pages.yml` — copy-paste workflow for
  artifact-deployed Pages (recommended; no commits).
- `templates/sync-comments-branch-pages.yml` — copy-paste workflow for
  branch-deployed Pages (commit + `paths-ignore` loop guard).
- `action/action.yml` — composite action for `uses:` consumers.
- `docs/json-schema.md` — data file schema + slug algorithm spec.

## Testing

- `node --check scripts/sync-comments.mjs`.
- Live run against this repo's own Discussions (test discussion titled
  `/index` with comments, replies, reactions):
  `GITHUB_TOKEN=$(gh auth token) node scripts/sync-comments.mjs --repo ethanbinder/comments-for-github-pages --category <cat> --out /tmp/out`
  — output diffed against the schema doc.
- Pagination exercised with `CFGP_PAGE_SIZE=1`.

## Risks

- GHES GraphQL schema drift (mitigated: `reactionGroups` fallback, no search
  API, endpoint from `GITHUB_GRAPHQL_URL`).
- Org-level read-only `GITHUB_TOKEN` defaults (mitigated: explicit
  `permissions:` blocks in both templates).
