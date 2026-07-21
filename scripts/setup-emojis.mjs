/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Prepares assets/emojis/fluent-emojis/dist for frontend builds when git submodules are missing.
 * Usage: node scripts/setup-emojis.mjs
 */

import { existsSync, mkdirSync, createWriteStream, createReadStream, promises as fsp } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { createGunzip } from 'node:zlib';
import * as tar from 'tar';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'assets', 'emojis', 'fluent-emojis', 'dist');
const probe = join(distDir, '1f3c6.png');

if (existsSync(probe)) {
	console.log('[setup-emojis] assets/emojis/fluent-emojis/dist already present, skip.');
	process.exit(0);
}

const version = '17.0.6';
const tarballUrl = `https://registry.npmjs.org/@misskey-dev/emoji-assets/-/emoji-assets-${version}.tgz`;
const tmpDir = join(root, 'temp-emoji');
const tgzPath = join(tmpDir, `emoji-assets-${version}.tgz`);
const extractDir = join(tmpDir, 'pkg');

mkdirSync(tmpDir, { recursive: true });
mkdirSync(distDir, { recursive: true });
mkdirSync(extractDir, { recursive: true });

console.log('[setup-emojis] downloading', tarballUrl);
const res = await fetch(tarballUrl);
if (!res.ok) {
	console.error('[setup-emojis] download failed', res.status, res.statusText);
	process.exit(1);
}
await pipeline(res.body, createWriteStream(tgzPath));

console.log('[setup-emojis] extracting…');
await tar.x({
	file: tgzPath,
	cwd: extractDir,
});

const src = join(extractDir, 'package', 'built', 'fluent-emoji');
if (!existsSync(src)) {
	console.error('[setup-emojis] extracted package missing built/fluent-emoji');
	process.exit(1);
}

const files = await fsp.readdir(src);
let n = 0;
for (const f of files) {
	if (!f.endsWith('.png')) continue;
	await fsp.copyFile(join(src, f), join(distDir, f));
	n++;
}
console.log(`[setup-emojis] copied ${n} png → assets/emojis/fluent-emojis/dist`);

if (!existsSync(probe)) {
	console.error('[setup-emojis] failed to produce', probe);
	process.exit(1);
}
console.log('[setup-emojis] done');
