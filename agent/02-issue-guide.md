# Issues

Agents open or draft GitHub Issues **before** non-trivial implementation.

## Which template

| Template | Use when |
|----------|----------|
| **Bug** | Wrong behavior, regression, crash |
| **Feature** | New user-visible capability |
| **Task** | Cleanup, CI, docs, refactor, chore, perf work that is not a user feature pitch |

Labels: template defaults (`bug` / `enhancement` / `chore`); add `perf` / `docs` if useful. Do not invent a new template per label.

Blank free-form Issues: only if no template fits — almost never.

## What you must fill

Whatever the form marks **required**. In practice:

**Bug:** Confirmation · Description · Steps · Expected · Actual · Environment  

**Feature:** Description · Problem/use case · Done when  

**Task:** Goal · Done when  

**Done when** must be observable (command, UI state, file presence/absence, CI job). Vague goals → bad PRs.

## Extras

Optional fields (error logs, impact, non-goals, approach, …): fill **only when they add signal**. Leave empty otherwise. Never spam `N/A` blocks. Never put `(optional)` in the published heading text — the form already separates REQUIRED vs extras.

## Shape of a good Issue

- One outcome. If you need two merges, you need two Issues.
- Enough context for someone else (or future you) to verify without the chat log.
- No secrets, no production host inventories.

## Examples (structure only)

Closed demos with label `demo`: [#2](https://github.com/hathawayANdRX105/Universe-Federation/issues/2)–[#6](https://github.com/hathawayANdRX105/Universe-Federation/issues/6). Copy density/structure, not the topics. List: `label:demo`.

## After create

Assignee → work on a branch from `dev` → PR with `Fixes #N` or `Related #N` ([01](./01-dev-workflow.md)).
