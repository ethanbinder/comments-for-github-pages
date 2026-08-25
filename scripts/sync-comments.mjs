#!/usr/bin/env node
/**
 * sync-comments.mjs — fetch GitHub Discussion comments and write one JSON
 * file per page for the comments-for-github-pages widget.
 *
 * Zero dependencies. Node 20+. Designed to be vendored: copy this single
 * file into your pages repo and run it from a GitHub Actions workflow.
 *
 *   node scripts/sync-comments.mjs --repo owner/name --category Comments --out ./_site/comments
 *
 * Flags (each also settable via env for the composite action):
 *   --repo      owner/name of the repo whose Discussions hold the comments
 *               (env INPUT_REPO, default: GITHUB_REPOSITORY)
 *   --category  Discussion category name, case-insensitive (env INPUT_CATEGORY, required)
 *   --out       output directory for <slug>.json files (env INPUT_OUTPUT_DIR, default ./comments)
 *
 * Env:
 *   GITHUB_TOKEN        required; the built-in Actions token with discussions:read is enough
 *   GITHUB_GRAPHQL_URL  GraphQL endpoint (set automatically on Actions runners,
 *                       including GitHub Enterprise Server; defaults to github.com)
 *   CFGP_PAGE_SIZE      override pagination page size (testing only)
 *
 * The run is a full resync: it rewrites every data file and deletes stale
 * ones, so deleted or re-categorized discussions disappear on the next run.
 * (A per-discussion incremental mode reading GITHUB_EVENT_PATH on
 * discussion_comment events would cut API cost further; full resync is cheap
 * enough — ~2 points per discussion against a 1,000 point/hour budget — that
 * v1 keeps the simple, self-healing behavior.)
 */

import { parseArgs } from "node:util";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SCHEMA_VERSION = 1;
const GRAPHQL_URL = process.env.GITHUB_GRAPHQL_URL || "https://api.github.com/graphql";
const TOKEN = process.env.GITHUB_TOKEN;
const PAGE_SIZE = clampInt(process.env.CFGP_PAGE_SIZE, 1, 100) ?? 50;
const COMMENT_PAGE_SIZE = clampInt(process.env.CFGP_PAGE_SIZE, 1, 100) ?? 100;
// Hard safety valve per comment; the widget shows "view more on GitHub" when hit.
const MAX_REPLIES_PER_COMMENT = 1000;

