/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import channelSource from '@/pages/channel.vue?raw';
import foldableSectionSource from '@/components/MkFoldableSection.vue?raw';

describe('channel pinned section', () => {
	test('does not use sticky foldable headers for channel pinned notes', () => {
		assert.match(channelSource, /<MkFoldableSection :sticky="false">[\s\S]*i18n\.ts\.pinnedNotes/);
		assert.match(foldableSectionSource, /sticky\?: boolean;/);
		assert.match(foldableSectionSource, /sticky: true,/);
		assert.match(foldableSectionSource, /:class="\[\$style\.header, \{ \[\$style\.stickyHeader\]: sticky \}\]"/);
		assert.match(foldableSectionSource, /\.stickyHeader\s*\{[\s\S]*position: sticky;[\s\S]*top: var\(--MI-stickyTop, 0px\);[\s\S]*\}/);
	});
});
