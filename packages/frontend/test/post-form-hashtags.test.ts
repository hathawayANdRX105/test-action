/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import { appendMissingHashtags, collectHashtagsFromInput, extractHashtagsFromText } from '@/utility/post-form-hashtags.js';

describe('post form hashtags', () => {
	test('does not append tags already present in the note text', () => {
		assert.strictEqual(appendMissingHashtags('hello #bug', 'bug'), 'hello #bug');
	});

	test('only appends missing tags', () => {
		assert.strictEqual(appendMissingHashtags('hello #bug', 'bug fix'), 'hello #bug #fix');
	});

	test('deduplicates hashtag input using search normalization', () => {
		assert.deepStrictEqual(collectHashtagsFromInput('#bug bug #BUG Ｂｕｇ'), ['bug']);
	});

	test('detects existing tags using search normalization', () => {
		assert.strictEqual(appendMissingHashtags('hello #Ｂｕｇ', 'bug'), 'hello #Ｂｕｇ');
	});

	test('keeps the existing newline append behavior', () => {
		assert.strictEqual(appendMissingHashtags('hello\n', '#bug'), 'hello\n#bug');
	});

	test('extracts nested MFM hashtags once', () => {
		assert.deepStrictEqual(extractHashtagsFromText('$[x2 #bug] #BUG'), ['bug']);
	});
});
