#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/scripts/ci-changed-scopes.py"

run_case() {
  local name="$1"; shift
  echo "=== CASE: $name ==="
  printf '%s\n' "$@" | python3 "$PY"
  echo
}

run_case "backend stream only" packages/backend/src/server/api/stream/channel.ts
run_case "backend timeline only" packages/backend/src/server/api/endpoints/notes/local-timeline.ts
run_case "backend broad (NoteCreate)" packages/backend/src/core/NoteCreateService.ts
run_case "backend unit only" packages/backend/test/unit/SensitivePrivacySurface.ts
run_case "frontend only" packages/frontend/src/components/MkNote.vue
run_case "federation only" packages/backend/test-federation/compose.yml
run_case "container only" Dockerfile
run_case "lockfile widen" pnpm-lock.yaml
run_case "docs only" README.md
run_case "stream+timeline" \
  packages/backend/src/server/api/stream/channel.ts \
  packages/backend/src/core/FanoutTimelineService.ts

python3 - <<'PY'
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location("scopes", "scripts/ci-changed-scopes.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def jobs(s):
  out = ["detect-changes", "validation-gate", "PR Gate (always)"]
  if s["backend_unit"]: out.append("backend-unit")
  if s["backend_typecheck"]: out.append("backend-typecheck")
  if s["backend_api_e2e"]:
    total = int(s["e2e_shard_total"] or 0)
    out.append(f"backend-api-e2e x{total} shards patterns={s['e2e_patterns'] or 'ALL'}")
  if s["frontend"]: out += ["frontend-unit", "frontend-typecheck"]
  if s["federation"]: out.append("federation")
  if s["container"]: out.append("container-smoke")
  return out

cases = {
  "stream": ["packages/backend/src/server/api/stream/channel.ts"],
  "timeline": ["packages/backend/src/server/api/endpoints/notes/local-timeline.ts"],
  "broad": ["packages/backend/src/core/NoteCreateService.ts"],
  "unit": ["packages/backend/test/unit/SensitivePrivacySurface.ts"],
  "frontend": ["packages/frontend/src/x.ts"],
  "federation": ["packages/backend/test-federation/a.ts"],
  "container": ["Dockerfile"],
  "lockfile": ["pnpm-lock.yaml"],
  "docs": ["README.md"],
}
print("=== EXPECTED JOBS ===")
for name, files in cases.items():
  s = mod.classify(files)
  print(f"{name}: {jobs(s)}")
PY