function clampInt(value, min, max) {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

function fail(message) {
  console.error(`sync-comments: ${message}`);
  process.exit(1);
}

// --- slug algorithm ---------------------------------------------------------
// Spec: docs/json-schema.md. Implemented identically in widget/comments.js —
// change all three together and keep the parity fixtures passing.

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function termToSlug(term) {
  let t = String(term).trim();
  if (/^https?:\/\//i.test(t)) {
    try {
      t = new URL(t).pathname;
    } catch {
      /* keep as-is */
    }
  }
  t = t.toLowerCase().replace(/[?#].*$/, "");
  t = t.replace(/^\/+/, "").replace(/\/+$/, "");
  t = t.replace(/(^|\/)index\.html?$/, "$1").replace(/\.html?$/, "");
  t = t.replace(/\/+$/, "");
  if (t === "") return "index";
  let slug = "";
  let lossy = false;
  for (const ch of t.replace(/\//g, "--")) {
    if (/[a-z0-9._-]/.test(ch)) {
      slug += ch;
    } else {
      slug += "-";
      lossy = true;
    }
  }
  if (lossy || slug.length > 80) {
    slug = `${slug.slice(0, 80)}-${fnv1a(t)}`;
  }
  return slug;
}

// --- GraphQL ----------------------------------------------------------------

// Older GHES schemas lack reactionGroups.reactors; on the first error that
// names it we retry once with the legacy users connection and stay legacy.
let legacyReactions = false;
const reactionsFragment = () =>
  legacyReactions
    ? "reactionGroups { content users(first: 1) { totalCount } }"
    : "reactionGroups { content reactors { totalCount } }";

async function gql(query, variables) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
          "User-Agent": "comments-for-github-pages",
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      if (attempt >= 3) throw err;
      await sleep(1000 * attempt);
      continue;
    }
    if (res.status >= 500 && attempt < 3) {
      await sleep(1000 * attempt);
      continue;
    }
    if (!res.ok) {
      fail(`GraphQL request failed: HTTP ${res.status} ${await res.text()}`);
    }
    const payload = await res.json();
    if (payload.errors?.length) {
      const text = payload.errors.map((e) => e.message).join("; ");
      if (!legacyReactions && /reactors/i.test(text)) {
        legacyReactions = true;
        console.error("sync-comments: server rejected reactionGroups.reactors; retrying with legacy schema");
        return gql(query.replaceAll("reactors {", "users(first: 1) {"), variables);
      }
      fail(`GraphQL errors: ${text}`);
    }
    return payload.data;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function reactionsToMap(reactionGroups) {
  const out = {};
  for (const group of reactionGroups ?? []) {
    const count = group.reactors?.totalCount ?? group.users?.totalCount ?? 0;
    if (count > 0) out[group.content] = count;
  }
  return out;
}

function mapAuthor(author) {
  if (!author?.login) return null;
  return { login: author.login, url: author.url, avatarUrl: author.avatarUrl };
}

function mapComment(node) {
  return {
    id: node.id,
    url: node.url,
    author: mapAuthor(node.author),
    createdAt: node.createdAt,
    editedAt: node.lastEditedAt ?? null,
    bodyHTML: node.bodyHTML,
    upvotes: node.upvoteCount ?? 0,
    reactions: reactionsToMap(node.reactionGroups),
  };
}

async function findCategory(owner, name, categoryName) {
  const data = await gql(
    `query ($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        discussionCategories(first: 25) {
          nodes { id name slug }
        }
      }
    }`,
    { owner, name }
  );
  if (!data.repository) fail(`repository ${owner}/${name} not found (or token lacks access)`);
  const categories = data.repository.discussionCategories.nodes;
  const match = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
  if (!match) {
    const available = categories.map((c) => `"${c.name}"`).join(", ") || "(none — are Discussions enabled?)";
    fail(`discussion category "${categoryName}" not found. Available: ${available}`);
  }
  return match;
}

async function listDiscussions(owner, name, categoryId) {
  const discussions = [];
  let cursor = null;
  do {
    const data = await gql(
      `query ($owner: String!, $name: String!, $categoryId: ID!, $first: Int!, $cursor: String) {
        repository(owner: $owner, name: $name) {
          discussions(categoryId: $categoryId, first: $first, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id number title url locked
              ${reactionsFragment()}
              comments { totalCount }
            }
          }
        }
      }`,
      { owner, name, categoryId, first: PAGE_SIZE, cursor }
    );
    const page = data.repository.discussions;
    discussions.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return discussions;
}

async function fetchReplies(commentId, initial) {
  const replies = initial.nodes.filter((n) => !n.isMinimized).map(mapComment);
  let cursor = initial.pageInfo.hasNextPage ? initial.pageInfo.endCursor : null;
  let truncated = false;
  while (cursor) {
    if (replies.length >= MAX_REPLIES_PER_COMMENT) {
      truncated = true;
      break;
    }
    const data = await gql(
      `query ($id: ID!, $first: Int!, $cursor: String) {
        node(id: $id) {
          ... on DiscussionComment {
            replies(first: $first, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id url createdAt lastEditedAt bodyHTML isMinimized upvoteCount
                author { login url avatarUrl }
                ${reactionsFragment()}
              }
            }
          }
        }
      }`,
      { id: commentId, first: COMMENT_PAGE_SIZE, cursor }
    );
    const page = data.node.replies;
    replies.push(...page.nodes.filter((n) => !n.isMinimized).map(mapComment));
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  }
  return { replies, truncated };
}

async function fetchComments(discussionId) {
  const comments = [];
  let cursor = null;
  do {
    const data = await gql(
      `query ($id: ID!, $first: Int!, $cursor: String) {
        node(id: $id) {
          ... on Discussion {
            comments(first: $first, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id url createdAt lastEditedAt bodyHTML isMinimized upvoteCount
                author { login url avatarUrl }
                ${reactionsFragment()}
                replies(first: $first) {
                  totalCount
                  pageInfo { hasNextPage endCursor }
                  nodes {
                    id url createdAt lastEditedAt bodyHTML isMinimized upvoteCount
                    author { login url avatarUrl }
                    ${reactionsFragment()}
                  }
                }
              }
            }
          }
        }
      }`,
      { id: discussionId, first: COMMENT_PAGE_SIZE, cursor }
    );
    const page = data.node.comments;
    for (const node of page.nodes) {
      if (node.isMinimized) continue;
      const { replies, truncated } = await fetchReplies(node.id, node.replies);
      comments.push({ ...mapComment(node), replies, repliesTruncated: truncated });
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return comments;
}

// --- main -------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      repo: { type: "string" },
      category: { type: "string" },
      out: { type: "string" },
    },
  });
  const repo = values.repo || process.env.INPUT_REPO || process.env.GITHUB_REPOSITORY;
  const category = values.category || process.env.INPUT_CATEGORY;
  const outDir = values.out || process.env.INPUT_OUTPUT_DIR || "./comments";

  if (!TOKEN) fail("GITHUB_TOKEN is required");
  if (!repo || !repo.includes("/")) fail("--repo owner/name is required (or set GITHUB_REPOSITORY)");
  if (!category) fail("--category is required");
  const [owner, name] = repo.split("/");

  const cat = await findCategory(owner, name, category);
  const discussions = await listDiscussions(owner, name, cat.id);
  console.error(`sync-comments: ${discussions.length} discussion(s) in category "${cat.name}" of ${repo}`);

  await mkdir(outDir, { recursive: true });
  const written = new Set();
  const slugToTitle = new Map();

  for (const discussion of discussions) {
    const slug = termToSlug(discussion.title);
    if (slugToTitle.has(slug)) {
      console.error(
        `sync-comments: WARNING — discussion "${discussion.title}" (#${discussion.number}) maps to the same page as ` +
          `"${slugToTitle.get(slug)}"; keeping the older discussion and skipping #${discussion.number}`
      );
      continue;
    }
    slugToTitle.set(slug, discussion.title);

    const comments = await fetchComments(discussion.id);
    const totalComments = comments.reduce((sum, c) => sum + 1 + c.replies.length, 0);
    const file = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      term: discussion.title,
      discussion: {
        number: discussion.number,
        url: discussion.url,
        title: discussion.title,
        locked: discussion.locked,
        totalComments,
        reactions: reactionsToMap(discussion.reactionGroups),
      },
      comments,
    };
    const filename = `${slug}.json`;
    await writeFile(join(outDir, filename), JSON.stringify(file, null, 2) + "\n");
    written.add(filename);
    console.error(`sync-comments: wrote ${filename} (${totalComments} comment(s))`);
  }

  // Full resync: drop files for discussions that no longer exist in the category.
  for (const entry of await readdir(outDir)) {
    if (entry.endsWith(".json") && !written.has(entry)) {
      await unlink(join(outDir, entry));
      console.error(`sync-comments: deleted stale ${entry}`);
    }
  }
  console.error(`sync-comments: done — ${written.size} file(s) in ${outDir}`);
}

// Allow `import { termToSlug }` for parity tests without running the sync.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => fail(err.stack || String(err)));
}
