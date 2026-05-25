/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import type * as Misskey from 'misskey-js';
import { containsMutedWord, expandNote, getMutedWords } from '@/utility/check-word-mute.js';

describe('check-word-mute', () => {
	it('matches hashtag metadata with a # pattern', () => {
		const note = {
			cw: null,
			text: null,
			files: [],
			poll: null,
			tags: ['签到'],
		} as unknown as Misskey.entities.Note;

		expect(containsMutedWord([['#签到']], expandNote(note))).toBe(true);
		expect(getMutedWords([['#签到']], expandNote(note))).toEqual(['#签到']);
	});
});
