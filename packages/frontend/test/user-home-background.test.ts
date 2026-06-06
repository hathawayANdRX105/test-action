/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import homeSource from '@/pages/user/home.vue?raw';

describe('user home background', () => {
	test('keeps the profile background inside the user page stacking context', () => {
		assert.match(homeSource, /<div class="userHomeRoot _spacer"/);
		assert.match(homeSource, /<div v-if="user\.backgroundUrl != null" class="background"><\/div>/);
		assert.match(homeSource, /\.userHomeRoot\s*\{[\s\S]*position: relative;[\s\S]*isolation: isolate;[\s\S]*overflow: hidden;/);
		assert.match(homeSource, /\.background\{[\s\S]*position: absolute;[\s\S]*z-index: 0;[\s\S]*inset: 0;/);
		assert.strictEqual(/\.background\{[\s\S]*position: fixed;/.test(homeSource), false);
		assert.strictEqual(/\.background\{[\s\S]*z-index: -1;/.test(homeSource), false);
		assert.match(homeSource, /\.ftskorzw\s*\{[\s\S]*position: relative;[\s\S]*z-index: 1;/);
	});
});
