# Agent handbook

Operational guide for **agents working in this repository**. Humans can follow the same rules.

## Read order

1. This file (how to start).
2. [01-dev-workflow.md](./01-dev-workflow.md) — the full work loop.
3. [02-issue-guide.md](./02-issue-guide.md) — when you must open or draft an Issue.
4. [03-pr-guide.md](./03-pr-guide.md) — when you open or update a PR.

Hard rules also sit in [`../AGENTS.md`](../AGENTS.md).

## How you work here

You are not free-form on `main`/`dev`. You:

1. **Know the goal** (user ask or existing Issue). If scope is unclear, stop and ask — do not guess a product decision.
2. **Have a GitHub Issue** before non-trivial code. Create one with the right template if missing.
3. **Branch from `dev`**, change only what the Issue needs.
4. **Open a PR to `dev`**, link the Issue, push early so Actions run.
5. **Fix red CI on the same branch** until green (or document an acceptable skip).
6. **Leave durable state** on the PR/Issue when you stop.

## Defaults (ponytail)

- Smallest change that works. No speculative files, frameworks, or “while we’re here”.
- Reuse what exists in-tree. Do not reimplement a helper next door.
- Fix root cause in the shared path, not a one-off guard at one callsite — unless the Issue is explicitly local.
- Match surrounding style. Do not reformat unrelated code.
- Every non-trivial claim needs a check: command, CI job, or explicit “not verified”.

## Do not

- Push to `main` or `dev`.
- Commit secrets, real instance config under `config/`, or local agent DBs.
- Close maintainer-owned epics/milestones unless they explicitly say so.
- Pack unrelated Issues into one PR “to save round-trips”.
