# Contributing to Universe Federation

Universe Federation uses GitHub Issues and pull requests. The authoritative contribution workflow is maintained in this repository:

- [Repository rules for contributors and agents](AGENTS.md)
- [Development workflow](agent/01-dev-workflow.md)
- [Issue guide](agent/02-issue-guide.md)
- [Pull request guide](agent/03-pr-guide.md)

## Workflow

1. Open or claim one GitHub Issue.
2. Create a `fix/*`, `feat/*`, `chore/*`, or `docs/*` branch from `dev`.
3. Make one reviewable change for that Issue.
4. Open one pull request into `dev` with `Fixes #N` or `Closes #N` in its body.
5. After review and CI, maintainers merge `dev` to `main` only when stabilizing a release.

## Community and security

- Read the [Code of Conduct](CODE_OF_CONDUCT.md).
- Report vulnerabilities according to [Security policy](SECURITY.md), not through a public Issue.
