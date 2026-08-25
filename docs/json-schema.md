# Data file schema & slug algorithm

The sync script writes **one JSON file per page** at `<output-dir>/<slug>.json`.
The widget computes the same slug from the page's term and fetches that file
from the site's own origin. No index file is needed — the slug is computable
on both sides.

## Slug algorithm (spec)

Implemented identically in `scripts/sync-comments.mjs` (`termToSlug`) and
`widget/comments.js`. **Change the spec and both implementations together**,
and keep the parity fixtures passing.

Input: the *term* — a page pathname like `/blog/post-1/`, a custom string, or
a full URL (only its pathname is used). The Discussion **title is the term**:
a page and a discussion are matched purely by that string.

1. Trim. If the term is a full `http(s)://` URL, keep only its pathname.
2. Lowercase. Strip any `?query` / `#fragment` suffix.
3. Strip leading and trailing `/`.
4. Strip a trailing `index.html` / `index.htm` (path segment) — else strip a
   trailing `.html` / `.htm` extension. Strip trailing `/` again.
5. If the result is empty → slug is `index`.
6. Replace every `/` with `--`. Replace every remaining character outside
   `[a-z0-9._-]` with `-` (this counts as *lossy*).
7. If any lossy replacement happened, **or** the result exceeds 80 characters:
   truncate to 80 and append `-` + the 8-hex-digit FNV-1a (32-bit) hash of the
   normalized term from step 5.

Consequences: `/blog/post-1`, `/blog/post-1/`, and `/blog/post-1/index.html`
all map to `blog--post-1.json`. Two discussions whose titles normalize to the
same slug collide; the sync keeps the older discussion and logs a warning.

## File schema (`schemaVersion: 1`)

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-25T12:00:00.000Z", // when the sync ran
  "term": "/blog/post-1/",                   // the discussion title, verbatim
  "discussion": {
    "number": 42,
    "url": "https://github.example.com/org/site/discussions/42",
    "title": "/blog/post-1/",
    "locked": false,                         // widget hides the join button when true
    "totalComments": 7,                      // top-level comments + all replies
    "reactions": { "THUMBS_UP": 3, "HEART": 1 } // zero-count entries omitted
  },
  "comments": [
    {
      "id": "DC_kwDO...",
      "url": ".../discussions/42#discussioncomment-123",
      "author": {                            // null when the account was deleted
        "login": "alice",
        "url": ".../alice",
        "avatarUrl": ".../u/1?v=4"
      },
      "createdAt": "2026-08-20T09:00:00Z",
      "editedAt": null,                      // lastEditedAt, null if never edited
      "bodyHTML": "<p>…</p>",                // GitHub-rendered HTML; widget re-sanitizes
      "upvotes": 2,
      "reactions": { "THUMBS_UP": 1 },
      "replies": [ /* same shape, without replies/repliesTruncated */ ],
      "repliesTruncated": false              // true if >1000 replies were cut off
    }
  ]
}
```

Notes:

- Minimized (hidden) comments and replies are omitted entirely.
- Comment order is the API's natural order (oldest first).
- All URLs are absolute and come from the API, so the widget never needs to
  know the GitHub host.
- A page with no matching discussion simply has **no file** — the widget
  treats the 404 as the empty state.
- `schemaVersion` bumps on breaking shape changes; the widget refuses files
  with a greater major version than it understands.
