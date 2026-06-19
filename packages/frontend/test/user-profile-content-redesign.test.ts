/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import userHomeSource from '@/pages/user/home.vue?raw';
import userTimelineSource from '@/pages/user/index.timeline.vue?raw';
import noteMenuSource from '@/utility/get-note-menu.ts?raw';

describe('user profile content redesign', () => {
	test('renames profile tabs and adds channel/media surfaces', () => {
		assert.match(userHomeSource, /<option value="recommended">\{\{ i18n\.ts\.profileRecommended \}\}<\/option>/);
		assert.match(userHomeSource, /<option value="channels">\{\{ i18n\.ts\.channels \}\}<\/option>/);
		assert.match(userHomeSource, /<option value="media">\{\{ i18n\.ts\.media \}\}<\/option>/);
		assert.notMatch(userHomeSource, /pinnedOnly/);
		assert.match(userTimelineSource, /profileRecommended/);
		assert.match(userTimelineSource, /value="channels"/);
		assert.match(userTimelineSource, /value="media"/);
	});

	test('uses distinct pagination semantics for notes, all, channels, and media', () => {
		assert.match(userHomeSource, /const profileNotesPagination/);
		assert.match(userHomeSource, /withChannelNotes:\s*false/);
		assert.match(userHomeSource, /const allNotesPagination/);
		assert.match(userHomeSource, /withChannelNotes:\s*true/);
		assert.match(userHomeSource, /const channelNotesPagination/);
		assert.match(userHomeSource, /channelId:\s*selectedChannelId\.value\s*\?\?\s*undefined/);
		assert.match(userHomeSource, /const mediaPagination/);
		assert.match(userHomeSource, /MkNoteMediaGrid/);
	});

	test('note menu exposes profile recommendation actions instead of pin wording', () => {
		assert.match(noteMenuSource, /profileRecommend/);
		assert.match(noteMenuSource, /profileUnrecommend/);
		assert.match(noteMenuSource, /toggleProfileRecommendation/);
	});
});
