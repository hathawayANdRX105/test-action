/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'assert';
import { describe, test } from '@jest/globals';

/** Mirror of ChatEntityService watermark compare (snowflake ids). */
function isMessageAtOrBeforeWatermark(messageId: string, watermark: string | null | undefined): boolean {
	return watermark != null && messageId <= watermark;
}

function countReaders(messageId: string, meId: string, watermarks: Map<string, string | null>): number {
	let count = 0;
	for (const [memberId, watermark] of watermarks) {
		if (memberId === meId) continue;
		if (isMessageAtOrBeforeWatermark(messageId, watermark)) count++;
	}
	return count;
}

describe('chat read receipt watermarks', () => {
	test('null watermark means unread', () => {
		assert.equal(isMessageAtOrBeforeWatermark('b', null), false);
		assert.equal(isMessageAtOrBeforeWatermark('b', undefined), false);
	});

	test('snowflake lexicographic compare', () => {
		assert.equal(isMessageAtOrBeforeWatermark('a', 'b'), true);
		assert.equal(isMessageAtOrBeforeWatermark('b', 'a'), false);
		assert.equal(isMessageAtOrBeforeWatermark('m1', 'm1'), true);
	});

	test('room readCount excludes self and counts covered members', () => {
		const me = 'me';
		const w = new Map<string, string | null>([
			[me, 'zzz'],
			['u1', 'm2'],
			['u2', 'm1'],
			['u3', null],
		]);
		assert.equal(countReaders('m1', me, w), 2); // u1,u2
		assert.equal(countReaders('m2', me, w), 1); // u1 only
		assert.equal(countReaders('m3', me, w), 0);
	});
});
