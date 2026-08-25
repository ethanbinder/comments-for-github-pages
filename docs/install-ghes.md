# Installing on GitHub Enterprise Server

The whole system is designed to be **vendored**: three self-contained files
copied into your pages repo, no marketplace actions, no external network
access. That makes it a first-class citizen on GitHub Enterprise Server
(GHES), including air-gapped installs.

## Requirements

- GHES 3.6+ (repo-level Discussions plus the `discussion` /
  `discussion_comment` Actions events).
- GitHub Actions enabled, with a runner that has **Node.js 20+** on PATH.
  GitHub-hosted style images include it; on a bare self-hosted runner add an
  `actions/setup-node` step (or preinstall Node) before the sync step.
- GitHub Pages enabled on the instance.

## Install (vendoring — works everywhere)

1. Copy `scripts/sync-comments.mjs` into your pages repo at
   `scripts/sync-comments.mjs`.
2. Copy the matching template to `.github/workflows/sync-comments.yml`:
   - `templates/sync-comments-artifact-pages.yml` for Pages deployed from
     Actions (recommended — no commits, no loops);
   - `templates/sync-comments-branch-pages.yml` for Pages served from a
     branch (commits JSON with a `paths-ignore` loop guard).
3. Edit the `EDIT` markers: your site build step (artifact mode) or pages
   branch (branch mode), and your Discussions category name.
4. Copy `widget/comments.js` into your site's assets and add the script tag
   to your page templates — **set `data-server-url` to your GHES host** so
   the empty state's "start the discussion" link points at your instance:

```html
<div id="comments"></div>
<script src="/assets/comments.js" defer
  data-repo="your-org/your-pages-repo"
  data-category="Comments"
  data-server-url="https://github.your-company.com"></script>
```

Nothing else is host-specific. On Actions runners, the sync script reads the
GraphQL endpoint from `GITHUB_GRAPHQL_URL` (GHES sets it to
`https://<host>/api/graphql`) and the repo from `GITHUB_REPOSITORY`; every
URL the widget renders (discussion links, avatars, profiles) comes from the
synced JSON, so the widget needs no API access at all.

## Why not `uses: ethanbinder/comments-for-github-pages/action@v1` on GHES?

GHES runners can only resolve actions hosted on github.com when the
instance has **GitHub Connect** with actions access enabled. Many
enterprises don't. The composite action exists as a convenience for
github.com (and Connect-enabled GHES); vendoring is the primary, always-works
install path — and it also pins your copy, which many security teams prefer.

## Token permissions

The sync needs only `discussions: read` on the built-in `GITHUB_TOKEN`
(plus `pages: write`/`id-token: write` in artifact mode, or
`contents: write` in branch mode, for the deploy itself). Both templates
declare explicit workflow-level `permissions:` blocks, which **override**
org- or repo-level "read-only token" defaults — no admin settings change is
needed. The script never creates or writes Discussions.

## Operational notes

- **Latency:** a new comment fires `discussion_comment` → sync → Pages
  deploy. Typically live in about a minute; the daily cron repairs any
  drift (e.g. events missed while Actions was down).
- **API budget:** a full resync costs roughly 2 GraphQL points per
  discussion against a 1,000 points/hour token budget — comfortable for
  sites with hundreds of commented pages. Bursts of events are collapsed by
  the workflow's `concurrency` group.
- **Internal-visibility repos:** the synced JSON is served as part of your
  Pages site, so comments are exactly as visible as the site itself. Keep
  the Discussions repo and the Pages site at the same audience level.
