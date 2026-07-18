/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import { NotificationService } from '@/core/NotificationService.js';
import { GodOfTimeService } from '../misc/GodOfTimeService.js';
import { NativeTimeService } from '@/global/TimeService.js';

describe('NotificationService delayed unread bulk read', () => {
	function createService() {
		const redisState = new Map<string, string>();
		let xaddSeq = 0;
		let idSeq = 0;
		const redisClient: any = {
			get: jest.fn(async (key: string) => redisState.get(key) ?? null),
			mget: jest.fn(async (...keys: string[]) => keys.map(key => redisState.get(key) ?? null)),
			set: jest.fn(async (key: string, value: string) => {
				redisState.set(key, value);
				return 'OK';
			}),
			xadd: jest.fn(async (_key: string, ..._args: string[]) => {
				xaddSeq += 1;
				// Monotonic stream ids so string comparison matches creation order.
				return `${String(1_000_000 + xaddSeq).padStart(13, '0')}-0`;
			}),
			xrevrange: jest.fn(async () => []),
			del: jest.fn(async () => 1),
		};

		const notificationEntityService: any = {
			pack: jest.fn(async (notification: any) => ({
				id: notification.id,
				type: notification.type,
				createdAt: new Date(0).toISOString(),
			})),
		};

		const idService: any = {
			gen: jest.fn(() => `nid-${++idSeq}`),
			parseFull: jest.fn(() => ({ date: 1_000_000, additional: 0n })),
		};

		const globalEventService: any = {
			publishMainStream: jest.fn(async () => {}),
		};

		const pushNotificationService: any = {
			pushNotification: jest.fn(async () => {}),
		};

		const cacheService: any = {
			userProfileCache: {
				fetch: jest.fn(async () => ({ notificationRecieveConfig: {} })),
			},
			findUserById: jest.fn(async (id: string) => ({ id })),
			getUserRelation: jest.fn(async () => ({
				isMuting: false,
				isFollowing: true,
				isFollowed: true,
			})),
		};

		const timeService = new GodOfTimeService();
		timeService.resetTo(1_000_000);

		const service = new NotificationService(
			{ perUserNotificationsMaxCount: 300 } as never,
			redisClient as never,
			{} as never,
			notificationEntityService as never,
			idService as never,
			globalEventService as never,
			pushNotificationService as never,
			cacheService as never,
			{} as never,
			timeService,
		);

		return {
			service,
			redisState,
			redisClient,
			notificationEntityService,
			globalEventService,
			pushNotificationService,
			timeService,
		};
	}
	async function flushTimers() {
		// GodOfTime fires sync, but startPromiseTimer resolves via withSignal/withCleanup after setImmediate.
		await new Promise<void>(resolve => setImmediate(resolve));
		await new Promise<void>(resolve => setImmediate(resolve));
	}

	test('batches delayed latest-read checks with one mget, not get×N', async () => {
		const {
			service,
			redisClient,
			globalEventService,
			pushNotificationService,
			timeService,
		} = createService();

		const notifiees = ['u1', 'u2', 'u3', 'u4', 'u5'];
		for (const notifieeId of notifiees) {
			await service.createNotificationImmediate(notifieeId, 'follow', {}, 'actor');
		}

		// Immediate stream event still fires once per create.
		expect(globalEventService.publishMainStream).toHaveBeenCalledTimes(5);
		for (const notifieeId of notifiees) {
			expect(globalEventService.publishMainStream).toHaveBeenCalledWith(
				notifieeId,
				'notification',
				expect.objectContaining({ type: 'follow' }),
			);
		}
		expect(pushNotificationService.pushNotification).not.toHaveBeenCalled();
		expect(redisClient.get).not.toHaveBeenCalled();
		expect(redisClient.mget).not.toHaveBeenCalled();

		timeService.tick(2000);
		await flushTimers();

		expect(redisClient.mget).toHaveBeenCalledTimes(1);
		expect(redisClient.get).not.toHaveBeenCalled();
		const mgetKeys = redisClient.mget.mock.calls[0] as string[];
		expect(mgetKeys).toEqual(expect.arrayContaining(
			notifiees.map(id => `latestReadNotification:${id}`),
		));
		expect(mgetKeys).toHaveLength(5);

		expect(globalEventService.publishMainStream).toHaveBeenCalledTimes(10);
		expect(pushNotificationService.pushNotification).toHaveBeenCalledTimes(5);
		for (const notifieeId of notifiees) {
			expect(globalEventService.publishMainStream).toHaveBeenCalledWith(
				notifieeId,
				'unreadNotification',
				expect.objectContaining({ type: 'follow' }),
			);
			expect(pushNotificationService.pushNotification).toHaveBeenCalledWith(
				notifieeId,
				'notification',
				expect.objectContaining({ type: 'follow' }),
			);
		}
	});

	test('skips unread+push when latest-read is already at or past redisId', async () => {
		const {
			service,
			redisState,
			redisClient,
			globalEventService,
			pushNotificationService,
			timeService,
		} = createService();

		// Seed high watermark before timers fire so every candidate is considered read.
		redisState.set('latestReadNotification:reader', '9999999999999-0');

		await service.createNotificationImmediate('reader', 'follow', {}, 'actor');
		await service.createNotificationImmediate('reader', 'follow', {}, 'actor-2');

		expect(globalEventService.publishMainStream).toHaveBeenCalledTimes(2);
		timeService.tick(2000);
		await flushTimers();

		expect(redisClient.mget).toHaveBeenCalledTimes(1);
		expect(redisClient.get).not.toHaveBeenCalled();
		expect(globalEventService.publishMainStream).toHaveBeenCalledTimes(2);
		expect(globalEventService.publishMainStream).not.toHaveBeenCalledWith(
			'reader',
			'unreadNotification',
			expect.anything(),
		);
		expect(pushNotificationService.pushNotification).not.toHaveBeenCalled();
	});

	test('mixed read/unread candidates share one mget and emit only unread', async () => {
		const {
			service,
			redisState,
			redisClient,
			globalEventService,
			pushNotificationService,
			timeService,
		} = createService();

		const unreadA = await service.createNotificationImmediate('a', 'follow', {}, 'actor');
		const unreadB = await service.createNotificationImmediate('b', 'follow', {}, 'actor');
		const readC = await service.createNotificationImmediate('c', 'follow', {}, 'actor');
		expect(unreadA).not.toBeNull();
		expect(unreadB).not.toBeNull();
		expect(readC).not.toBeNull();

		// Mark only c as already read beyond its redis stream id after xadd.
		// xadd returns padded ids; set watermark to max so c is skipped.
		redisState.set('latestReadNotification:c', '9999999999999-0');

		timeService.tick(2000);
		await flushTimers();

		expect(redisClient.mget).toHaveBeenCalledTimes(1);
		expect(redisClient.get).not.toHaveBeenCalled();

		expect(globalEventService.publishMainStream).toHaveBeenCalledWith(
			'a',
			'unreadNotification',
			expect.objectContaining({ id: unreadA!.id }),
		);
		expect(globalEventService.publishMainStream).toHaveBeenCalledWith(
			'b',
			'unreadNotification',
			expect.objectContaining({ id: unreadB!.id }),
		);
		expect(globalEventService.publishMainStream).not.toHaveBeenCalledWith(
			'c',
			'unreadNotification',
			expect.anything(),
		);
		expect(pushNotificationService.pushNotification).toHaveBeenCalledTimes(2);
		expect(pushNotificationService.pushNotification).toHaveBeenCalledWith(
			'a',
			'notification',
			expect.objectContaining({ id: unreadA!.id }),
		);
		expect(pushNotificationService.pushNotification).toHaveBeenCalledWith(
			'b',
			'notification',
			expect.objectContaining({ id: unreadB!.id }),
		);
	});

	test('test notification uses 0-delay timer and still bulk-reads', async () => {
		const {
			service,
			redisClient,
			globalEventService,
			pushNotificationService,
			timeService,
		} = createService();

		await service.createNotificationImmediate('tester', 'test', {});
		// Immediate stream event before unread delay.
		expect(globalEventService.publishMainStream).toHaveBeenCalledWith(
			'tester',
			'notification',
			expect.objectContaining({ type: 'test' }),
		);
		expect(redisClient.mget).not.toHaveBeenCalled();

		// delay=0 timer expires at current now; advance 1ms to fire it.
		timeService.tick(1);
		await flushTimers();

		expect(redisClient.mget).toHaveBeenCalledTimes(1);
		expect(redisClient.get).not.toHaveBeenCalled();
		expect(globalEventService.publishMainStream).toHaveBeenCalledWith(
			'tester',
			'unreadNotification',
			expect.objectContaining({ type: 'test' }),
		);
		expect(pushNotificationService.pushNotification).toHaveBeenCalledWith(
			'tester',
			'notification',
			expect.objectContaining({ type: 'test' }),
		);
	});

	test('continues later unread dispatch when an earlier candidate fails', async () => {
		const {
			service,
			redisClient,
			globalEventService,
			pushNotificationService,
			timeService,
		} = createService();

		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => {
			unhandled.push(reason);
		};
		process.on('unhandledRejection', onUnhandled);

		try {
			const notifA = await service.createNotificationImmediate('a', 'follow', {}, 'actor');
			const notifB = await service.createNotificationImmediate('b', 'follow', {}, 'actor');
			expect(notifA).not.toBeNull();
			expect(notifB).not.toBeNull();

			globalEventService.publishMainStream.mockImplementation(async (userId: string, type: string) => {
				if (type === 'unreadNotification' && userId === 'a') {
					throw new Error('publish-a-failed');
				}
			});

			timeService.tick(2000);
			await flushTimers();
			// trackPromise settles after the flush microtask; drain once more for the catch path.
			await flushTimers();

			expect(redisClient.mget).toHaveBeenCalledTimes(1);
			expect(redisClient.get).not.toHaveBeenCalled();

			expect(globalEventService.publishMainStream).toHaveBeenCalledWith(
				'a',
				'unreadNotification',
				expect.objectContaining({ id: notifA!.id }),
			);
			expect(globalEventService.publishMainStream).toHaveBeenCalledWith(
				'b',
				'unreadNotification',
				expect.objectContaining({ id: notifB!.id }),
			);
			expect(pushNotificationService.pushNotification).not.toHaveBeenCalledWith(
				'a',
				'notification',
				expect.anything(),
			);
			expect(pushNotificationService.pushNotification).toHaveBeenCalledWith(
				'b',
				'notification',
				expect.objectContaining({ id: notifB!.id }),
			);
			expect(unhandled).toEqual([]);
		} finally {
			process.off('unhandledRejection', onUnhandled);
		}
	});

	test('native same-deadline timers batch into one mget flush', async () => {
		jest.useFakeTimers();
		try {
			const redisState = new Map<string, string>();
			let xaddSeq = 0;
			let idSeq = 0;
			const redisClient: any = {
				get: jest.fn(async (key: string) => redisState.get(key) ?? null),
				mget: jest.fn(async (...keys: string[]) => keys.map(key => redisState.get(key) ?? null)),
				set: jest.fn(async (key: string, value: string) => {
					redisState.set(key, value);
					return 'OK';
				}),
				xadd: jest.fn(async (_key: string, ..._args: string[]) => {
					xaddSeq += 1;
					return `${String(1_000_000 + xaddSeq).padStart(13, '0')}-0`;
				}),
				xrevrange: jest.fn(async () => []),
				del: jest.fn(async () => 1),
			};
			const notificationEntityService: any = {
				pack: jest.fn(async (notification: any) => ({
					id: notification.id,
					type: notification.type,
					createdAt: new Date(0).toISOString(),
				})),
			};
			const idService: any = {
				gen: jest.fn(() => `nid-${++idSeq}`),
				parseFull: jest.fn(() => ({ date: 1_000_000, additional: 0n })),
			};
			const globalEventService: any = {
				publishMainStream: jest.fn(async () => {}),
			};
			const pushNotificationService: any = {
				pushNotification: jest.fn(async () => {}),
			};
			const cacheService: any = {
				userProfileCache: {
					fetch: jest.fn(async () => ({ notificationRecieveConfig: {} })),
				},
				findUserById: jest.fn(async (id: string) => ({ id })),
				getUserRelation: jest.fn(async () => ({
					isMuting: false,
					isFollowing: true,
					isFollowed: true,
				})),
			};

			// Production path: NativeTimeService uses real setTimeout semantics (faked here).
			const timeService = new NativeTimeService();
			const service = new NotificationService(
				{ perUserNotificationsMaxCount: 300 } as never,
				redisClient as never,
				{} as never,
				notificationEntityService as never,
				idService as never,
				globalEventService as never,
				pushNotificationService as never,
				cacheService as never,
				{} as never,
				timeService,
			);

			const notifiees = ['n1', 'n2', 'n3', 'n4', 'n5'];
			for (const notifieeId of notifiees) {
				await service.createNotificationImmediate(notifieeId, 'follow', {}, 'actor');
			}

			expect(redisClient.mget).not.toHaveBeenCalled();
			expect(redisClient.get).not.toHaveBeenCalled();

			// Five independently scheduled same-deadline native timer callbacks.
			await jest.advanceTimersByTimeAsync(2000);
			// Drain the setImmediate flush barrier (check phase).
			await jest.runOnlyPendingTimersAsync();

			expect(redisClient.mget).toHaveBeenCalledTimes(1);
			expect(redisClient.get).not.toHaveBeenCalled();
			const mgetKeys = redisClient.mget.mock.calls[0] as string[];
			expect(mgetKeys).toHaveLength(5);
			expect(mgetKeys).toEqual(expect.arrayContaining(
				notifiees.map(id => `latestReadNotification:${id}`),
			));

			for (const notifieeId of notifiees) {
				expect(globalEventService.publishMainStream).toHaveBeenCalledWith(
					notifieeId,
					'unreadNotification',
					expect.objectContaining({ type: 'follow' }),
				);
				expect(pushNotificationService.pushNotification).toHaveBeenCalledWith(
					notifieeId,
					'notification',
					expect.objectContaining({ type: 'follow' }),
				);
			}
			expect(pushNotificationService.pushNotification).toHaveBeenCalledTimes(5);

			service.dispose();
			timeService.dispose();
		} finally {
			jest.useRealTimers();
		}
	});
});
