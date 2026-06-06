/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import chatHomeSource from '@/pages/chat/home.home.vue?raw';

describe('chat home foldable sections', () => {
	test('does not use sticky accordion headers inside the chat landing page', () => {
		assert.match(chatHomeSource, /<MkFoldableSection v-if="searched" :sticky="false">/);
		assert.match(chatHomeSource, /<MkFoldableSection :sticky="false">[\s\S]*i18n\.ts\._chat\.history/);
		assert.strictEqual(/<MkFoldableSection(?![^>]*:sticky="false")/.test(chatHomeSource), false);
	});
});
