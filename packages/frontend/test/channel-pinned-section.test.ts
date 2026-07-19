/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import channelSource from '@/pages/channel.vue?raw';
import foldableSectionSource from '@/components/MkFoldableSection.vue?raw';

describe('channel pinned section', () => {
	test('renders pinned notes in a static section without foldable linkage', () => {
		assert.match(channelSource, /<section\b/);
		assert.match(channelSource, /i18n\.ts\.pinnedNotes/);
		assert.match(channelSource, /channel\.pinnedNotes/);
		assert.match(channelSource, /<MkNote\b/);
		assert.notMatch(channelSource, /data-channel-pinned-section/);
		assert.notMatch(channelSource, /MkFoldableSection[\s\S]*pinnedNotes|pinnedNotes[\s\S]*MkFoldableSection/);
	});

	test('keeps foldable section sticky header contract', () => {
		assert.match(foldableSectionSource, /sticky\?: boolean;/);
		assert.match(foldableSectionSource, /sticky: true,/);
		assert.match(foldableSectionSource, /:class="\[\$style\.header, \{ \[\$style\.stickyHeader\]: sticky \}\]"/);
		assert.match(foldableSectionSource, /\.stickyHeader\s*\{[\s\S]*position: sticky;[\s\S]*top: var\(--MI-stickyTop, 0px\);[\s\S]*\}/);
	});
});
