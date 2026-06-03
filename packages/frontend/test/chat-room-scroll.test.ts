/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import { ChatAutoScrollState, getChatScrollMetrics, sortChatMessagesForTimeline } from '@/pages/chat/room-scroll.js';

describe('chat room scroll state', () => {
	test('does not auto-follow after the user starts scrolling away from latest', () => {
		let now = 0;
		const state = new ChatAutoScrollState({
			latestThreshold: 24,
			interactionLockMs: 1200,
			now: () => now,
		});

		state.updateFromScroll(0);
		assert.strictEqual(state.canAutoFollowLatest(0), true);

		state.markUserInteraction();
		assert.strictEqual(state.canAutoFollowLatest(1), false);

		now = 1300;
		state.updateFromScroll(80);
		assert.strictEqual(state.canAutoFollowLatest(1), false);

		state.markLatest();
		assert.strictEqual(state.canAutoFollowLatest(0), true);
	});

	test('keeps mutation auto-stick limited to the real latest edge', () => {
		let now = 0;
		const state = new ChatAutoScrollState({
			latestThreshold: 24,
			interactionLockMs: 1200,
			now: () => now,
		});

		assert.strictEqual(state.shouldStickToLatest(3, 4), true);
		assert.strictEqual(state.shouldStickToLatest(20, 4), false);

		state.markUserInteraction();
		assert.strictEqual(state.shouldStickToLatest(0, 4), false);

		now = 1300;
		state.markLatest();
		assert.strictEqual(state.shouldStickToLatest(0, 4), true);
	});

	test('normalizes normal column scroll metrics for latest-at-bottom chat', () => {
		assert.deepStrictEqual(getChatScrollMetrics({
			scrollTop: 480,
			scrollHeight: 1000,
			clientHeight: 400,
		} as HTMLElement), {
			maxScrollTop: 600,
			scrollTop: 480,
			latestDistance: 120,
			historyDistance: 480,
		});

		assert.deepStrictEqual(getChatScrollMetrics({
			scrollTop: 900,
			scrollHeight: 1000,
			clientHeight: 400,
		} as HTMLElement), {
			maxScrollTop: 600,
			scrollTop: 600,
			latestDistance: 0,
			historyDistance: 600,
		});
	});

	test('sorts context/search messages by creation time before id', () => {
		const sorted = sortChatMessagesForTimeline([
			{ id: 'z', createdAt: '2026-06-01T00:00:00.000Z' },
			{ id: 'a', createdAt: '2026-06-03T00:00:00.000Z' },
			{ id: 'm', createdAt: '2026-06-02T00:00:00.000Z' },
			{ id: 'y', createdAt: '2026-06-03T00:00:00.000Z' },
		]);

		assert.deepStrictEqual(sorted.map(item => item.id), ['y', 'a', 'm', 'z']);
	});
});
