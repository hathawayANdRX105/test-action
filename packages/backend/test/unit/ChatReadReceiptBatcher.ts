/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import { ChatReadReceiptBatcher } from '@/server/api/stream/channels/chat-read-receipt-batcher.js';

describe('ChatReadReceiptBatcher', () => {
	test('coalesces reads within the interval', async () => {
		let now = 0;
		const scheduledTimers: (() => void)[] = [];
		const run = jest.fn<() => void | Promise<void>>();
		const batcher = new ChatReadReceiptBatcher({
			minIntervalMs: 2000,
			run,
			now: () => now,
			setTimer: callback => {
				scheduledTimers.push(callback);
				return {
					unref: jest.fn(),
				} as unknown as ReturnType<typeof setTimeout>;
			},
			clearTimer: () => {
				scheduledTimers.length = 0;
			},
		});

		batcher.queue();
		await Promise.resolve();
		expect(run).toHaveBeenCalledTimes(1);

		batcher.queue();
		batcher.queue();
		expect(run).toHaveBeenCalledTimes(1);
		expect(scheduledTimers).toHaveLength(1);

		now = 2000;
		scheduledTimers[0]();
		await Promise.resolve();
		expect(run).toHaveBeenCalledTimes(2);
	});

	test('flushes one pending read immediately', async () => {
		let now = 0;
		const run = jest.fn<() => void | Promise<void>>();
		const batcher = new ChatReadReceiptBatcher({
			minIntervalMs: 2000,
			run,
			now: () => now,
		});

		batcher.queue();
		await Promise.resolve();
		expect(run).toHaveBeenCalledTimes(1);

		now = 1;
		batcher.queue();
		expect(batcher.flush()).toBe(true);
		await Promise.resolve();
		expect(run).toHaveBeenCalledTimes(2);
		expect(batcher.flush()).toBe(false);
	});

	test('reports async errors without throwing from flush', async () => {
		const err = new Error('read failed');
		const onError = jest.fn();
		const batcher = new ChatReadReceiptBatcher({
			minIntervalMs: 2000,
			run: async () => {
				throw err;
			},
			onError,
			now: () => 0,
		});

		expect(() => batcher.queue()).not.toThrow();
		await new Promise(resolve => setImmediate(resolve));
		expect(onError).toHaveBeenCalledWith(err);
	});
});
