/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';

describe('FanoutTimelineService', () => {
	function createService(items: string[]) {
		const redisForTimelines: any = {
			lrange: jest.fn(async (_key: string, start: number, stop: number) => items.slice(start, stop + 1)),
			lindex: jest.fn(async (_key: string, index: number) => items[index] ?? null),
			llen: jest.fn(async () => items.length),
			del: jest.fn(),
		};
		const service = new FanoutTimelineService(
			redisForTimelines as never,
			{} as never,
			{ now: Date.now() } as never,
		);

		return { service, redisForTimelines };
	}

	test('reads only a bounded Redis window for normal timeline requests', async () => {
		const items = Array.from({ length: 10000 }, (_, i) => String(10000 - i).padStart(5, '0'));
		const { service, redisForTimelines } = createService(items);

		await expect(service.get('localTimeline', null, null, 20)).resolves.toEqual(items.slice(0, 20));
		expect(redisForTimelines.lrange).toHaveBeenCalledTimes(1);
		expect(redisForTimelines.lrange).toHaveBeenCalledWith('list:localTimeline', 0, 199);
	});

	test('scans in bounded chunks instead of loading the full timeline for older pages', async () => {
		const items = Array.from({ length: 10000 }, (_, i) => String(10000 - i).padStart(5, '0'));
		const { service, redisForTimelines } = createService(items);

		await expect(service.get('localTimeline', '09500', null, 20)).resolves.toHaveLength(20);
		expect(redisForTimelines.lrange).toHaveBeenCalledTimes(1);
		expect(redisForTimelines.lindex).toHaveBeenCalled();
		expect(redisForTimelines.lrange).not.toHaveBeenCalledWith('list:localTimeline', 0, -1);
	});

	test('returns sinceId pages in ascending order from bounded chunks', async () => {
		const items = Array.from({ length: 1000 }, (_, i) => String(1000 - i).padStart(4, '0'));
		const { service, redisForTimelines } = createService(items);

		await expect(service.get('localTimeline', null, '0990', 5)).resolves.toEqual(['0991', '0992', '0993', '0994', '0995']);
		expect(redisForTimelines.lrange).toHaveBeenCalledTimes(1);
	});
});
