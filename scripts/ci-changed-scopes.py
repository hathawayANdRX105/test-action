#!/usr/bin/env python3
"""Classify changed paths into CI scopes for job-level if conditions.

Usage:
  git diff --name-only BASE...HEAD | python3 scripts/ci-changed-scopes.py
  python3 scripts/ci-changed-scopes.py --files a b c
  python3 scripts/ci-changed-scopes.py --github-output

Outputs (boolean unless noted):
  backend_unit / backend_typecheck / backend_api_e2e
  frontend / federation / container / shared / all
  e2e_stream / e2e_timeline / e2e_api   (which API e2e groups)
  e2e_shard_total   (1 or 2 — concurrent jest shards)
  e2e_patterns      (jest --testPathPatterns regex, empty = all e2e files)
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import PurePosixPath


def matches(path: str, prefixes: tuple[str, ...], names: tuple[str, ...] | set[str] = ()) -> bool:
	p = path.replace("\\", "/")
	if p in names:
		return True
	return any(p == pref.rstrip("/") or p.startswith(pref.rstrip("/") + "/") for pref in prefixes)


def is_container_path(p: str) -> bool:
	name = PurePosixPath(p).name
	if "/" not in p.rstrip("/"):
		if name in {
			"Dockerfile",
			"compose.yml",
			"compose.yaml",
			"compose.local-db.yml",
			"compose.local-run.yml",
			"compose.alpine-db.yml",
			"compose_example.yml",
			"healthcheck.sh",
			".dockerignore",
		}:
			return True
		if name.startswith("compose") and name.endswith((".yml", ".yaml")):
			return True
	return matches(p, (".devcontainer/", "chart/", "docker/"))


def is_federation_path(p: str) -> bool:
	if matches(
		p,
		(
			"packages/backend/test-federation/",
			"packages/backend/src/core/activitypub/",
		),
	):
		return True
	if p.startswith("packages/backend/src/queue/processors/") and (
		"Inbox" in PurePosixPath(p).name or "Deliver" in PurePosixPath(p).name
	):
		return True
	return False


# --- backend API e2e path groups (selective) ---

STREAM_PREFIXES = (
	"packages/backend/src/server/api/stream/",
	"packages/backend/src/core/NoteVisibilityService.ts",
	"packages/backend/src/misc/is-instance-muted.ts",
	"packages/backend/test/e2e/streaming.ts",
	"packages/backend/test/e2e/mute.ts",
	"packages/backend/test/e2e/renote-mute.ts",
	"packages/backend/test/e2e/block.ts",
	"packages/backend/test/e2e/thread-mute.ts",
)
STREAM_CONTAINS = (
	"/mute",
	"Mute",
	"streaming",
	"Stream",
	"userProfileCache",
	"mutedInstances",
)

TIMELINE_PREFIXES = (
	"packages/backend/src/server/api/endpoints/notes/local-timeline.ts",
	"packages/backend/src/server/api/endpoints/notes/hybrid-timeline.ts",
	"packages/backend/src/server/api/endpoints/notes/timeline.ts",
	"packages/backend/src/server/api/endpoints/notes/user-list-timeline.ts",
	"packages/backend/src/core/FanoutTimelineService.ts",
	"packages/backend/src/core/FanoutTimelineEndpointService.ts",
	"packages/backend/src/core/RecommendationService.ts",
	"packages/backend/test/e2e/timelines.ts",
	"packages/backend/test/e2e/user-notes.ts",
)
TIMELINE_CONTAINS = (
	"Timeline",
	"timeline",
	"Fanout",
	"fanout",
	"Recommendation",
)

# e2e always-on infrastructure
E2E_INFRA = (
	"packages/backend/test/e2e/",
	"packages/backend/test-server/",
	"packages/backend/test/utils.ts",
	"packages/backend/test/jest.global-setup.e2e.cjs",
	"packages/backend/test/jest.setup.e2e.mjs",
	"packages/backend/jest.config.e2e.ts",
	"packages/backend/jest.config.common.ts",
	"packages/backend/jest.js",
)


def path_in_stream(p: str) -> bool:
	if matches(p, STREAM_PREFIXES) or any(p.endswith(x) if x.endswith(".ts") else False for x in STREAM_PREFIXES):
		return True
	if matches(p, tuple(x for x in STREAM_PREFIXES if x.endswith("/"))):
		return True
	for pref in STREAM_PREFIXES:
		if p == pref or p.startswith(pref if pref.endswith("/") else pref):
			return True
	return any(c in p for c in STREAM_CONTAINS if c in p)


def path_in_timeline(p: str) -> bool:
	for pref in TIMELINE_PREFIXES:
		if p == pref or p.startswith(pref if pref.endswith((".ts", "/")) else pref + "/"):
			return True
	return any(c in p for c in TIMELINE_CONTAINS)


def classify(files: list[str]) -> dict[str, str | bool]:
	empty = {
		"backend": False,
		"backend_unit": False,
		"backend_typecheck": False,
		"backend_api_e2e": False,
		"frontend": False,
		"federation": False,
		"container": False,
		"shared": False,
		"all": False,
		"e2e_stream": False,
		"e2e_timeline": False,
		"e2e_api": False,
		"e2e_shard_total": "0",
		"e2e_shards": "[]",
		"e2e_patterns": "",
	}
	if not files:
		return empty

	frontend_prefixes = (
		"packages/frontend/",
		"packages/frontend-embed/",
		"packages/frontend-shared/",
		"packages/sw/",
		"packages/misskey-bubble-game/",
		"packages/misskey-reversi/",
	)
	shared_names = (
		"pnpm-lock.yaml",
		"pnpm-workspace.yaml",
		"package.json",
		".node-version",
		"tsconfig.json",
	)
	shared_prefixes = (
		"packages/shared/",
		"packages/misskey-js/",
		"packages/megalodon/",
		"packages/stub/",
		"locales/",
		"scripts/",
		".github/",
		".config/",
	)

	backend_files: list[str] = []
	frontend = federation = container = shared = False
	touch_unit = touch_type = touch_e2e_infra = False
	e2e_stream = e2e_timeline = e2e_api = False
	backend_broad = False  # non-narrow backend change → full e2e
	for f in files:
		p = f.replace("\\", "/").lstrip("./")
		if not p or p.endswith("/"):
			continue

		if matches(p, shared_prefixes, shared_names):
			shared = True
		if is_container_path(p):
			container = True
		if is_federation_path(p):
			federation = True
		if matches(p, frontend_prefixes):
			frontend = True

		if not p.startswith("packages/backend/"):
			continue

		# Federation compose/tests alone do not pull backend unit/e2e.
		if p.startswith("packages/backend/test-federation/"):
			continue

		backend_files.append(p)

		if matches(p, ("packages/backend/test/unit/",)) or p.endswith("jest.config.unit.ts"):
			touch_unit = True
		if p.startswith("packages/backend/src/") or "tsconfig" in PurePosixPath(p).name:
			touch_type = True
			touch_unit = True  # src change also needs unit
		if matches(p, E2E_INFRA) or p.startswith("packages/backend/test/e2e/"):
			touch_e2e_infra = True

		in_s = path_in_stream(p)
		in_t = path_in_timeline(p)
		if in_s:
			e2e_stream = True
		if in_t:
			e2e_timeline = True

		# core runtime outside stream/timeline-specific → full API e2e
		if p.startswith("packages/backend/src/"):
			if not in_s and not in_t:
				backend_broad = True
				e2e_api = True
			elif in_s or in_t:
				pass
		if p.startswith("packages/backend/test/e2e/"):
			name = PurePosixPath(p).name
			if name in ("streaming.ts", "mute.ts", "renote-mute.ts", "block.ts", "thread-mute.ts"):
				e2e_stream = True
			elif name in ("timelines.ts", "user-notes.ts"):
				e2e_timeline = True
			else:
				e2e_api = True
				backend_broad = True

		# package.json / migration / boot → broad
		if p in ("packages/backend/package.json",) or p.startswith("packages/backend/migration/") or p.startswith("packages/backend/src/boot/"):
			backend_broad = True
			e2e_api = True
			touch_unit = True
			touch_type = True
			touch_e2e_infra = True

	# shared / CI / lockfile: widen unit + frontend + full e2e
	if shared:
		touch_unit = True
		touch_type = True
		touch_e2e_infra = True
		backend_broad = True
		e2e_stream = e2e_timeline = e2e_api = True
		frontend = True
		all_wide = True
	else:
		all_wide = False

	backend = bool(backend_files) or shared
	backend_unit = bool(touch_unit or (backend_files and not touch_e2e_infra and not touch_type))
	# any backend src/package → unit+typecheck default
	if backend_files and not shared:
		if any(p.startswith("packages/backend/src/") or p == "packages/backend/package.json" for p in backend_files):
			backend_unit = True
			touch_type = True
		if any(p.startswith("packages/backend/test/unit/") for p in backend_files):
			backend_unit = True
		if any("tsconfig" in p for p in backend_files):
			touch_type = True

	backend_typecheck = touch_type or shared

	# e2e needed?
	if shared or backend_broad or touch_e2e_infra or e2e_stream or e2e_timeline or e2e_api:
		if backend_broad or shared or touch_e2e_infra and not (e2e_stream or e2e_timeline or e2e_api):
			# infra-only e2e file change without group → full
			if touch_e2e_infra and not (e2e_stream or e2e_timeline or e2e_api):
				e2e_stream = e2e_timeline = e2e_api = True
			if backend_broad or shared:
				e2e_stream = e2e_timeline = e2e_api = True
		backend_api_e2e = True
	else:
		backend_api_e2e = False

	# patterns + shards
	e2e_patterns = ""
	e2e_shard_total = "0"
	e2e_shards = "[]"
	if backend_api_e2e:
		groups = []
		if e2e_stream:
			groups.append("stream")
		if e2e_timeline:
			groups.append("timeline")
		if e2e_api:
			groups.append("api")

		full = e2e_stream and e2e_timeline and e2e_api
		if full:
			e2e_patterns = ""  # all files
			e2e_shard_total = "2"  # concurrent half suites
			e2e_shards = "[1,2]"
		else:
			# selective: map groups → jest path regex
			pats: list[str] = []
			if e2e_stream:
				pats.extend(["streaming", "mute", "renote-mute", "block", "thread-mute"])
			if e2e_timeline:
				pats.extend(["timelines", "user-notes"])
			if e2e_api:
				# everything except heavy stream/timeline suites
				pats.extend(
					[
						"api",
						"endpoints",
						"note",
						"users",
						"oauth",
						"clips",
						"drive",
						"antennas",
						"2fa",
						"move",
						"exports",
						"fetch",
						"ff-visibility",
						"api-visibility",
						"nodeinfo",
						"well-known",
						"reversi",
					]
				)
			# jest --testPathPatterns is regex; join with |
			e2e_patterns = "|".join(pats)
			# selective usually smaller → 1 shard; 2 if stream+timeline+api partial heavy
			e2e_shard_total = "2" if len(groups) >= 2 else "1"
			e2e_shards = "[1,2]" if e2e_shard_total == "2" else "[1]"

	return {
		"backend": backend or shared,
		"backend_unit": backend_unit or shared,
		"backend_typecheck": backend_typecheck or shared,
		"backend_api_e2e": backend_api_e2e,
		"frontend": frontend,
		"federation": federation,
		"container": container,
		"shared": shared,
		"all": all_wide,
		"e2e_stream": e2e_stream and backend_api_e2e,
		"e2e_timeline": e2e_timeline and backend_api_e2e,
		"e2e_api": e2e_api and backend_api_e2e,
		"e2e_shard_total": e2e_shard_total,
		"e2e_shards": e2e_shards if backend_api_e2e else "[]",
		"e2e_patterns": e2e_patterns,
	}


def _fmt(v: str | bool) -> str:
	if isinstance(v, bool):
		return "true" if v else "false"
	return str(v)


def main() -> int:
	ap = argparse.ArgumentParser(description=__doc__)
	ap.add_argument("--files", nargs="*", help="explicit file paths")
	ap.add_argument("--github-output", action="store_true", help="append key=value to $GITHUB_OUTPUT")
	ap.add_argument("--json", action="store_true", help="print JSON")
	args = ap.parse_args()

	if args.files is not None and len(args.files) > 0:
		files = list(args.files)
	else:
		files = [ln.strip() for ln in sys.stdin if ln.strip()]

	scopes = classify(files)

	if args.github_output:
		out = os.environ.get("GITHUB_OUTPUT")
		if not out:
			print("GITHUB_OUTPUT not set", file=sys.stderr)
			return 2
		with open(out, "a", encoding="utf-8") as fh:
			for k, v in scopes.items():
				fh.write(f"{k}={_fmt(v)}\n")

	if args.json:
		import json

		print(json.dumps({k: (v if not isinstance(v, bool) else v) for k, v in scopes.items()}, sort_keys=True))
		return 0

	for k, v in scopes.items():
		print(f"{k}={_fmt(v)}")
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
