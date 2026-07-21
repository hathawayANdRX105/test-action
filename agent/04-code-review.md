# 4. Code review (agent handbook)

How agents (and humans) leave a **real** review on a PR — not only chat memory.

## Why

- Local / agent review that never hits GitHub **does not** show under **Reviews**.
- Plain PR **conversation comments** are not the same as a **Pull Request Review**.
- Branch protection and “someone looked at this” both need the **Reviews** API.

## When

| Situation | Action |
|-----------|--------|
| You finished implementing a PR you will not merge alone | Request review; do not self-**Approve** if you are the author |
| You reviewed as an agent for the maintainer | Leave a formal review on the PR (`gh pr review`) |
| CI is red with no explanation | Fix or comment **before** asking for merge |
| Docs-only / tiny PR | Still leave a short review if you ran CRG / checked scopes |

## Leave a GitHub Review record

Use the GitHub CLI (same repo remote as the PR):

```bash
# Prefer Approve when you are NOT the PR author
gh pr review <N> -R <owner/repo> --approve --body "..."

# Always available: formal Comment review (shows under Reviews)
gh pr review <N> -R <owner/repo> --comment --body "..."

# Block merge when something is wrong
gh pr review <N> -R <owner/repo> --request-changes --body "..."
```

### Author cannot Approve own PR

GitHub returns: `Review Can not approve your own pull request`.

- Author account → use **`--comment`** (or second account for real **Approve**).
- `--comment` still creates a **pullrequestreview** entry (visible in the Reviews UI).
- Issue-style comments alone will **not** fix “no code review data”.

### Body minimum

1. **Verdict** — Approve / Comment / Request changes (local intent).  
2. **What you checked** — CRG, CI, dirs, diff (below).  
3. **Findings** — Critical / Major / Minor (or “none”).  
4. **CI** — Quality / Validate / Integration status if you looked.

## Use CRG (code-review-graph)

```bash
# From the PR worktree / checkout
~/.local/bin/code-review-graph update --brief
~/.local/bin/code-review-graph detect-changes --base <merge-base-or-origin/dev>
```

Use CRG output for:

- Risk score and **review priorities**
- **Test gaps** on changed symbols
- Which functions/files to read first (not the whole monorepo)

Re-run after fixes before re-reviewing the same scope.

## Check Actions / CI

1. Open the PR **Checks** tab (or `gh pr checks <N>`).  
2. Know the workflow names (path-scoped):

| Checks title | Role |
|--------------|------|
| **Quality** | lint / misskey-js / Megalodon when the diff needs them |
| **Validate** | unit / typecheck / API e2e / container by **scope** |
| **Integration** | heavy; PR only with `run-integration` (or main/manual/schedule) |

3. Docs / `agent/**` / README-only PRs should **skip** full Quality package jobs and Validate test matrices; summary jobs stay green.  
4. Red required checks → fix on the **same branch** or explain; do not merge blind.  
5. Scope is **`base...HEAD`** (whole PR vs `dev`), not “last commit only”.

## Check directories and the diff

Before writing the review body:

1. **List changed files** — `gh pr diff <N> --name-only` or PR Files tab.  
2. **Group by locality** — workflows vs scripts vs docs vs `packages/*`.  
3. **Do not expand into code trees** you were not asked to review.  
4. **Read the actual hunks** — behavior, not only titles.  
5. For multi-scope work, use **two (or more) scoped reviewers** and merge findings into one GitHub review body.

## Suggested review shape (paste into `--body`)

```markdown
## Verdict
Approve | Comment | Request changes

## CRG
- base: <sha>
- risk: <n>
- priorities / gaps: ...

## Checked
- [ ] Diff / directories
- [ ] Actions (Quality / Validate / Integration)
- [ ] Required summary jobs green or explained

## Findings
| Priority | Item | Blocking? |
|----------|------|-----------|
| ... | ... | yes/no |

## Summary
Critical / Major / Minor counts; merge readiness.
```

## Anti-patterns

- Review only in chat / beads, never on the PR.  
- Approve as the PR author (GitHub rejects; use Comment or another account).  
- Ignore red CI.  
- Full-repo re-read when CRG already ranked a few symbols.  
- Mixing many Issues into one review PR.

## Related

- [01-dev-workflow.md](./01-dev-workflow.md) — Issue → branch → PR → CI → review → merge  
- [03-pr-guide.md](./03-pr-guide.md) — PR body / `Fixes` / base `dev`  
