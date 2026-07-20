# AGENTS.md — Universe Federation

Instructions for **AI agents** and human contributors working in this repository.

## Read first (agent handbook)

| Doc | Purpose |
|-----|---------|
| [`agent/README.md`](agent/README.md) | Index of agent docs |
| [`agent/01-dev-workflow.md`](agent/01-dev-workflow.md) | **Issue → branch → dev → PR → CI → review** |
| [`agent/02-issue-guide.md`](agent/02-issue-guide.md) | How to open Issues (templates) — includes **demo issue** links |
| [`agent/03-pr-guide.md`](agent/03-pr-guide.md) | How to open PRs (templates) |

GitHub templates (forms members fill):

- `.github/ISSUE_TEMPLATE/bug.yml`
- `.github/ISSUE_TEMPLATE/feature.yml`
- `.github/ISSUE_TEMPLATE/task.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/pull_request_template.md`

## Hard rules

1. **No direct pushes to `main` or `dev`.** Branch → PR → review → merge into **`dev`**. `main` is stable; only merge from `dev` when explicitly stabilizing a release.
2. **One Issue = one PR.** PR body must include `Fixes #N` / `Closes #N`. Never pack multiple Issues into one PR.
3. **Issue first.** Discuss / file Issue before coding (except trivial typo with maintainer OK). Prefer the **demo issues** linked in `agent/02-issue-guide.md` as structure examples.
4. **Single assignee** per Issue. Help via comments / `help-wanted`, not dual ownership.
5. **Use templates.** Do not open blank free-form Issues when a template fits.
6. **Keep the tree clean.** No random dirs/files, no secrets, no real instance config, no local tooling DB directories committed (see `.gitignore`).
7. **Match existing style.** Misskey/Sharkey-derived tree; no drive-by renames or rebrands.

## Scope limits

- Keep one PR to one Issue and one reviewable purpose. Split it before review if it changes more than three business subsystems, has a destructive schema change without migration and rollback notes, exceeds roughly 300 effective code lines, or cannot be understood in 30 minutes.
- Do not bundle architecture replacement, broad dependency upgrades, repository-wide formatting, unrequested rebranding, or speculative refactoring into a bug fix or small task.
- Do not change public API shapes or destructive data behavior unless the scoped Issue requires it and the PR states compatibility or migration impact.

## Branch names

| Prefix | Use |
|--------|-----|
| `fix/<issue>-slug` | Bug |
| `feat/<issue>-slug` | Feature |
| `refactor/<issue>-slug` | Behavior-preserving structure change |
| `chore/<issue>-slug` | CI / deps / tooling |
| `docs/<issue>-slug` | Docs only |

Open PRs against **`dev`**, not `main`.

## Before asking for review

- Diff matches **one** Issue scope.
- Workspace clean (no stray files/dirs).
- PR template checklist filled.
- CI on the PR green, or failures explained with a fix plan.

## Session close (agents)

1. Push branch; open/update the PR **into `dev`** with `Fixes #N`.
2. Update Issue / Project column if used.
3. Do not leave unfinished work only in chat memory — leave a PR or Issue comment.
