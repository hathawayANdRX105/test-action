/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import recentNotesSource from '@/components/SkUserRecentNotes.vue?raw';
import userHomeSource from '@/pages/user/home.vue?raw';
import userTimelineSource from '@/pages/user/index.timeline.vue?raw';

describe('user notes channel visibility', () => {
	test('requests channel notes from every user profile notes surface', () => {
		assert.match(recentNotesSource, /withChannelNotes:\s*true,/);
		assert.match(userHomeSource, /withChannelNotes:\s*true,/);
		assert.match(userTimelineSource, /withChannelNotes:\s*true,/);
	});

	test('does not allow partial user profile note pages', () => {
		assert.match(recentNotesSource, /allowPartial:\s*false,/);
	});

	test('does not request replies and files together', () => {
		assert.match(recentNotesSource, /withReplies:\s*props\.onlyFiles \? false : props\.withReplies,/);
		assert.match(recentNotesSource, /withFiles:\s*props\.onlyFiles,/);
	});
});
