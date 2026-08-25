/*!
 * comments-for-github-pages widget
 * https://github.com/ethanbinder/comments-for-github-pages · MIT
 *
 * Single-file, dependency-free. Renders GitHub Discussion comments that the
 * sync script (scripts/sync-comments.mjs) published as static JSON alongside
 * this site. Never talks to any GitHub API and never handles tokens.
 *
 * <div id="comments"></div>
 * <script src="/assets/comments.js" defer
 *   data-repo="org/site-repo"            required — repo whose Discussions hold the comments
 *   data-category="Comments"             required — Discussion category name
 *   data-category-slug="comments"        optional — category slug for the new-discussion link
 *   data-mapping="pathname"              "pathname" (default) | "term"
 *   data-term="/custom/key"              required iff mapping="term"
 *   data-data-url="/comments"            base path of the synced JSON (default "/comments")
 *   data-target="#comments"              CSS selector (default "#comments"; else renders after this script)
 *   data-theme="auto"                    "auto" (default) | "light" | "dark"
 *   data-server-url="https://github.com" GitHub host, used only for the new-discussion link
 * ></script>
 */
(() => {
  "use strict";
  const MAX_SCHEMA_VERSION = 1;
  const script = document.currentScript;
  if (!script) return;

  const cfg = {
    repo: script.dataset.repo || "",
    category: script.dataset.category || "",
    categorySlug: script.dataset.categorySlug || (script.dataset.category || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    mapping: script.dataset.mapping || "pathname",
    term: script.dataset.term || "",
    dataUrl: (script.dataset.dataUrl || "/comments").replace(/\/+$/, ""),
    target: script.dataset.target || "#comments",
    theme: script.dataset.theme || "auto",
    serverUrl: (script.dataset.serverUrl || "https://github.com").replace(/\/+$/, ""),
  };

  // --- slug algorithm (spec: docs/json-schema.md; keep identical to scripts/sync-comments.mjs) ---
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }
  function termToSlug(term) {
    let t = String(term).trim();
    if (/^https?:\/\//i.test(t)) {
      try { t = new URL(t).pathname; } catch { /* keep as-is */ }
    }
    t = t.toLowerCase().replace(/[?#].*$/, "");
    t = t.replace(/^\/+/, "").replace(/\/+$/, "");
    t = t.replace(/(^|\/)index\.html?$/, "$1").replace(/\.html?$/, "");
    t = t.replace(/\/+$/, "");
    if (t === "") return "index";
    let slug = "";
    let lossy = false;
    for (const ch of t.replace(/\//g, "--")) {
      if (/[a-z0-9._-]/.test(ch)) slug += ch;
      else { slug += "-"; lossy = true; }
    }
    if (lossy || slug.length > 80) slug = slug.slice(0, 80) + "-" + fnv1a(t);
    return slug;
  }

  // --- HTML sanitizer -------------------------------------------------------
  // bodyHTML is already rendered+sanitized by GitHub's server pipeline; this
  // allowlist pass is defense-in-depth against tampered JSON files or older
  // GHES sanitizers. Unknown elements are unwrapped (children kept);
  // dangerous ones are dropped entirely; only allowlisted attributes survive.
  const DROP_TAGS = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "base", "form", "textarea", "select", "button", "video", "audio", "source", "svg", "math", "template", "slot", "dialog"]);
  const ALLOW_TAGS = new Set(["p", "br", "a", "img", "pre", "code", "em", "strong", "b", "i", "del", "ins", "blockquote", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "hr", "details", "summary", "sup", "sub", "input", "span", "div", "g-emoji", "kbd", "picture"]);
  const GLOBAL_ATTRS = new Set(["title", "dir", "align", "start", "colspan", "rowspan"]);
  const CLASS_PREFIXES = ["pl-", "highlight", "snippet-clipboard", "notranslate", "contains-task-list", "task-list-item", "markdown-", "email-"];

  function safeUrl(value, allowMailto) {
    try {
      const url = new URL(value, document.baseURI);
      const ok = url.protocol === "http:" || url.protocol === "https:" || (allowMailto && url.protocol === "mailto:");
      return ok ? value : null;
    } catch {
      return null;
    }
  }

  function sanitizeInto(source, parent) {
    for (const node of source.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        parent.appendChild(document.createTextNode(node.nodeValue));
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.tagName.toLowerCase();
      if (DROP_TAGS.has(tag)) continue;
      if (!ALLOW_TAGS.has(tag)) {
        sanitizeInto(node, parent); // unwrap: keep children, lose the wrapper
        continue;
      }
      const el = document.createElement(tag === "g-emoji" ? "span" : tag);
      for (const attr of node.attributes) {
        const name = attr.name.toLowerCase();
        const value = attr.value;
        if (name === "class") {
          const kept = value.split(/\s+/).filter((c) => CLASS_PREFIXES.some((p) => c.startsWith(p)));
          if (kept.length) el.className = kept.join(" ");
        } else if (name === "href" && tag === "a") {
          const url = safeUrl(value, true);
          if (url) el.setAttribute("href", url);
        } else if (name === "src" && tag === "img") {
          const url = safeUrl(value, false);
          if (url) el.setAttribute("src", url);
        } else if ((name === "alt" || name === "width" || name === "height") && tag === "img") {
          el.setAttribute(name, value);
        } else if (tag === "input" && (name === "type" || name === "checked" || name === "disabled")) {
          if (name !== "type" || value === "checkbox") el.setAttribute(name, value);
        } else if (GLOBAL_ATTRS.has(name)) {
          el.setAttribute(name, value);
        }
        // everything else (on*, style, id, data-*, …) is dropped
      }
      if (tag === "a" && el.hasAttribute("href")) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer nofollow ugc");
      }
      if (tag === "input") {
        el.setAttribute("type", "checkbox");
        el.setAttribute("disabled", "");
      }
      if (tag === "img") {
        el.setAttribute("loading", "lazy");
        if (!el.hasAttribute("src")) continue; // img with no safe src is useless
      }
      sanitizeInto(node, el);
      parent.appendChild(el);
    }
  }

  function sanitizeHTML(html) {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    const frag = document.createDocumentFragment();
    sanitizeInto(doc.body, frag);
    return frag;
  }

  // --- rendering helpers ----------------------------------------------------
  const EMOJI = { THUMBS_UP: "👍", THUMBS_DOWN: "👎", LAUGH: "😄", HOORAY: "🎉", CONFUSED: "😕", HEART: "❤️", ROCKET: "🚀", EYES: "👀" };

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === "text") el.textContent = v;
      else el.setAttribute(k, v);
    }
    for (const child of children) if (child) el.appendChild(child);
    return el;
  }

  function relativeTime(iso) {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return iso;
    const s = Math.round((Date.now() - then) / 1000);
    const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
    for (const [unit, secs] of units) {
      if (Math.abs(s) >= secs) {
        const n = Math.round(s / secs);
        return `${n} ${unit}${Math.abs(n) === 1 ? "" : "s"} ago`;
      }
    }
    return "just now";
  }

  function reactionPills(reactions) {
    const entries = Object.entries(reactions || {}).filter(([k]) => EMOJI[k]);
    if (!entries.length) return null;
    const wrap = h("span", { class: "cfgp-reactions" });
    for (const [content, count] of entries) {
      wrap.appendChild(h("span", { class: "cfgp-pill", text: `${EMOJI[content]} ${count}` }));
    }
    return wrap;
  }

  function renderComment(comment, isReply) {
    const card = h("article", { class: "cfgp-comment" + (isReply ? " cfgp-reply" : "") });
    const head = h("header", { class: "cfgp-head" });
    if (comment.author) {
      const avatarUrl = safeUrl(comment.author.avatarUrl, false);
      head.appendChild(
        avatarUrl
          ? h("img", { class: "cfgp-avatar", src: avatarUrl, alt: "", loading: "lazy" })
          : h("span", { class: "cfgp-avatar cfgp-ghost-avatar", text: "?" })
      );
      const profileUrl = safeUrl(comment.author.url, false);
      head.appendChild(
        profileUrl
          ? h("a", { class: "cfgp-login", href: profileUrl, target: "_blank", rel: "noopener noreferrer", text: comment.author.login })
          : h("span", { class: "cfgp-login", text: comment.author.login })
      );
    } else {
      head.appendChild(h("span", { class: "cfgp-avatar cfgp-ghost-avatar", text: "?" }));
      head.appendChild(h("span", { class: "cfgp-login", text: "ghost" }));
    }
    head.appendChild(h("a", { class: "cfgp-time", href: safeUrl(comment.url, false), target: "_blank", rel: "noopener noreferrer", title: comment.createdAt, text: relativeTime(comment.createdAt) }));
    if (comment.editedAt) head.appendChild(h("span", { class: "cfgp-edited", title: comment.editedAt, text: "edited" }));
    card.appendChild(head);
    const body = h("div", { class: "cfgp-body" });
    body.appendChild(sanitizeHTML(comment.bodyHTML));
    card.appendChild(body);
    const pills = reactionPills(comment.reactions);
    if (pills) card.appendChild(pills);
    for (const reply of comment.replies || []) card.appendChild(renderComment(reply, true));
    if (comment.repliesTruncated) {
      card.appendChild(h("a", { class: "cfgp-more", href: safeUrl(comment.url, false), target: "_blank", rel: "noopener noreferrer", text: "View more replies on GitHub →" }));
    }
    return card;
  }

  // --- styles ---------------------------------------------------------------
  const CSS = `
.cfgp{--cfgp-fg:#1f2328;--cfgp-fg-muted:#59636e;--cfgp-bg:#ffffff;--cfgp-card:#f6f8fa;--cfgp-border:#d1d9e0;--cfgp-accent:#0969da;--cfgp-btn-fg:#ffffff;
  color:var(--cfgp-fg);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;max-width:100%;}
.cfgp--dark{--cfgp-fg:#f0f6fc;--cfgp-fg-muted:#9198a1;--cfgp-bg:#0d1117;--cfgp-card:#151b23;--cfgp-border:#3d444d;--cfgp-accent:#4493f8;--cfgp-btn-fg:#ffffff;}
.cfgp-header{display:flex;align-items:center;gap:.6em;margin:0 0 1em;font-weight:600;font-size:1.05em;}
.cfgp-header .cfgp-reactions{font-weight:400;}
.cfgp-comment{background:var(--cfgp-card);border:1px solid var(--cfgp-border);border-radius:8px;padding:.85em 1em;margin:0 0 .8em;}
.cfgp-reply{margin:.8em 0 0;border-radius:6px;background:var(--cfgp-bg);}
.cfgp-head{display:flex;align-items:center;gap:.5em;margin-bottom:.35em;}
.cfgp-avatar{width:22px;height:22px;border-radius:50%;flex:none;}
.cfgp-ghost-avatar{display:inline-flex;align-items:center;justify-content:center;background:var(--cfgp-border);color:var(--cfgp-fg-muted);font-size:12px;}
.cfgp-login{font-weight:600;color:var(--cfgp-fg);text-decoration:none;}
.cfgp-login:hover{color:var(--cfgp-accent);}
.cfgp-time,.cfgp-edited{color:var(--cfgp-fg-muted);font-size:.85em;text-decoration:none;}
.cfgp-time:hover{color:var(--cfgp-accent);text-decoration:underline;}
.cfgp-body{overflow-wrap:anywhere;}
.cfgp-body p{margin:.4em 0;}
.cfgp-body pre{background:var(--cfgp-bg);border:1px solid var(--cfgp-border);border-radius:6px;padding:.6em .8em;overflow-x:auto;}
.cfgp-body code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em;}
.cfgp-body blockquote{border-left:3px solid var(--cfgp-border);margin:.4em 0;padding:0 .8em;color:var(--cfgp-fg-muted);}
.cfgp-body img{max-width:100%;}
.cfgp-body table{border-collapse:collapse;display:block;overflow-x:auto;}
.cfgp-body th,.cfgp-body td{border:1px solid var(--cfgp-border);padding:.25em .6em;}
.cfgp-reactions{display:inline-flex;gap:.35em;margin-top:.4em;}
.cfgp-pill{background:var(--cfgp-bg);border:1px solid var(--cfgp-border);border-radius:999px;padding:.05em .55em;font-size:.85em;}
.cfgp-footer{margin-top:1em;}
.cfgp-btn{display:inline-block;background:var(--cfgp-accent);color:var(--cfgp-btn-fg);border-radius:6px;padding:.5em .9em;font-weight:600;text-decoration:none;}
.cfgp-btn:hover{filter:brightness(1.1);}
.cfgp-muted{color:var(--cfgp-fg-muted);}
.cfgp-more{display:inline-block;margin-top:.5em;color:var(--cfgp-accent);font-size:.9em;text-decoration:none;}
.cfgp-error{color:var(--cfgp-fg-muted);font-style:italic;}
`;

  // --- main -----------------------------------------------------------------
  function mount() {
    let target = document.querySelector(cfg.target);
    if (!target) {
      target = document.createElement("div");
      script.insertAdjacentElement("afterend", target);
    }
    const root = h("section", { class: "cfgp" });
    const style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);
    target.appendChild(root);

    const applyTheme = () => {
      const dark = cfg.theme === "dark" || (cfg.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("cfgp--dark", dark);
    };
    applyTheme();
    if (cfg.theme === "auto") {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
    }
    return root;
  }

  function newDiscussionUrl(term) {
    return `${cfg.serverUrl}/${cfg.repo}/discussions/new?category=${encodeURIComponent(cfg.categorySlug)}&title=${encodeURIComponent(term)}`;
  }

  function renderEmpty(root, term, discussionUrl) {
    root.appendChild(h("div", { class: "cfgp-header", text: "Comments" }));
    root.appendChild(h("p", { class: "cfgp-muted", text: "No comments yet." }));
    const href = discussionUrl ? safeUrl(discussionUrl, false) : cfg.repo ? newDiscussionUrl(term) : null;
    if (href) {
      const footer = h("div", { class: "cfgp-footer" });
      footer.appendChild(h("a", { class: "cfgp-btn", href, target: "_blank", rel: "noopener noreferrer", text: "Start the discussion →" }));
      root.appendChild(footer);
    }
  }

  function renderThread(root, data) {
    const count = data.discussion.totalComments;
    const header = h("div", { class: "cfgp-header", text: `${count} comment${count === 1 ? "" : "s"}` });
    const pills = reactionPills(data.discussion.reactions);
    if (pills) header.appendChild(pills);
    root.appendChild(header);
    for (const comment of data.comments) root.appendChild(renderComment(comment, false));
    const footer = h("div", { class: "cfgp-footer" });
    if (data.discussion.locked) {
      footer.appendChild(h("p", { class: "cfgp-muted", text: "This conversation is locked." }));
    } else {
      footer.appendChild(h("a", { class: "cfgp-btn", href: safeUrl(data.discussion.url, false), target: "_blank", rel: "noopener noreferrer", text: "Join the discussion on GitHub →" }));
    }
    root.appendChild(footer);
  }

  async function run() {
    const root = mount();
    const term = cfg.mapping === "term" && cfg.term ? cfg.term : location.pathname;
    try {
      const res = await fetch(`${cfg.dataUrl}/${termToSlug(term)}.json`, { headers: { Accept: "application/json" } });
      if (res.status === 404) return renderEmpty(root, term);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || data.schemaVersion > MAX_SCHEMA_VERSION) throw new Error("unsupported comments data version");
      if (!data.comments.length) return renderEmpty(root, term, data.discussion.locked ? null : data.discussion.url);
      renderThread(root, data);
    } catch (err) {
      root.appendChild(h("p", { class: "cfgp-error", text: "Comments could not be loaded." }));
      console.error("comments-for-github-pages:", err);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
