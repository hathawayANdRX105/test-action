# AGENTS.md — Universe Federation

How **agents** (and humans) do work in this repo. Read `agent/` before coding.

| Doc | When |
|-----|------|
| [agent/README.md](agent/README.md) | Start here |
| [agent/01-dev-workflow.md](agent/01-dev-workflow.md) | Issue → branch → PR → CI → merge |
| [agent/02-issue-guide.md](agent/02-issue-guide.md) | Open / draft a GitHub Issue |
| [agent/03-pr-guide.md](agent/03-pr-guide.md) | Open / update a PR |

Templates live under `.github/ISSUE_TEMPLATE/` and `.github/pull_request_template.md` — fill them; do not invent parallel formats.

## Non‑negotiables

1. **No direct push to `main` or `dev`.** Branch → PR → review → merge into **`dev`**. `main` only when stabilizing.
2. **Issue before code** (trivial typo only with maintainer OK).
3. **One Issue ↔ one PR** for normal work. PR names the Issue (`Fixes #N` or `Related #N`).
4. **Base PR on `dev`.** Never default-merge to `main`.
5. **Small scope.** One purpose; split if review/CI/rollback cannot stand alone.
6. **Clean tree.** No secrets, no real `config/*` (use examples only), no junk dirs, no drive-by rebrand of the Misskey/Sharkey-derived tree.
7. **Prove it.** Green PR checks, or a written reason for any red/skip you still want merged.

## Scope (stop lines)

- Do not fold architecture swaps, dependency thrash, repo-wide format, or unrequested features into a fix.
- Do not change public API / destructive data behavior unless the Issue requires it and the PR says so.
- Prefer the smallest diff that fixes the root cause (shared helper once > patch every caller).

## Branch names

`fix|feat|refactor|chore|docs/<issue-or-short>-slug` — from latest **`dev`**.

## Session end (agents)

Push the branch; open/update PR into **`dev`**; leave status on the Issue/PR — not only in chat.
