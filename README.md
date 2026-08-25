# comments-for-github-pages

**Comments for GitHub Pages, powered by GitHub Discussions — no server, no third-party service, no tokens in the browser.**

A GitHub Actions workflow syncs your Discussions into static JSON published with your site; a single-file widget renders them as a comment thread. Readers post through a one-click link to the Discussion, and the page updates itself about a minute later.

**[Live demo →](https://ethanbinder.github.io/comments-for-github-pages/)**

```
GitHub Discussion  ──(discussion_comment event)──▶  Actions workflow
                                                        │  sync-comments.mjs
                                                        ▼
your GitHub Pages site  ◀──(redeploy)──  comments/<page-slug>.json
        │
        ▼
comments.js widget renders the thread + "Join the discussion →"
```

## Why this instead of giscus or utterances?

Those are excellent on the public internet, but they rely on a third-party-hosted backend and OAuth app. This project trades inline posting for **zero infrastructure**:

- **Runs anywhere GitHub Actions runs** — github.com and GitHub Enterprise Server, including locked-down networks that can't reach outside services.
- **No third-party service** in the read path: your comments render from JSON hosted on your own Pages origin.
- **No client-side tokens, ever.** The widget never calls a GitHub API. The sync uses the built-in `GITHUB_TOKEN` with `discussions: read` only.
- **No dependencies, no build step.** One Node script, one browser file. Install by copying three files.
- Comments live in GitHub Discussions: native moderation, reactions, threading, and full markdown.

## Quick start

1. **Enable Discussions** on your pages repo and pick a category for comments (e.g. "Comments" or "General").
2. **Copy three files** into your pages repo:
   - [`scripts/sync-comments.mjs`](scripts/sync-comments.mjs) → `scripts/sync-comments.mjs`
   - a workflow template → `.github/workflows/sync-comments.yml`
     - [`templates/sync-comments-artifact-pages.yml`](templates/sync-comments-artifact-pages.yml) if your Pages deploy from Actions (recommended)
     - [`templates/sync-comments-branch-pages.yml`](templates/sync-comments-branch-pages.yml) if your Pages serve from a branch
   - [`widget/comments.js`](widget/comments.js) → somewhere in your site's assets
3. **Edit the template's two `EDIT` markers** (site build step, category name).
4. **Add the widget** to your page templates:

```html
<div id="comments"></div>
<script src="/assets/comments.js" defer
  data-repo="your-org/your-pages-repo"
  data-category="Comments"></script>
```

Each page maps to a Discussion **titled with the page's pathname** (e.g. `/blog/my-post/`). You don't create them up front: the widget's empty state links to a prefilled new-discussion form, and the first commenter's post triggers a resync.

On github.com you can use the composite action instead of vendoring the script: `uses: ethanbinder/comments-for-github-pages/action@v1` (see [`action/action.yml`](action/action.yml)).

## Widget configuration

| Attribute | Default | Purpose |
|---|---|---|
| `data-repo` | — (required) | `owner/name` whose Discussions hold the comments |
| `data-category` | — (required) | Discussion category name |
| `data-category-slug` | slugified category | Category slug for the new-discussion link |
| `data-mapping` | `pathname` | `pathname` or `term` (explicit key per page) |
| `data-term` | — | The key when `data-mapping="term"` |
| `data-data-url` | `/comments` | Base path of the synced JSON |
| `data-target` | `#comments` | Where to render |
| `data-theme` | `auto` | `auto` / `light` / `dark`; retheme via `--cfgp-*` CSS variables |
| `data-server-url` | `https://github.com` | Your GitHub host (set on GitHub Enterprise Server) |

## Docs

- [Installing on GitHub Enterprise Server](docs/install-ghes.md) — vendoring, GitHub Connect, token permissions
- [Security model](docs/security.md) — threat model, sanitizer, recommended CSP
- [Data schema & page↔discussion mapping](docs/json-schema.md)

## License

[MIT](LICENSE)
