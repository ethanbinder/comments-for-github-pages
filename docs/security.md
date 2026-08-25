# Security model

## Design guarantees

- **No tokens in the browser, ever.** The widget never calls a GitHub API.
  It fetches one JSON file from the site's own origin. All authentication
  happens inside GitHub Actions with the ephemeral built-in `GITHUB_TOKEN`.
- **Read-only sync.** The script needs only `discussions: read`. It never
  creates, edits, or deletes anything on GitHub; discussions are created by
  humans through the widget's prefilled link.
- **No third parties.** No CDN scripts, no analytics, no external hosts. The
  only endpoints ever contacted are your own GitHub instance (from the
  runner) and your own Pages origin (from the browser).
- **Zero dependencies.** No npm packages in the script or widget — nothing
  to supply-chain-audit beyond two files you can read in one sitting, and
  vendoring pins your copy.

## Untrusted input: comment content

Anyone who can comment can author malicious markdown. Defenses, in order:

1. **GitHub renders it first.** The sync stores GraphQL `bodyHTML` — the
   same server-side rendered, sanitized HTML GitHub shows in its own UI —
   never raw user markdown.
2. **The widget sanitizes again** (defense-in-depth, ~80 lines, DOMParser
   allowlist — see `widget/comments.js`):
   - Element allowlist; `script`/`style`/`iframe`/`object`/`embed`/`svg`/
     `math`/`form`/media are dropped, unknown tags are unwrapped (text
     survives, wrapper doesn't).
   - Attribute allowlist per tag; every `on*` handler, `style`, `id`,
     `name`, and `data-*` attribute is dropped (also prevents DOM
     clobbering).
   - `href`/`src` must parse as `http:`/`https:` (`mailto:` allowed on
     links); `javascript:`, `data:`, `vbscript:` are dropped — including on
     author profile and avatar URLs.
   - Links get `target="_blank" rel="noopener noreferrer nofollow ugc"`;
     images get `loading="lazy"`; task-list inputs are forced to disabled
     checkboxes.
   - No `eval`, no `Function`, no `innerHTML` of unsanitized content
     anywhere in the widget.

   Why keep the second layer if GitHub already sanitized? Because the JSON
   file sits in your repo/artifact where anyone with push access could
   tamper with it, and because older GHES rendering pipelines vary. The
   adversarial fixture `demo/fixtures/xss-test.json` exercises all of the
   above.

## Trust boundaries you should know about

- **Push access = comment integrity.** Someone with write access to the
  pages repo (or its Actions) can alter the synced JSON. The sanitizer
  stops script injection, but they could still *misrepresent* comment text
  or authorship. This is the same trust you already place in them over
  every other page of the site.
- **Comments are as public as the site.** The JSON ships with the Pages
  deploy. Keep the Discussions repo and the site at the same audience
  level; don't sync a private repo's discussions onto a more widely
  visible site.
- **Discussion titles are data.** Titles become filenames via a slug
  restricted to `[a-z0-9._-]` (no path traversal), and title text is never
  interpolated into GraphQL queries (variables only) or shell commands.
- **Stale-file cleanup is scoped.** The sync deletes only JSON files it
  verifiably wrote (schema markers required), so pointing `--out` at a
  directory with unrelated files won't destroy them.

## Recommended CSP

The widget is compatible with a strict Content-Security-Policy. A good
starting point for a Pages site using it:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' https://avatars.githubusercontent.com https://*.githubusercontent.com;
connect-src 'self';
frame-ancestors 'none';
```

Notes: `style-src 'unsafe-inline'` is needed because the widget injects one
`<style>` block (move it to a stylesheet if your policy forbids that);
extend `img-src` with your GHES avatar host (e.g.
`https://github.your-company.com`) when running on Enterprise Server.
Because the widget makes no cross-origin requests, `connect-src 'self'`
suffices.

## Reporting

Found a vulnerability? Please open a GitHub Security Advisory on this repo
(Security → Report a vulnerability) rather than a public issue.
