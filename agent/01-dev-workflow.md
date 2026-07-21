# Dev workflow

What you do from “task accepted” to “safe to merge into `dev`”.

## Loop

```text
Issue (exists or create)
  → branch from latest dev
  → implement only that Issue
  → commit; push; open/update PR → dev
  → read Actions
  → if red: fix root cause on same branch → push
  → when green: leave GitHub Review record if you reviewed → ready for merge (maintainer merges)
```

`main` is stable. You do not land daily work there.

## 1. Issue

- Non-trivial work **needs a GitHub Issue** first.
- Use Bug / Feature / Task templates (see [02](./02-issue-guide.md)).
- Assign yourself if you own it.
- One clear outcome per Issue. If you cannot state Done when, split or ask.

## 2. Branch

From latest `dev`:

| Prefix | Use |
|--------|-----|
| `fix/<n>-…` | Bug |
| `feat/<n>-…` | Feature |
| `chore/<n>-…` | Tooling / cleanup / CI |
| `docs/<n>-…` | Docs only |
| `refactor/<n>-…` | Structure only, behavior preserved |

No force-push to shared `dev`/`main`. Your feature branch: force only if you know the cost.

## 3. Implement

- Touch only paths the Issue requires. Surgical diffs.
- State assumptions; if two readings of the ask exist, surface them — do not pick silently.
- Prefer existing patterns in this monorepo (Misskey/Sharkey-derived). No drive-by renames.
- Runtime instance config lives under **`config/`** (examples only in git). Override with `MISSKEY_CONFIG_DIR` / `MISSKEY_CONFIG_YML` when needed — do not invent a second config system.
- Delete only what the task made obsolete or what the Issue orders. Mention other dead code; do not sweep it unasked.

## 4. PR

- Base: **`dev`**.
- Link Issue: **`Fixes #N`** (auto-close on merge) or **`Related #N`** (tracking / multi-knife preview, no auto-close).
- Body: What / Why / Issue / How to test / Checklist — see [03](./03-pr-guide.md).
- Push soon after first meaningful commit so Checks exist.

### Integration / preview PR

When many knives share one preview branch:

- Still keep **one GitHub Issue per knife** (or one explicit umbrella Issue if the user said so).
- PR lists them as `Related #…`. Use `Fixes` only when you intend close-on-merge for that Issue.
- Do not merge until the maintainer says so if they called it preview.

## 5. CI (Actions)

Trust **GitHub Checks on the PR**, not only local runs.

| Workflow (Checks title) | Role |
|-------------------------|------|
| **Quality** | Path-scoped lint / misskey-js / Megalodon when the diff needs them |
| **Validate** | Path-scoped unit, typecheck, API e2e, container smoke, … |
| **Integration** | Heavy; PR only with label `run-integration` (or main/manual/schedule) |

Path scope: `scripts/ci-changed-scopes.py` against **`base...HEAD`** (whole PR vs `dev`), not last commit alone.

| Diff touches | Typical fan-out |
|--------------|-----------------|
| Docs / `agent/**` / README / templates only | Quality package jobs + Validate test matrices **skip**; summary jobs stay green |
| `packages/backend/**` etc. | Matching unit / typecheck / e2e scopes |
| `Dockerfile`, `deploy/compose/*`, `scripts/healthcheck.sh` | **Container smoke** may run |
| `config/*` | **Shared** (unit/typecheck-style fan-out) — **not** the same as container smoke |

### Cadence

1. Push.
2. Do other local work; **do not busy-wait**.
3. Later: `gh pr checks <n>` or the Checks tab.
4. Red → same branch fix → push → new run.
5. Green → ask for review/merge if that is the goal.

### Read a failure

```text
gh pr checks <n>
gh run list --branch <branch> --limit 10
gh run view <run-id> --log-failed
```

Read the **failed job name** and the **last real error**, not only the gate summary.

### Fix CI

| Do | Don’t |
|----|--------|
| Fix the contract (path, mount, import, real bug) | Random unrelated refactors |
| One focused commit: what check, what cause | Silent drive-by |
| Open `fix(ci): …` Issue if tracking matters | Leave red with no note |

Common failures after moves: stale imports, host vs container config paths (`config/` vs old `.config`), expected job fan-out when shared paths change.

## 6. Review

- Reviews must land on **GitHub Reviews** (`gh pr review`), not only chat.
- PR **author cannot Approve** their own PR — use `--comment`, or another account for real Approve.
- Use **CRG** (`code-review-graph update` / `detect-changes`), read the diff, check Actions, then write the body.
- Full steps: [04-code-review.md](./04-code-review.md) if present on the branch; otherwise follow the same checklist.

## 7. Done means

- Diff matches the Issue.
- Tree clean of secrets/junk.
- Checks green, or red/skip explained and accepted.
- PR/Issue text updated — not only chat history.
- Maintainer merges to `dev`. You do not merge `main` unless ordered.

## One-liner

> Issue → branch from **dev** → PR to **dev** with `Fixes #N` or `Related #N` → push → fix red Checks on the same branch → GitHub Review record → merge to **dev**. One job per PR (or an explicit integration preview). No junk. **Don’t touch main.**
