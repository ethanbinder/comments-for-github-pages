# CLAUDE.md

## Project

comments-for-github-pages adds comments to GitHub Pages sites using GitHub Discussions as the backend. Two parts, both self-contained:

- `scripts/sync-comments.mjs` — a zero-dependency Node 20+ script, run by GitHub Actions in the consumer's pages repo, that fetches Discussion comments via the GraphQL API and writes one JSON file per page into the published site.
- `widget/comments.js` — a single-file, dependency-free browser widget that fetches that same-origin JSON and renders the comment thread.

There is deliberately **no server component and no build step**. Reading works everywhere GitHub Actions runs (github.com and GitHub Enterprise Server); posting deep-links to the GitHub Discussion.

## Conventions

- **Zero runtime dependencies.** No npm packages in the script or the widget. The script uses only Node built-ins (`fetch`, `fs`, `path`); the widget is plain ES2020 browser JS that injects its own styles.
- **Single-file, vendorable artifacts.** GHES consumers install by copying three files (workflow template, sync script, widget). Never split these into multi-file modules or add imports that break copy-paste vendoring.
- **No hardcoded hosts.** The script reads `GITHUB_GRAPHQL_URL` / `GITHUB_SERVER_URL` / `GITHUB_REPOSITORY`; the widget gets all URLs from the synced JSON (plus `data-server-url` for the new-discussion link only).
- **No tokens in the browser, ever.** The widget must never call any GitHub API.
- The slug algorithm is specified in `docs/json-schema.md` and implemented twice (script + widget). Any change must update the spec and both implementations together, with parity fixtures.

## Shipping

- Every change ships via a branch + pull request. No direct commits to `main` (the repo-bootstrap commit was the only exception).
- Large changes ship as **stacked PRs**: small, ordered, reviewable; each PR based on the previous branch (`gh pr create --base <previous-branch>`), merged base-first.
- **Tech-plan path for this repo:** `docs/tech-plans/<title-kebab-case>.md`. Every PR links its tech plan.
- Default PR is non-draft.
