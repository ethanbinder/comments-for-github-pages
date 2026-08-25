# AGENTS.md

Instructions for AI agents working with this repository.

## What this repo is

comments-for-github-pages adds comment threads to GitHub Pages sites using
GitHub Discussions as the backend. A GitHub Actions workflow (running in the
*consumer's* pages repo) syncs Discussion comments into static JSON with the
built-in `GITHUB_TOKEN`; a single-file browser widget renders them. There is
no server, no third-party service, and no token ever reaches the browser. It
works on github.com and GitHub Enterprise Server.

## Your most likely task

> "Add comments to `<owner>/<pages-repo>` using this project."

**Follow `docs/agent-setup.md` step by step.** It is written for you: it
gathers the inputs, decides between the two install variants, gives exact
commands, marks the points where you must stop and ask the human, and ends
with a mandatory verification phase. Installing on several different pages
repos means running that runbook once per repo — installs are fully
independent and idempotent.

## Hard rules

1. **Vendor, don't rewrite.** Copy `scripts/sync-comments.mjs`,
   one `templates/sync-comments-*.yml`, and `widget/comments.js` as-is.
   Do not modify the script or widget internals; all configuration happens
   in the workflow file's `EDIT` markers and the widget's `data-*`
   attributes.
2. **Zero dependencies stays zero.** Never add npm packages, CDN scripts,
   or build steps to make an install "easier."
3. **No tokens in the browser, ever.** The widget must never call a GitHub
   API or receive a credential. If a task seems to require it, the task is
   wrong — stop and re-read `docs/security.md`.
4. **Never let `.git` reach the published site.** The build step's `.git`
   exclude is a security control (`actions/checkout` stores the job token
   in `.git/config`), not tidiness.
5. **Verification is part of the install.** Do not report success until
   Phase 4 of the runbook passes: workflow green, JSON live, widget
   renders, and one round-trip comment appears on the published page.
6. When developing in THIS repo (not installing from it): every change
   ships via branch + PR with a tech plan in `docs/tech-plans/` — see
   `CLAUDE.md`.
