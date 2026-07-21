# Pull requests

Base: **`dev`**. Not `main`.

## Before you open

- Issue exists and you own the work.
- Branch is from current `dev`.
- Diff is one purpose (that Issue).
- You can explain every changed path.

## Body (always)

Use `.github/pull_request_template.md`:

| Section | Write |
|---------|--------|
| **What** | Observable result after merge |
| **Why** | Motive / root cause |
| **Issue** | `Fixes #N` or `Related #N` |
| **How to test** | Steps a human or CI already covers |
| **Checklist** | Honest |

`Fixes #N` closes the Issue on merge. `Related #N` links without auto-close — use for preview/integration PRs or multi-Issue maps.

## Extras

Only if needed: Screenshots (UI), Risk (data/security/hard revert), Changelog (user-facing), Notes for reviewers. Copy from the template comment; no empty headings.

## CI

Same branch fixes only. Details: [01 § CI](./01-dev-workflow.md). Do not request merge on unexplained red.

## Merge target

Maintainer merges to **`dev`**. You do not treat `main` as daily landing.
