#!/bin/bash

# SPDX-FileCopyrightText: syuilo and misskey-project
# SPDX-License-Identifier: AGPL-3.0-only

# Docker image uses /sharkey; federation compose uses /misskey.
for cfg in /sharkey/.config/default.yml /misskey/.config/default.yml config/default.yml; do
	if [ -f "$cfg" ]; then
		PORT=$(grep '^port:' "$cfg" | awk 'NR==1{print $2; exit}')
		break
	fi
done
PORT=${PORT:-3000}
curl -Sfso/dev/null "http://localhost:${PORT}/healthz"
