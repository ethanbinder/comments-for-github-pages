---
title: Agent setup guide
author: ethan-binder
date: 2026-08-25
---

# Tech Plan: Agent-readable setup guide

## Objective

Make "add comments to this pages repo" a task an AI coding agent can execute
reliably end-to-end, across any number of GitHub Pages repos.

## Problem Statement

The human docs (README, install-ghes) explain the system but leave the
decisions and verification implicit. An agent needs a deterministic runbook:
explicit inputs, decision points (artifact vs branch Pages, github.com vs
GHES/mirror), copy-pasteable commands, ask-the-human checkpoints (e.g.
Discussion categories have no creation API), idempotency guarantees, and a
mandatory verification phase — plus a root AGENTS.md so agent tools
auto-discover the contract.

## Changes Made

- `AGENTS.md` — agent contract: what the repo is, "follow the runbook", and
  hard rules (vendor as-is, zero deps, no browser tokens, `.git` never
  published, verification required before reporting success).
- `docs/agent-setup.md` — the runbook: Phase 0 inputs/preconditions
  (Discussions, category, Pages mode detection), Phase 1 file acquisition
  (v1-pinned raw URLs or internal GHES mirror), Phase 2 workflow
  configuration per mode, Phase 3 widget placement per site type with the
  project-site path rule, Phase 4 mandatory verification (including the
  round-trip comment proof), Phase 5 multi-repo/upgrade/idempotency,
  troubleshooting table.
- `README.md` — "For AI agents" section with the one-line prompt humans
  hand their agent.

## Testing

Runbook dry-run executed for real: a fresh scratch pages repo was set up by
following `docs/agent-setup.md` verbatim (Phases 0–4, github.com path) and
the round-trip comment proof passed there. Relative links in all touched
docs verified against files in the branch.

## Risks

- Runbook commands drifting from shipped code; mitigated by referencing the
  canonical sources (`widget/comments.js` header, templates, json-schema,
  install-ghes) instead of restating them, and by the dry-run.
