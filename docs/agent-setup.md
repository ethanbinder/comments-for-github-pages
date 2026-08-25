# Agent setup runbook: add comments to a GitHub Pages repo

A step-by-step procedure for an AI agent (or a careful human) to install
comments-for-github-pages on any GitHub Pages repository. Every install is
independent — to enable comments on several different pages repos, run this
runbook once per repo. Every step is idempotent: re-running overwrites the
same files and never duplicates anything.

Conventions in this document:
- `{repo}` = the target pages repo as `owner/name`.
- **ASK THE HUMAN** marks a decision you must not make yourself.
- Commands assume `gh` is authenticated against the correct GitHub host
  (`GH_HOST=github.your-company.com gh ...` on Enterprise Server).

---

## Phase 0 — Gather inputs and check preconditions

Collect from the human (ask once, up front, for anything not already given):

1. **Target pages repo** `{repo}`.
2. **GitHub host** — github.com or the GHES URL (e.g.
   `https://github.your-company.com`). You need this for `data-server-url`
   and to know whether github.com is reachable for Phase 1.
3. **Discussions category** to hold comments (e.g. `Comments` or `General`).
4. **Which pages** get the widget — every page via a shared layout, or a
   specific list.

Then verify preconditions:

```sh
# Discussions must be enabled on {repo}
gh repo view {repo} --json hasDiscussionsEnabled
# -> {"hasDiscussionsEnabled": true}. If false:
gh repo edit {repo} --enable-discussions
```

```sh
# Does the chosen category exist? (case-insensitive match on "name")
gh api graphql -f query='query{repository(owner:"OWNER",name:"NAME"){discussionCategories(first:25){nodes{name slug}}}}'
```

If the category is missing: **ASK THE HUMAN** to create it in the repo's
Discussions UI (Discussions → pencil icon next to Categories). There is no
API for creating categories — do not try. Record the category's `slug` from
the query above; the widget wants it when it differs from the lowercased name.

```sh
# Pages deployment mode — decides which workflow template you install
gh api repos/{repo}/pages --jq '{build_type, source}'
```

- `"build_type": "workflow"` → **artifact mode** (Phase 2, option A).
- `"build_type": "legacy"` → **branch mode** (Phase 2, option B); note the
  `source.branch` and `source.path`.
- HTTP 404 → Pages is not enabled. **ASK THE HUMAN** which mode they want,
  then enable it (`gh api repos/{repo}/pages -X POST -f build_type=workflow`
  for artifact mode).

---

## Phase 1 — Acquire the three files

You need exactly three files from this project, pinned at tag `v1`:

| File | Destination in `{repo}` |
|---|---|
| `scripts/sync-comments.mjs` | `scripts/sync-comments.mjs` |
| `templates/sync-comments-artifact-pages.yml` **or** `templates/sync-comments-branch-pages.yml` (per Phase 0) | `.github/workflows/sync-comments.yml` |
| `widget/comments.js` | your site's assets, e.g. `assets/comments.js` |

**If github.com is reachable** (agent running on or near github.com):

```sh
BASE=https://raw.githubusercontent.com/ethanbinder/comments-for-github-pages/v1
curl -fsSL "$BASE/scripts/sync-comments.mjs"                    -o scripts/sync-comments.mjs
curl -fsSL "$BASE/templates/sync-comments-artifact-pages.yml"   -o .github/workflows/sync-comments.yml
curl -fsSL "$BASE/widget/comments.js"                           -o assets/comments.js
```

**If github.com is NOT reachable** (typical on GHES): use an internal
mirror. One-time setup (any human or agent with internet access does this
once for the whole company):

```sh
git clone https://github.com/ethanbinder/comments-for-github-pages
cd comments-for-github-pages
git remote add internal https://github.your-company.com/YOUR-ORG/comments-for-github-pages.git
git push internal main --tags
```

Every later install copies the three files from that mirror instead. If no
mirror exists and you cannot create one, **ASK THE HUMAN** to provide the
three files.

**Traceability:** add a header comment to each copied file recording the
source version, e.g. `// vendored from comments-for-github-pages@v1` (use
`#` in the YAML file). In `sync-comments.mjs` the comment goes on **line 2,
below the `#!/usr/bin/env node` shebang** — a comment above the shebang is a
syntax error. This is the only edit the script and widget files ever get;
sanity-check both with `node --check` afterwards.

---

## Phase 2 — Configure the sync workflow

Open `.github/workflows/sync-comments.yml` and resolve every `EDIT` marker.
Do not change anything else — triggers, `permissions:`, and `concurrency:`
are load-bearing.

**Option A — artifact mode** (`sync-comments-artifact-pages.yml`):
- `EDIT` #1, build step: replace the default copy with the site's real build
  (`jekyll build -d _site`, `hugo -d _site`, or keep the plain copy for
  static HTML). **Security: the build must never copy `.git` into `_site`**
  — `actions/checkout` stores the job's token in `.git/config`, and
  publishing it would expose a live credential. Keep an explicit exclude.
- `EDIT` #2, sync step: set `--category` to the Phase 0 category name.
- If the repo already has a Pages deploy workflow, merge instead of adding a
  second deployer: add this template's `discussion:` / `discussion_comment:`
  / `schedule:` triggers and its sync step (before the upload-artifact step)
  into the existing workflow, and skip the template's own deploy steps.

