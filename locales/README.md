# Locales

Locale YAML is split into two layers (merged at build time; **fork wins** on key conflicts):

| Path | Role |
|------|------|
| `locales/upstream/` | Misskey-base language packs (large). Prefer not to hand-edit except when syncing upstream. |
| `locales/fork/` | Universe Federation / Sharkey-lineage overlay strings for this fork. |

Loader: `locales/index.js` merges `upstream` then `fork`.

For upstream Misskey contribution style, new base strings historically land in Japanese first; this fork’s own strings belong under `locales/fork/` (typically start from `fork/en-US.yml`).

See [Contribution guide](../CONTRIBUTING.md).
