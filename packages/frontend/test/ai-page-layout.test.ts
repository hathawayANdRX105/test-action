/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import aiSource from '@/pages/ai.vue?raw';

describe('ai page layout', () => {
	test('keeps long answers inside the message scroller', () => {
		assert.match(aiSource, /<div v-if="!status\.enabled \|\| status\.providers\.length === 0" :class="\$style\.noticeStack">/);
		assert.match(aiSource, /\.chat\s*\{[\s\S]*grid-template-areas:\s*"topbar"\s*"notice"\s*"messages"\s*"attachments"\s*"composer";[\s\S]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto auto;/);
		assert.match(aiSource, /\.topbar\s*\{[\s\S]*grid-area:\s*topbar;/);
		assert.match(aiSource, /\.noticeStack\s*\{[\s\S]*grid-area:\s*notice;/);
		assert.match(aiSource, /\.messages\s*\{[\s\S]*grid-area:\s*messages;[\s\S]*overflow-y:\s*auto;/);
		assert.match(aiSource, /\.pendingAttachments\s*\{[\s\S]*grid-area:\s*attachments;/);
		assert.match(aiSource, /\.composer\s*\{[\s\S]*grid-area:\s*composer;/);
	});

	test('uses a fixed three-line composer textarea', () => {
		assert.match(aiSource, /rows="3"/);
		assert.notMatch(aiSource, /@input="autoGrow"/);
		assert.notMatch(aiSource, /function autoGrow\(/);
		assert.match(aiSource, /\.textarea\s*\{[\s\S]*height:\s*calc\(1\.5em \* 3 \+ 18px\);[\s\S]*min-height:\s*calc\(1\.5em \* 3 \+ 18px\);[\s\S]*max-height:\s*calc\(1\.5em \* 3 \+ 18px\);[\s\S]*overflow-y:\s*auto;/);
	});

});