**Option B — branch mode** (`sync-comments-branch-pages.yml`):
- Set both `EDIT` branch markers (`on.push.branches` and `env.PAGES_BRANCH`)
  to the Pages source branch from Phase 0.
- Set `--category`, and `OUTPUT_DIR` if the site serves from a subdirectory
  (e.g. `docs/comments` when Pages serves `/docs`).
- The script must exist on the pages branch too (it runs after checking that
  branch out) — commit it there, or add a second checkout of the default
  branch.

Both options: if the runner is self-hosted without Node 20+, add
`- uses: actions/setup-node@v4` with `node-version: 20` before the sync step.

---

## Phase 3 — Add the widget to the pages

The universal snippet (place once per page that should have comments):

```html
<div id="comments"></div>
<script src="/assets/comments.js" defer
  data-repo="{repo}"
  data-category="Comments"
  data-server-url="https://github.your-company.com"></script>
```

- `data-server-url` is **required on GHES** (it builds the "start the
  discussion" link and marks the GitHub host as a trusted image source).
  Omit it on github.com.
- Full attribute reference: header of `widget/comments.js` and the README
  table.

**Path rule — check this before choosing attributes.** Where is the site
served?
- **Root site** (`owner.github.io` or a custom domain at `/`): the defaults
  work. Each page's comment thread maps to a Discussion **titled with the
  page's pathname** (e.g. `/blog/my-post/`) — see `docs/json-schema.md`.
- **Project site** (served under `/repo-name/`): pathname mapping would
  include the repo name and absolute paths would miss the subpath. Use
  relative data + explicit terms, exactly as `demo/index.html` does:
  `src="assets/comments.js"`, `data-data-url="./comments"`,
  `data-mapping="term"`, and a per-page `data-term` (e.g. `/index`,
  `/second-page`).

**Where to put the snippet, by site type:**
- Plain HTML: before `</body>` on each chosen page.
- Jekyll: in `_layouts/post.html` (or an include referenced there) to cover
  every post; `relative_url` filter for the src.
- Hugo: a partial included from `layouts/_default/baseof.html` (or
  `single.html`), guarded by a page param if only some pages opt in.
- MkDocs (material): a `main.html` theme override extending `content`.

Do **not** pre-create Discussions per page. The widget's empty state links
to a prefilled new-discussion form; the first commenter creates the thread,
and the `discussion:` event triggers the first sync.

---

## Phase 4 — Verify (mandatory — do not report success without this)

```sh
# 1. Commit and push the changes (via the repo's normal PR flow if it has one)

# 2. Trigger the sync workflow and watch it succeed
gh workflow run sync-comments.yml -R {repo}
gh run watch -R {repo} $(gh run list -R {repo} --workflow sync-comments.yml --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status
```

3. Confirm the data path is live (404 is correct while no discussion exists
   yet; anything else means a path problem):

```sh
curl -s -o /dev/null -w "%{http_code}\n" https://<pages-url>/comments/<slug>.json
```

4. Open a page with the widget: it must render either a comment thread or
   the "No comments yet — Start the discussion →" empty state. A blank
   space or console error = check the Troubleshooting table.

5. Round-trip proof: post one test comment in the page's Discussion (create
   it via the widget's button if needed), confirm a new workflow run with
   event `discussion` or `discussion_comment` starts, and after it deploys
   (~1 minute) the comment is visible on the published page.

Only after step 5 passes, report the install complete — and tell the human
comments will appear on pages automatically about a minute after they're
posted.

---

## Phase 5 — Multiple sites, upgrades, re-runs

- **Another pages repo?** Run Phases 0–4 again against that repo. Installs
  share nothing; different repos can use different categories, hosts, and
  Pages modes.
- **Many pages in one site?** Nothing extra — every page gets its own
  Discussion thread via the title↔term mapping automatically.
- **Upgrade** = re-run Phase 1 from a newer tag (the header comment you
  added records what's currently vendored), re-check Phase 2 markers, rerun
  Phase 4.
- **Re-running this runbook is always safe**: it overwrites the same three
  files and never creates duplicates.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Sync fails: `discussion category "X" not found. Available: …` | Category name mismatch — the error lists the real names; fix `--category` or create the category (Phase 0). |
| Widget shows empty state though a Discussion has comments | Title↔term mismatch: the Discussion title must be the page's term (slug rules in `docs/json-schema.md`). Rename the discussion title to match, or set `data-term`. |
| Workflow never triggers on comments | Discussions must live in the **same repo** as the workflow; also check Actions is enabled and the events block wasn't edited. |
| Widget blank on a project site (`/repo-name/…`) | Absolute default paths miss the subpath — apply the Phase 3 path rule (`data-data-url="./comments"`, explicit `data-term`). |
| Sync fails with auth error on GHES | `GH_HOST`/token host mismatch, or org token policy — the templates' explicit `permissions:` block normally overrides read-only defaults; see `docs/install-ghes.md`. |
| Comment images don't load | By design: images load only from trusted hosts (site origin, `data-server-url` host, `*.githubusercontent.com`). Site owner can extend with `data-img-hosts`. See `docs/security.md`. |
| `node: command not found` on a self-hosted runner | Add the `actions/setup-node@v4` step (Phase 2). |
