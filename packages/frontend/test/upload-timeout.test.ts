/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import uploadSource from '@/utility/upload.ts?raw';

describe('upload timeout handling', () => {
	test('cleans up stalled or timed out uploads', () => {
		assert.match(uploadSource, /const UPLOAD_TIMEOUT_MS = 3 \* 60 \* 1000;/);
		assert.match(uploadSource, /const UPLOAD_STALL_TIMEOUT_MS = 75 \* 1000;/);
		assert.match(uploadSource, /xhr\.timeout = UPLOAD_TIMEOUT_MS;/);
		assert.match(uploadSource, /const cleanup = \(\) => \{[\s\S]*?window\.clearTimeout\(stallTimer\);[\s\S]*?removeUpload\(\);[\s\S]*?\};/);
		assert.match(uploadSource, /const resetStallTimer = \(\) => \{[\s\S]*?window\.setTimeout\(\(\) => \{[\s\S]*?fail\(new Error\('Upload stalled'\), \{ showNetworkFailure: true \}\);[\s\S]*?xhr\.abort\(\);[\s\S]*?\}, UPLOAD_STALL_TIMEOUT_MS\);[\s\S]*?\};/);
		assert.match(uploadSource, /xhr\.ontimeout = \(\) => \{[\s\S]*?fail\(new Error\('Upload timed out'\), \{ showNetworkFailure: true \}\);[\s\S]*?\};/);
		assert.match(uploadSource, /xhr\.onabort = \(\) => \{[\s\S]*?fail\(new Error\('Upload aborted'\), \{ showNetworkFailure: true \}\);[\s\S]*?\};/);
		assert.match(uploadSource, /xhr\.upload\.onprogress = ev => \{[\s\S]*?resetStallTimer\(\);[\s\S]*?ctx\.progressValue = ev\.loaded;[\s\S]*?\};/);
	});
});
