/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { ChatService, LARGE_CHAT_ROOM_MEMBER_THRESHOLD } from '@/core/ChatService.js';
import { CHAT_MESSAGE_MENTION_CACHE_TTL, chatMessageMentionCacheKey } from '@/core/entities/ChatEntityService.js';

describe('ChatService large room fast path', () => {
	function createService(memberCount: number, senderIsMember = true) {
		const redisState = new Map<string, any>();
		const redisPipeline: any = {
			set: jest.fn((key: string, value: string) => {
				redisState.set(key, value);
			}),
			sadd: jest.fn(),
			srem: jest.fn(),
			get: jest.fn((key: string) => {
				return redisState.get(key) ?? null;
			}),
			del: jest.fn((key: string) => {
				redisState.delete(key);
			}),
			exec: jest.fn(async () => [] as [Error | null, unknown][]),
		};
		const pipelineCommands: (() => [Error | null, unknown])[] = [];
		redisPipeline.set.mockImplementation((key: string, value: string) => {
			pipelineCommands.push(() => {
				redisState.set(key, value);
				return [null, 'OK'];
			});
			return redisPipeline;
		});
		redisPipeline.sadd.mockImplementation(() => {
			pipelineCommands.push(() => [null, 1]);
			return redisPipeline;
		});
		redisPipeline.srem.mockImplementation(() => {
			pipelineCommands.push(() => [null, 1]);
			return redisPipeline;
		});
		redisPipeline.get.mockImplementation((key: string) => {
			pipelineCommands.push(() => [null, redisState.get(key) ?? null]);
			return redisPipeline;
		});
		redisPipeline.del.mockImplementation((key: string) => {
			pipelineCommands.push(() => {
				const existed = redisState.delete(key);
				return [null, existed ? 1 : 0];
			});
			return redisPipeline;
		});
		redisPipeline.exec.mockImplementation(async () => {
			const results = pipelineCommands.map(command => command());
			pipelineCommands.length = 0;
			return results;
		});
		const redisClient: any = {
			pipeline: jest.fn(() => redisPipeline),
			get: jest.fn(async (key: string) => redisState.get(key) ?? null),
			mget: jest.fn(async (...keys: string[]) => keys.map(key => redisState.get(key) ?? null)),
			set: jest.fn(async (key: string, value: string) => {
				redisState.set(key, value);
				return 'OK';
			}),
			del: jest.fn(async (key: string) => redisState.delete(key) ? 1 : 0),
			lrange: jest.fn(async (key: string, start: number, stop: number) => {
				const list = redisState.get(key) ?? [];
				const end = stop < 0 ? list.length + stop + 1 : stop + 1;
				return list.slice(start, end);
			}),
			lpush: jest.fn(async (key: string, ...values: string[]) => {
				const list = redisState.get(key) ?? [];
				redisState.set(key, [...values, ...list]);
				return redisState.get(key).length;
			}),
			rpush: jest.fn(async (key: string, ...values: string[]) => {
				const list = redisState.get(key) ?? [];
				redisState.set(key, [...list, ...values]);
				return redisState.get(key).length;
			}),
			ltrim: jest.fn(async (key: string, start: number, stop: number) => {
				const list = redisState.get(key) ?? [];
				const end = stop < 0 ? list.length + stop + 1 : stop + 1;
				redisState.set(key, list.slice(start, end));
				return 'OK';
			}),
			expire: jest.fn(async () => 1),
			scard: jest.fn(async () => 0),
			eval: jest.fn(async (_script: string, _numberOfKeys: number, newRoomKey: string, mentionKey: string, _newMessagesSetKey: string, latestKey: string, readKey: string) => {
				const latest = redisState.get(latestKey) ?? null;
				redisState.delete(newRoomKey);
				redisState.delete(mentionKey);
				if (latest != null) {
					redisState.set(readKey, latest);
				}
				return latest;
			}),
		};
		const chatRoomMembershipsRepository: any = {
			countBy: jest.fn(async () => memberCount - 1),
			findOne: jest.fn(async () => senderIsMember ? { userId: 'sender', isMuted: false } : null),
			findOneBy: jest.fn(async () => null),
			findOneByOrFail: jest.fn(async () => ({ id: 'membership-id', roomId: 'room', userId: 'sender' })),
			find: jest.fn(async () => [] as any[]),
			findBy: jest.fn(async () => [] as any[]),
			insertOne: jest.fn(async (membership) => membership),
			delete: jest.fn(async () => ({ affected: 1 })),
			update: jest.fn(async () => ({ affected: 1 })),
		};
		const chatRoomUserSettingsRepository: any = {
			findOneBy: jest.fn(async () => null),
			upsert: jest.fn(async () => ({ identifiers: [] })),
			delete: jest.fn(async () => ({ affected: 1 })),
		};
		const chatUserConversationSettingsRepository: any = {
			findOneBy: jest.fn(async () => null),
			insertOne: jest.fn(async (setting) => setting),
			update: jest.fn(async () => ({ affected: 1 })),
			delete: jest.fn(async () => ({ affected: 1 })),
		};
		const chatMessagesQueryBuilder: any = {
			alias: 'message',
			update: jest.fn(function (this: any) { return this; }),
			set: jest.fn(function (this: any) { return this; }),
			where: jest.fn(function (this: any) { return this; }),
			orWhere: jest.fn(function (this: any) { return this; }),
			andWhere: jest.fn(function (this: any) { return this; }),
			leftJoinAndSelect: jest.fn(function (this: any) { return this; }),
			orderBy: jest.fn(function (this: any) { return this; }),
			take: jest.fn(function (this: any) { return this; }),
			setParameter: jest.fn(function (this: any) { return this; }),
			setParameters: jest.fn(function (this: any) { return this; }),
			execute: jest.fn(async () => ({ affected: 1 })),
			getMany: jest.fn(async () => []),
		};
		const chatRoomUserMutingQueryBuilder: any = {
			select: jest.fn(function (this: any) { return this; }),
			where: jest.fn(function (this: any) { return this; }),
			andWhere: jest.fn(function (this: any) { return this; }),
			insert: jest.fn(function (this: any) { return this; }),
			values: jest.fn(function (this: any) { return this; }),
			orIgnore: jest.fn(function (this: any) { return this; }),
			execute: jest.fn(async () => ({ identifiers: [] })),
			getQuery: jest.fn(() => 'room-user-muting-subquery'),
			getParameters: jest.fn(() => ({ roomUserMutingMuterId: 'reader' })),
		};
		const chatRoomUserMutingsRepository: any = {
			createQueryBuilder: jest.fn(() => chatRoomUserMutingQueryBuilder),
			existsBy: jest.fn(async () => false),
			find: jest.fn(async () => []),
			findOneOrFail: jest.fn(async () => ({
				id: 'room-user-muting-id',
				createdAt: new Date(0),
				roomId: 'room',
				muterId: 'sender',
				muteeId: 'target',
				mutee: { id: 'target' },
			})),
			delete: jest.fn(async () => ({ affected: 1 })),
		};
		const chatMessagesRepository: any = {
			insertOne: jest.fn(async (message: any) => ({ ...message, reactions: [] })),
			findOneByOrFail: jest.fn(async () => ({
				id: 'message-id',
				fromUserId: 'other',
				toUserId: 'sender',
				toRoomId: null,
				reactions: [],
			})),
			createQueryBuilder: jest.fn(() => chatMessagesQueryBuilder),
		};
		const userEntityService: any = {
			pack: jest.fn(async (userId) => ({ id: userId })),
		};
		const chatEntityService: any = {
			// packedRoomTimeline always overlays viewer-specific read receipts
			applyRoomReadReceipts: jest.fn(async (messages: any[]) => messages),
			packMessageLiteForRoom: jest.fn(async (message: any, options?: { mentionedUserIds?: string[] }) => ({
				id: message.id,
				createdAt: new Date(0).toISOString(),
				fromUserId: message.fromUserId,
				fromUser: { id: message.fromUserId },
				toRoomId: message.toRoomId,
				text: message.text,
				fileId: message.fileId,
				file: null,
				mentionedUserIds: options?.mentionedUserIds ?? [],
				reactions: [],
			})),
			packMessagesLiteForRoom: jest.fn(async (messages: any[]) => messages.map(message => ({
				id: message.id,
				createdAt: new Date(0).toISOString(),
				fromUserId: message.fromUserId,
				fromUser: { id: message.fromUserId },
				toRoomId: message.toRoomId ?? 'room',
				text: message.text ?? null,
				fileId: message.fileId ?? null,
				file: null,
				replyId: message.replyId ?? null,
				reply: null,
				quoteId: message.quoteId ?? null,
				quote: null,
				mentionedUserIds: [],
				reactions: [],
			}))),
			packMessageDetailed: jest.fn(async (message: any, _me?: any, options?: { mentionedUserIds?: string[] }) => ({
				id: message.id,
				createdAt: new Date(0).toISOString(),
				fromUserId: message.fromUserId,
				fromUser: { id: message.fromUserId },
				toRoomId: message.toRoomId,
				text: message.text,
				fileId: message.fileId,
				file: null,
				mentionedUserIds: options?.mentionedUserIds ?? [],
				reactions: [],
			})),
		};
		const globalEventService: any = {
			publishChatUserStream: jest.fn(),
			publishChatRoomStream: jest.fn(),
			publishChatRoomStreamBatched: jest.fn(),
			publishMainStream: jest.fn(),
		};
		const pushNotificationService: any = {
			pushNotification: jest.fn(),
		};
		const timeService: any = {
			now: 0,
			startTimer: jest.fn(),
		};
		const idService: any = {
			gen: jest.fn(() => 'message-id'),
		};
		const meta: any = {
			id: 'meta',
			chatRoomDefaultMemberLimit: 10000,
			chatMessageRetentionDays: 0,
			chatBannedKeywords: [],
		};
		const metasRepository: any = {
			findOneByOrFail: jest.fn(async () => meta),
		};
		const chatRoomsRepository: any = {
			findOneBy: jest.fn(async () => ({
				id: 'room',
				ownerId: 'owner',
				joinMode: 'open',
				memberLimitOverride: null,
			})),
			findOneByOrFail: jest.fn(async () => ({
				id: 'room',
				ownerId: 'owner',
				joinMode: 'open',
				memberLimitOverride: null,
			})),
			findOneOrFail: jest.fn(async () => ({
				isSilenced: false,
			})),
		};
		const chatRoomBanningsRepository: any = {
			existsBy: jest.fn(async () => false),
			delete: jest.fn(async () => ({ affected: 1 })),
			createQueryBuilder: jest.fn(() => chatRoomUserMutingQueryBuilder),
		};
		const chatRoomInvitationsRepository: any = {
			findOneBy: jest.fn(async () => null),
			insertOne: jest.fn(async (invitation) => invitation),
			delete: jest.fn(async () => ({ affected: 1 })),
		};
		const notificationService: any = {
			createNotification: jest.fn(),
		};
		const userBlockingService: any = {
			checkBlocked: jest.fn(async () => false),
		};
		const customEmojiService: any = {
			emojisByKeyCache: {
				fetchMaybe: jest.fn(async () => null),
			},
		};
		const unlockChatRoomJoin = jest.fn(async () => {});
		const appLockService: any = {
			getChatRoomJoinLock: jest.fn(async () => unlockChatRoomJoin),
		};
		const mfmService: any = {
			extractMentions: jest.fn(() => []),
		};
		const remoteUserResolveService: any = {
			resolveUser: jest.fn(async () => null),
		};
		const roleService: any = {
			getUserPolicies: jest.fn(async () => ({ chatAvailability: 'available' })),
			isAdministrator: jest.fn(async () => false),
			isModerator: jest.fn(async () => false),
		};
		const queryService: any = {
			makePaginationQuery: jest.fn((query) => query),
		};
		const service = new ChatService(
			{} as never,
			redisClient as never,
			meta as never,
			{} as never,
			metasRepository as never,
			chatMessagesRepository as never,
			{} as never,
			chatRoomsRepository as never,
			chatRoomInvitationsRepository as never,
			chatRoomMembershipsRepository as never,
			chatRoomUserSettingsRepository as never,
			chatUserConversationSettingsRepository as never,
			chatRoomUserMutingsRepository as never,
			chatRoomBanningsRepository as never,
			{} as never,
			{} as never,
			userEntityService as never,
			chatEntityService as never,
			idService as never,
			globalEventService as never,
			{} as never,
			{} as never,
			pushNotificationService as never,
			notificationService as never,
			userBlockingService as never,
			queryService as never,
			roleService as never,
			{} as never,
			customEmojiService as never,
			{} as never,
			timeService as never,
			{} as never,
			appLockService as never,
			mfmService as never,
			remoteUserResolveService as never,
		);

		return {
			service,
			redisState,
			redisClient,
			redisPipeline,
			chatMessagesRepository,
			chatMessagesQueryBuilder,
			chatRoomMembershipsRepository,
			chatRoomInvitationsRepository,
			notificationService,
			userBlockingService,
			chatRoomsRepository,
			metasRepository,
			chatRoomUserMutingsRepository,
			chatRoomUserMutingQueryBuilder,
			chatRoomBanningsRepository,
			queryService,
			appLockService,
			unlockChatRoomJoin,
			chatEntityService,
			globalEventService,
			pushNotificationService,
			timeService,
			mfmService,
			remoteUserResolveService,
			roleService,
		};
	}

	function createMessageQueryBuilder(rows: unknown[]) {
		return {
			alias: 'message',
			where: jest.fn(function (this: any) { return this; }),
			orWhere: jest.fn(function (this: any) { return this; }),
			andWhere: jest.fn(function (this: any) { return this; }),
			leftJoinAndSelect: jest.fn(function (this: any) { return this; }),
			orderBy: jest.fn(function (this: any) { return this; }),
			take: jest.fn(function (this: any) { return this; }),
			setParameter: jest.fn(function (this: any) { return this; }),
			setParameters: jest.fn(function (this: any) { return this; }),
			getMany: jest.fn(async () => rows),
		};
	}

	function createCachedRoomMessage(id: string, fromUserId: string) {
		return {
			id,
			fromUserId,
			fromUser: { id: fromUserId },
			toRoomId: 'room',
			text: `message ${id}`,
			fileId: null,
			file: null,
			replyId: null,
			reply: null,
			quoteId: null,
			quote: null,
			mentionedUserIds: [],
			reactions: [],
		};
	}

	test('room timeline filters messages from muted room users for the current user only', async () => {
		const ctx = createService(2);
		const query = createMessageQueryBuilder([{ id: 'visible-message' }]);
		ctx.chatMessagesRepository.createQueryBuilder.mockReturnValueOnce(query);

		await expect(ctx.service.roomTimeline('reader', 'room', 30)).resolves.toEqual([{ id: 'visible-message' }]);

		expect(ctx.chatRoomUserMutingsRepository.createQueryBuilder).toHaveBeenCalledWith('roomUserMuting');
		expect(ctx.chatRoomUserMutingQueryBuilder.andWhere).toHaveBeenCalledWith('roomUserMuting.roomId = message.toRoomId');
		expect(ctx.chatRoomUserMutingQueryBuilder.andWhere).toHaveBeenCalledWith('roomUserMuting.muteeId = message.fromUserId');
		expect(query.andWhere).toHaveBeenCalledWith('NOT EXISTS (room-user-muting-subquery)');
		expect(query.setParameters).toHaveBeenCalledWith({ roomUserMutingMuterId: 'reader' });

		const adminQuery = createMessageQueryBuilder([{ id: 'admin-visible-message' }]);
		ctx.chatMessagesRepository.createQueryBuilder.mockReturnValueOnce(adminQuery);
		ctx.chatRoomUserMutingsRepository.createQueryBuilder.mockClear();

		await expect(ctx.service.roomTimeline(null, 'room', 30)).resolves.toEqual([{ id: 'admin-visible-message' }]);

		expect(ctx.chatRoomUserMutingsRepository.createQueryBuilder).not.toHaveBeenCalled();
		expect(adminQuery.andWhere).not.toHaveBeenCalledWith('NOT EXISTS (room-user-muting-subquery)');
	});

	test('packed room timeline serves latest messages from redis hot cache', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		const cached = [
			{ id: 'm3', fromUserId: 'u3', fromUser: { id: 'u3' }, toRoomId: 'room', text: 'three', fileId: null, file: null, replyId: null, reply: null, quoteId: null, quote: null, mentionedUserIds: [], reactions: [] },
			{ id: 'm2', fromUserId: 'u2', fromUser: { id: 'u2' }, toRoomId: 'room', text: 'two', fileId: null, file: null, replyId: null, reply: null, quoteId: null, quote: null, mentionedUserIds: [], reactions: [] },
		];
		ctx.redisState.set('chat:room:room:timeline:v1', cached.map(message => JSON.stringify(message)));
		ctx.redisState.set('chat:room:room:timeline:v1:meta', JSON.stringify({ warmedAt: 1, complete: true }));

		await expect(ctx.service.packedRoomTimeline('reader', 'room', 2)).resolves.toEqual(cached);

		expect(ctx.chatMessagesRepository.createQueryBuilder).not.toHaveBeenCalled();
		expect(ctx.chatEntityService.packMessagesLiteForRoom).not.toHaveBeenCalled();
	});

	test('packed room timeline reads only the requested hot-cache window without muted users or a cursor', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		const cached = Array.from({ length: 300 }, (_, index) => createCachedRoomMessage(`m${300 - index}`, `user-${index}`));
		ctx.redisState.set('chat:room:room:timeline:v1', cached.map(message => JSON.stringify(message)));
		ctx.redisState.set('chat:room:room:timeline:v1:meta', JSON.stringify({ warmedAt: 1, complete: true }));

		await expect(ctx.service.packedRoomTimeline('reader', 'room', 30)).resolves.toEqual(cached.slice(0, 30));

		expect(ctx.redisClient.lrange).toHaveBeenCalledTimes(1);
		expect(ctx.redisClient.lrange).toHaveBeenCalledWith('chat:room:room:timeline:v1', 0, 29);
		expect(ctx.chatMessagesRepository.createQueryBuilder).not.toHaveBeenCalled();
	});

	test('packed room timeline keeps the full hot-cache window when muted users need filtering', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		const cached = Array.from({ length: 300 }, (_, index) => createCachedRoomMessage(
			`m${300 - index}`,
			index % 2 === 0 ? 'muted' : `user-${index}`,
		));
		ctx.redisState.set('chat:room:room:timeline:v1', cached.map(message => JSON.stringify(message)));
		ctx.redisState.set('chat:room:room:timeline:v1:meta', JSON.stringify({ warmedAt: 1, complete: true }));
		ctx.redisState.set('chat:room:room:muted:reader', JSON.stringify(['muted']));

		await expect(ctx.service.packedRoomTimeline('reader', 'room', 30)).resolves.toEqual(cached.filter(message => message.fromUserId !== 'muted').slice(0, 30));

		expect(ctx.redisClient.lrange).toHaveBeenCalledTimes(1);
		expect(ctx.redisClient.lrange).toHaveBeenCalledWith('chat:room:room:timeline:v1', 0, 299);
		expect(ctx.chatMessagesRepository.createQueryBuilder).not.toHaveBeenCalled();
	});

	test('packed room timeline keeps the full hot-cache window for sinceId pagination', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		const cached = Array.from({ length: 300 }, (_, index) => createCachedRoomMessage(
			String(300 - index).padStart(3, '0'),
			`user-${index}`,
		));
		ctx.redisState.set('chat:room:room:timeline:v1', cached.map(message => JSON.stringify(message)));
		ctx.redisState.set('chat:room:room:timeline:v1:meta', JSON.stringify({ warmedAt: 1, complete: true }));

		await expect(ctx.service.packedRoomTimeline('reader', 'room', 30, '150')).resolves.toHaveLength(30);

		expect(ctx.redisClient.lrange).toHaveBeenCalledTimes(1);
		expect(ctx.redisClient.lrange).toHaveBeenCalledWith('chat:room:room:timeline:v1', 0, 299);
		expect(ctx.chatMessagesRepository.createQueryBuilder).not.toHaveBeenCalled();
	});

	test('packed room timeline falls back to the full hot-cache window when the requested range contains malformed data', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		const cached = Array.from({ length: 299 }, (_, index) => createCachedRoomMessage(`m${299 - index}`, `user-${index}`));
		ctx.redisState.set('chat:room:room:timeline:v1', ['not-json', ...cached.map(message => JSON.stringify(message))]);
		ctx.redisState.set('chat:room:room:timeline:v1:meta', JSON.stringify({ warmedAt: 1, complete: true }));

		await expect(ctx.service.packedRoomTimeline('reader', 'room', 30)).resolves.toEqual(cached.slice(0, 30));

		expect(ctx.redisClient.lrange).toHaveBeenNthCalledWith(1, 'chat:room:room:timeline:v1', 0, 29);
		expect(ctx.redisClient.lrange).toHaveBeenNthCalledWith(2, 'chat:room:room:timeline:v1', 0, 299);
		expect(ctx.redisClient.lrange).toHaveBeenCalledTimes(2);
		expect(ctx.chatMessagesRepository.createQueryBuilder).not.toHaveBeenCalled();
	});

	test('packed room timeline refreshes redis cache when the latest room marker is newer', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		const cached = [
			{ id: 'm3', fromUserId: 'u3', fromUser: { id: 'u3' }, toRoomId: 'room', text: 'three', fileId: null, file: null, replyId: null, reply: null, quoteId: null, quote: null, mentionedUserIds: [], reactions: [] },
			{ id: 'm2', fromUserId: 'u2', fromUser: { id: 'u2' }, toRoomId: 'room', text: 'two', fileId: null, file: null, replyId: null, reply: null, quoteId: null, quote: null, mentionedUserIds: [], reactions: [] },
		];
		const freshRows = [
			{ id: 'm4', fromUserId: 'u4', toRoomId: 'room', text: 'four' },
			{ id: 'm3', fromUserId: 'u3', toRoomId: 'room', text: 'three' },
		];
		ctx.redisState.set('chat:room:room:timeline:v1', cached.map(message => JSON.stringify(message)));
		ctx.redisState.set('chat:room:room:timeline:v1:meta', JSON.stringify({ warmedAt: 1, complete: true }));
		ctx.redisState.set('latestRoomChatMessage:room', 'm4');
		ctx.chatMessagesRepository.createQueryBuilder.mockReturnValueOnce(createMessageQueryBuilder(freshRows));

		const result = await ctx.service.packedRoomTimeline('reader', 'room', 2);

		expect(result.map(message => message.id)).toEqual(['m4', 'm3']);
		expect(ctx.redisClient.lrange).toHaveBeenCalledWith('chat:room:room:timeline:v1', 0, 1);
		expect(ctx.chatMessagesRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
		expect(ctx.chatEntityService.packMessagesLiteForRoom).toHaveBeenCalledTimes(1);
	});

	test('packed room timeline filters muted users from redis hot cache', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		const cached = [
			{ id: 'm3', fromUserId: 'muted', fromUser: { id: 'muted' }, toRoomId: 'room', text: 'hidden', fileId: null, file: null, replyId: null, reply: null, quoteId: null, quote: null, mentionedUserIds: [], reactions: [] },
			{ id: 'm2', fromUserId: 'visible', fromUser: { id: 'visible' }, toRoomId: 'room', text: 'visible', fileId: null, file: null, replyId: null, reply: null, quoteId: null, quote: null, mentionedUserIds: [], reactions: [] },
		];
		ctx.redisState.set('chat:room:room:timeline:v1', cached.map(message => JSON.stringify(message)));
		ctx.redisState.set('chat:room:room:timeline:v1:meta', JSON.stringify({ warmedAt: 1, complete: true }));
		ctx.chatRoomUserMutingsRepository.find.mockResolvedValueOnce([{ muteeId: 'muted' }]);

		await expect(ctx.service.packedRoomTimeline('reader', 'room', 2)).resolves.toEqual([cached[1]]);
		expect(ctx.chatRoomUserMutingsRepository.find).toHaveBeenCalledWith({
			select: { muteeId: true },
			where: { roomId: 'room', muterId: 'reader' },
		});
	});

	test('concurrent room mute cache misses share one database load', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		let resolveRows: (rows: { muteeId: string; }[]) => void = () => {};
		const findStarted = new Promise<void>(resolve => {
			ctx.chatRoomUserMutingsRepository.find.mockImplementationOnce(() => {
				resolve();
				return new Promise<{ muteeId: string; }[]>(rowsResolve => {
					resolveRows = rowsResolve;
				});
			});
		});

		const mutedUserIds = Promise.all([
			ctx.service.getMutedRoomUserIds('reader', 'room'),
			ctx.service.getMutedRoomUserIds('reader', 'room'),
		]);

		await findStarted;
		expect(ctx.redisClient.get).toHaveBeenCalledTimes(1);
		expect(ctx.chatRoomUserMutingsRepository.find).toHaveBeenCalledTimes(1);
		resolveRows([{ muteeId: 'muted-user' }]);

		await expect(mutedUserIds).resolves.toEqual([
			new Set(['muted-user']),
			new Set(['muted-user']),
		]);
		expect(ctx.redisClient.set).toHaveBeenCalledTimes(1);
	});

	test('failed room mute loads do not block a later retry', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		ctx.chatRoomUserMutingsRepository.find
			.mockRejectedValueOnce(new Error('database unavailable'))
			.mockResolvedValueOnce([{ muteeId: 'muted-user' }]);

		await expect(ctx.service.getMutedRoomUserIds('reader', 'room')).rejects.toThrow('database unavailable');
		await expect(ctx.service.getMutedRoomUserIds('reader', 'room')).resolves.toEqual(new Set(['muted-user']));

		expect(ctx.chatRoomUserMutingsRepository.find).toHaveBeenCalledTimes(2);
	});

	test('packed room timeline coalesces cache warmup db fallback', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		const query = createMessageQueryBuilder([{ id: 'm2', fromUserId: 'u2' }]);
		ctx.chatMessagesRepository.createQueryBuilder.mockReturnValue(query);
		ctx.chatEntityService.packMessagesLiteForRoom.mockResolvedValue([{ id: 'm2', fromUserId: 'u2', fromUser: { id: 'u2' }, toRoomId: 'room', text: null, fileId: null, file: null, replyId: null, reply: null, quoteId: null, quote: null, mentionedUserIds: [], reactions: [] }]);

		const [a, b] = await Promise.all([
			ctx.service.packedRoomTimeline('reader', 'room', 20),
			ctx.service.packedRoomTimeline('reader', 'room', 20),
		]);

		expect(a).toEqual(b);
		expect(ctx.chatMessagesRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
		expect(ctx.chatEntityService.packMessagesLiteForRoom).toHaveBeenCalledTimes(1);
	});

	test('large rooms skip per-member unread and push fanout', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);

		await ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			text: 'hello',
		});

		expect(ctx.chatRoomMembershipsRepository.findBy).not.toHaveBeenCalled();
		expect(ctx.redisClient.pipeline).toHaveBeenCalledTimes(1);
		expect(ctx.chatRoomMembershipsRepository.countBy).toHaveBeenCalledTimes(1);
		expect(ctx.redisClient.get).toHaveBeenCalledWith('chatRoomMembersCount:room');
		expect(ctx.redisClient.set).toHaveBeenCalledWith('chatRoomMembersCount:room', String(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1), 'EX', 60);
		expect(ctx.redisPipeline.set).toHaveBeenCalledWith('latestRoomChatMessage:room', 'message-id', 'EX', 60 * 60 * 24 * 30);
		expect(ctx.redisPipeline.sadd).not.toHaveBeenCalled();
		expect(ctx.timeService.startTimer).not.toHaveBeenCalled();
		expect(ctx.pushNotificationService.pushNotification).not.toHaveBeenCalled();
		expect(ctx.chatEntityService.packMessageLiteForRoom).toHaveBeenCalledWith(expect.objectContaining({ id: 'message-id' }), { mentionedUserIds: [] });
		expect(ctx.globalEventService.publishChatRoomStreamBatched).toHaveBeenCalledWith('room', { type: 'message', body: expect.objectContaining({ id: 'message-id' }) });
	});

	test('small rooms keep existing unread fanout path', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD);

		await ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			text: 'hello',
		});

		expect(ctx.chatRoomMembershipsRepository.findBy).toHaveBeenCalledWith({ roomId: 'room' });
		expect(ctx.redisClient.pipeline).toHaveBeenCalled();
		expect(ctx.redisPipeline.set).toHaveBeenCalledWith('latestRoomChatMessage:room', 'message-id', 'EX', 60 * 60 * 24 * 30);
		expect(ctx.timeService.startTimer).toHaveBeenCalled();
	});

	test('blank room messages without files are rejected by the service', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);

		await expect(ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			text: '   ',
		})).rejects.toThrow('content required');

		expect(ctx.chatMessagesRepository.insertOne).not.toHaveBeenCalled();
		expect(ctx.globalEventService.publishChatRoomStream).not.toHaveBeenCalled();
	});

	test('room messages can send with only a reply reference', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);

		await ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			text: '   ',
			reply: { id: 'reply-id', toRoomId: 'room', toUserId: null } as never,
		});

		expect(ctx.chatMessagesRepository.insertOne).toHaveBeenCalledWith(expect.objectContaining({
			text: null,
			replyId: 'reply-id',
			toRoomId: 'room',
		}));
		expect(ctx.globalEventService.publishChatRoomStreamBatched).toHaveBeenCalledWith('room', { type: 'message', body: expect.objectContaining({ id: 'message-id' }) });
	});

	test('room messages can send with only a quote reference', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);

		await ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			quote: { id: 'quote-id', toRoomId: 'room', toUserId: null } as never,
		});

		expect(ctx.chatMessagesRepository.insertOne).toHaveBeenCalledWith(expect.objectContaining({
			text: null,
			quoteId: 'quote-id',
			toRoomId: 'room',
		}));
		expect(ctx.globalEventService.publishChatRoomStreamBatched).toHaveBeenCalledWith('room', { type: 'message', body: expect.objectContaining({ id: 'message-id' }) });
	});

	test('small multi-member rooms fan out reply-only messages', async () => {
		const ctx = createService(3);
		ctx.chatRoomMembershipsRepository.findBy.mockResolvedValueOnce([
			{ userId: 'sender', isMuted: false },
			{ userId: 'member-2', isMuted: false },
		]);

		await ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			reply: { id: 'reply-id', toRoomId: 'room', toUserId: null } as never,
		});

		expect(ctx.chatMessagesRepository.insertOne).toHaveBeenCalledWith(expect.objectContaining({
			text: null,
			replyId: 'reply-id',
			toRoomId: 'room',
		}));
		expect(ctx.redisPipeline.set).toHaveBeenCalledWith('newRoomChatMessageExists:member-2:room', 'message-id');
		expect(ctx.redisPipeline.set).toHaveBeenCalledWith('newRoomChatMessageExists:owner:room', 'message-id');
		expect(ctx.timeService.startTimer).toHaveBeenCalled();
	});

	test('small multi-member rooms fan out quote-only messages', async () => {
		const ctx = createService(3);
		ctx.chatRoomMembershipsRepository.findBy.mockResolvedValueOnce([
			{ userId: 'sender', isMuted: false },
			{ userId: 'member-2', isMuted: false },
		]);

		await ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			quote: { id: 'quote-id', toRoomId: 'room', toUserId: null } as never,
		});

		expect(ctx.chatMessagesRepository.insertOne).toHaveBeenCalledWith(expect.objectContaining({
			text: null,
			quoteId: 'quote-id',
			toRoomId: 'room',
		}));
		expect(ctx.redisPipeline.set).toHaveBeenCalledWith('newRoomChatMessageExists:member-2:room', 'message-id');
		expect(ctx.redisPipeline.set).toHaveBeenCalledWith('newRoomChatMessageExists:owner:room', 'message-id');
		expect(ctx.timeService.startTimer).toHaveBeenCalled();
	});

	test('message fanout reuses cached room member count', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		ctx.redisClient.get.mockResolvedValueOnce(String(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1));

		await ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			text: 'hello',
		});

		expect(ctx.chatRoomMembershipsRepository.countBy).not.toHaveBeenCalled();
		expect(ctx.redisClient.set).not.toHaveBeenCalledWith('chatRoomMembersCount:room', expect.anything(), 'EX', 60);
		expect(ctx.redisPipeline.set).toHaveBeenCalledWith('latestRoomChatMessage:room', 'message-id', 'EX', 60 * 60 * 24 * 30);
	});

	test('room owner can manage a room without moderator permission', async () => {
		const ctx = createService(1);

		const canManage = await ctx.service.hasPermissionToManageRoom({ id: 'owner' } as never, { ownerId: 'owner' } as never);

		expect(canManage).toBe(true);
		expect(ctx.roleService.isModerator).not.toHaveBeenCalled();
	});

	test('non-owner room management delegates to moderator permission', async () => {
		const ctx = createService(1);
		ctx.roleService.isModerator.mockResolvedValueOnce(true);

		await expect(ctx.service.hasPermissionToManageRoom({ id: 'moderator' } as never, { ownerId: 'owner' } as never)).resolves.toBe(true);
		expect(ctx.roleService.isModerator).toHaveBeenCalledWith({ id: 'moderator' });
		expect(ctx.roleService.isAdministrator).not.toHaveBeenCalled();

		ctx.roleService.isModerator.mockResolvedValueOnce(false);
		await expect(ctx.service.hasPermissionToManageRoom({ id: 'member' } as never, { ownerId: 'owner' } as never)).resolves.toBe(false);
	});

	test('room manager can moderate ordinary room members', async () => {
		const ctx = createService(1);
		ctx.chatRoomMembershipsRepository.findOne
			.mockResolvedValueOnce({ role: 'manager' })
			.mockResolvedValueOnce({ role: 'member' });

		await expect(ctx.service.canModerateRoomMember({ id: 'manager' } as never, { id: 'room', ownerId: 'owner' } as never, 'member')).resolves.toBe(true);
	});

	test('room manager cannot moderate another room manager', async () => {
		const ctx = createService(1);
		ctx.chatRoomMembershipsRepository.findOne
			.mockResolvedValueOnce({ role: 'manager' })
			.mockResolvedValueOnce({ role: 'manager' });

		await expect(ctx.service.canModerateRoomMember({ id: 'manager' } as never, { id: 'room', ownerId: 'owner' } as never, 'target-manager')).resolves.toBe(false);
	});

	test('room manager cannot moderate the room owner', async () => {
		const ctx = createService(1);
		ctx.chatRoomMembershipsRepository.findOne
			.mockResolvedValueOnce({ role: 'manager' });
		ctx.roleService.isModerator
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(false);

		await expect(ctx.service.canModerateRoomMember({ id: 'manager' } as never, { id: 'room', ownerId: 'owner' } as never, 'owner')).resolves.toBe(false);
	});

	test('room manager cannot moderate a site moderator', async () => {
		const ctx = createService(1);
		ctx.chatRoomMembershipsRepository.findOne
			.mockResolvedValueOnce({ role: 'manager' });
		ctx.roleService.isModerator
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true);

		await expect(ctx.service.canModerateRoomMember({ id: 'manager' } as never, { id: 'room', ownerId: 'owner' } as never, 'moderator')).resolves.toBe(false);
	});

	test('room owner can moderate room managers', async () => {
		const ctx = createService(1);
		ctx.roleService.isModerator.mockResolvedValueOnce(false);

		await expect(ctx.service.canModerateRoomMember({ id: 'owner' } as never, { id: 'room', ownerId: 'owner' } as never, 'target-manager')).resolves.toBe(true);
	});

	test('site moderator can moderate room managers', async () => {
		const ctx = createService(1);
		ctx.chatRoomMembershipsRepository.findOne
			.mockResolvedValueOnce(null);
		ctx.roleService.isModerator
			.mockResolvedValueOnce(true)
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true);

		await expect(ctx.service.canModerateRoomMember({ id: 'moderator' } as never, { id: 'room', ownerId: 'owner' } as never, 'target-manager')).resolves.toBe(true);
	});

	test('room manager cannot moderate users who are not current members', async () => {
		const ctx = createService(1);
		ctx.chatRoomMembershipsRepository.findOne
			.mockResolvedValueOnce({ role: 'manager' })
			.mockResolvedValueOnce(null);

		await expect(ctx.service.canModerateRoomMember({ id: 'manager' } as never, { id: 'room', ownerId: 'owner' } as never, 'stranger')).resolves.toBe(false);
	});

	test('room sends cache resolved mention ids for later packing', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		ctx.mfmService.extractMentions.mockReturnValueOnce([{ username: 'member2', host: null }]);
		ctx.remoteUserResolveService.resolveUser.mockResolvedValueOnce({ id: 'member-2', host: null });
		ctx.chatRoomMembershipsRepository.find.mockResolvedValueOnce([{ userId: 'member-2' }]);

		await ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			text: '@member2 hello',
		});

		expect(ctx.redisPipeline.set).toHaveBeenCalledWith(chatMessageMentionCacheKey('message-id'), JSON.stringify(['member-2']), 'EX', CHAT_MESSAGE_MENTION_CACHE_TTL);
		expect(ctx.chatEntityService.packMessageLiteForRoom).toHaveBeenCalledWith(expect.objectContaining({ id: 'message-id' }), { mentionedUserIds: ['member-2'] });
	});

	test('room sends cache empty mention results when mention text resolves to no room members', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		ctx.mfmService.extractMentions.mockReturnValueOnce([{ username: 'unknown', host: null }]);
		ctx.remoteUserResolveService.resolveUser.mockResolvedValueOnce(null);

		await ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			text: '@unknown hello',
		});

		expect(ctx.redisPipeline.set).toHaveBeenCalledWith(chatMessageMentionCacheKey('message-id'), JSON.stringify([]), 'EX', CHAT_MESSAGE_MENTION_CACHE_TTL);
		expect(ctx.redisPipeline.sadd).not.toHaveBeenCalled();
		expect(ctx.timeService.startTimer).not.toHaveBeenCalled();
		expect(ctx.chatEntityService.packMessageLiteForRoom).toHaveBeenCalledWith(expect.objectContaining({ id: 'message-id' }), { mentionedUserIds: [] });
	});

	test('concurrent sends share one uncached member count query', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		let resolveCount: (value: number) => void = () => {};
		const countStarted = new Promise<void>(resolve => {
			ctx.chatRoomMembershipsRepository.countBy.mockImplementationOnce(() => {
				resolve();
				return new Promise<number>(countResolve => {
					resolveCount = countResolve;
				});
			});
		});

		const sends = Promise.all([
			ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, { text: 'a' }),
			ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, { text: 'b' }),
			ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, { text: 'c' }),
		]);

		await countStarted;
		resolveCount!(LARGE_CHAT_ROOM_MEMBER_THRESHOLD);
		await sends;

		expect(ctx.chatRoomMembershipsRepository.countBy).toHaveBeenCalledTimes(1);
		expect(ctx.chatRoomMembershipsRepository.findBy).not.toHaveBeenCalled();
		expect(ctx.redisClient.set).toHaveBeenCalledWith('chatRoomMembersCount:room', String(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1), 'EX', 60);
		expect(ctx.globalEventService.publishChatRoomStreamBatched).toHaveBeenCalledTimes(3);
	});

	test('large room burst sends do not reintroduce member fanout', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		const burstSize = 10000;

		await Promise.all(Array.from({ length: burstSize }, (_, i) => (
			ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
				text: `hello ${i}`,
			})
		)));

		expect(ctx.chatRoomMembershipsRepository.countBy).toHaveBeenCalledTimes(1);
		expect(ctx.chatRoomMembershipsRepository.findBy).not.toHaveBeenCalled();
		expect(ctx.redisClient.pipeline).toHaveBeenCalledTimes(burstSize);
		expect(ctx.redisPipeline.sadd).not.toHaveBeenCalled();
		expect(ctx.timeService.startTimer).not.toHaveBeenCalled();
		expect(ctx.globalEventService.publishChatRoomStreamBatched).toHaveBeenCalledTimes(burstSize);
	});

	test('non-members cannot send without scanning all members', async () => {
		const ctx = createService(10000, false);

		await expect(ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			text: 'hello',
		})).rejects.toThrow('you are not a member of the room');

		expect(ctx.chatRoomMembershipsRepository.findBy).not.toHaveBeenCalled();
		expect(ctx.globalEventService.publishChatRoomStream).not.toHaveBeenCalled();
	});

	test('joining and leaving a room invalidates cached member count', async () => {
		const ctx = createService(2);

		await ctx.service.joinToRoom('sender', 'room');
		await ctx.service.leaveRoom('sender', 'room');

		expect(ctx.appLockService.getChatRoomJoinLock).toHaveBeenCalledWith('room');
		expect(ctx.unlockChatRoomJoin).toHaveBeenCalledTimes(1);
		expect(ctx.redisClient.del).toHaveBeenCalledWith('chatRoomMembersCount:room');
		expect(ctx.redisClient.del).toHaveBeenCalledTimes(2);
	});

	test('room managers can explicitly join invite-only or closed rooms they can already view', async () => {
		const ctx = createService(2);
		ctx.roleService.isModerator.mockResolvedValue(true);
		ctx.chatRoomsRepository.findOneByOrFail.mockResolvedValue({
			id: 'room',
			ownerId: 'owner',
			joinMode: 'closed',
			memberLimitOverride: null,
		});

		await ctx.service.joinToRoom('moderator', 'room');

		expect(ctx.roleService.isModerator).toHaveBeenCalledWith({ id: 'moderator' });
		expect(ctx.chatRoomInvitationsRepository.findOneBy).toHaveBeenCalledWith({ roomId: 'room', userId: 'moderator' });
		expect(ctx.chatRoomMembershipsRepository.insertOne).toHaveBeenCalledWith(expect.objectContaining({
			roomId: 'room',
			userId: 'moderator',
		}));
	});

	test('non-managers still cannot join invite-only or closed rooms without an invitation', async () => {
		const inviteOnly = createService(2);
		inviteOnly.chatRoomsRepository.findOneByOrFail.mockResolvedValue({
			id: 'room',
			ownerId: 'owner',
			joinMode: 'inviteOnly',
			memberLimitOverride: null,
		});

		await expect(inviteOnly.service.joinToRoom('sender', 'room')).rejects.toThrow('invitation required');
		expect(inviteOnly.chatRoomMembershipsRepository.insertOne).not.toHaveBeenCalled();

		const closed = createService(2);
		closed.chatRoomsRepository.findOneByOrFail.mockResolvedValue({
			id: 'room',
			ownerId: 'owner',
			joinMode: 'closed',
			memberLimitOverride: null,
		});

		await expect(closed.service.joinToRoom('sender', 'room')).rejects.toThrow('joining disabled');
		expect(closed.chatRoomMembershipsRepository.insertOne).not.toHaveBeenCalled();
	});

	test('room managers cannot bypass duplicate membership or room capacity checks when joining', async () => {
		const duplicate = createService(2);
		duplicate.roleService.isModerator.mockResolvedValue(true);
		duplicate.chatRoomsRepository.findOneByOrFail.mockResolvedValue({
			id: 'room',
			ownerId: 'owner',
			joinMode: 'closed',
			memberLimitOverride: null,
		});
		duplicate.chatRoomMembershipsRepository.findOneBy.mockResolvedValueOnce({ userId: 'moderator', isMuted: false });

		await expect(duplicate.service.joinToRoom('moderator', 'room')).rejects.toThrow('already member');
		expect(duplicate.chatRoomMembershipsRepository.insertOne).not.toHaveBeenCalled();
		expect(duplicate.unlockChatRoomJoin).toHaveBeenCalledTimes(1);

		const full = createService(10000);
		full.roleService.isModerator.mockResolvedValue(true);
		full.chatRoomsRepository.findOneByOrFail.mockResolvedValue({
			id: 'room',
			ownerId: 'owner',
			joinMode: 'closed',
			memberLimitOverride: null,
		});

		await expect(full.service.joinToRoom('moderator', 'room')).rejects.toThrow('room is full');
		expect(full.chatRoomMembershipsRepository.insertOne).not.toHaveBeenCalled();
		expect(full.unlockChatRoomJoin).toHaveBeenCalledTimes(1);
	});

	test('room join lock is released when the room is full', async () => {
		const ctx = createService(10000);

		await expect(ctx.service.joinToRoom('sender', 'room')).rejects.toThrow('room is full');

		expect(ctx.appLockService.getChatRoomJoinLock).toHaveBeenCalledWith('room');
		expect(ctx.chatRoomMembershipsRepository.insertOne).not.toHaveBeenCalled();
		expect(ctx.unlockChatRoomJoin).toHaveBeenCalledTimes(1);
	});

	test('large room read state uses room-level latest and read watermarks', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);

		await ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			text: 'hello',
		});

		await expect(ctx.service.getRoomReadStateMap('reader', ['room'])).resolves.toEqual({ room: false });

		await ctx.service.readRoomChatMessage('reader', 'room');

		expect(ctx.redisClient.eval).toHaveBeenCalledWith(expect.any(String), 5,
			'newRoomChatMessageExists:reader:room',
			'newRoomChatMentionExists:reader:room',
			'newChatMessagesExists:reader',
			'latestRoomChatMessage:room',
			'readRoomChatMessage:reader:room',
			'room:room',
			60 * 60 * 24 * 30,
		);
		await expect(ctx.service.getRoomReadStateMap('reader', ['room'])).resolves.toEqual({ room: true });
	});

	test('history read state maps use batched Redis reads', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		ctx.redisState.set('newUserChatMessageExists:reader:user-2', 'message-1');
		ctx.redisState.set('latestRoomChatMessage:room-1', 'message-2');
		ctx.redisState.set('readRoomChatMessage:reader:room-1', 'message-2');
		ctx.redisState.set('latestRoomChatMessage:room-2', 'message-3');
		ctx.redisState.set('newRoomChatMentionExists:reader:room-2', 'message-3');

		await expect(ctx.service.getUserReadStateMap('reader', ['user-1', 'user-2'])).resolves.toEqual({
			'user-1': true,
			'user-2': false,
		});
		await expect(ctx.service.getRoomReadStateMap('reader', ['room-1', 'room-2'])).resolves.toEqual({
			'room-1': true,
			'room-2': false,
		});
		await expect(ctx.service.getRoomMentionStateMap('reader', ['room-1', 'room-2'])).resolves.toEqual({
			'room-1': false,
			'room-2': true,
		});

		expect(ctx.redisClient.mget).toHaveBeenCalledWith(
			'newUserChatMessageExists:reader:user-1',
			'newUserChatMessageExists:reader:user-2',
		);
		expect(ctx.redisClient.mget).toHaveBeenCalledWith(
			'newRoomChatMessageExists:reader:room-1',
			'latestRoomChatMessage:room-1',
			'readRoomChatMessage:reader:room-1',
			'newRoomChatMessageExists:reader:room-2',
			'latestRoomChatMessage:room-2',
			'readRoomChatMessage:reader:room-2',
		);
		expect(ctx.redisClient.mget).toHaveBeenCalledWith(
			'newRoomChatMentionExists:reader:room-1',
			'newRoomChatMentionExists:reader:room-2',
		);
	});

	test('message search applies an explicit sender filter inside the room scope', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);

		await ctx.service.searchMessages('reader', ' ３ ', 20, {
			roomId: 'room',
			fromUserId: 'sender',
		});

		expect(ctx.chatMessagesQueryBuilder.where).toHaveBeenCalledWith('message.toRoomId = :roomId', { roomId: 'room' });
		expect(ctx.chatMessagesQueryBuilder.andWhere).toHaveBeenCalledWith('message.fromUserId = :fromUserId', { fromUserId: 'sender' });
		expect(ctx.chatMessagesQueryBuilder.andWhere).toHaveBeenCalledWith('message.text IS NOT NULL');
		expect(ctx.chatMessagesQueryBuilder.andWhere).toHaveBeenCalledWith('LOWER(message.text) LIKE :q', { q: '%３%' });
	});

	test('reactions use query parameters instead of interpolating records into SQL', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);

		await ctx.service.react('message-id', 'sender', '👍');

		expect(ctx.chatMessagesQueryBuilder.set).toHaveBeenCalledWith({
			reactions: expect.any(Function),
		});
		expect((ctx.chatMessagesQueryBuilder.set.mock.calls[0]?.[0] as any).reactions()).toBe('array_append("reactions", :reactionRecord)');
		expect(ctx.chatMessagesQueryBuilder.andWhere).toHaveBeenCalledWith('NOT (:reactionRecord = ANY("reactions"))');
		expect(ctx.chatMessagesQueryBuilder.andWhere).toHaveBeenCalledWith('cardinality("reactions") < :maxReactions');
		expect(ctx.chatMessagesQueryBuilder.setParameter).toHaveBeenCalledWith('reactionRecord', 'sender/👍');
		expect(ctx.chatMessagesQueryBuilder.setParameter).toHaveBeenCalledWith('maxReactions', 100);
	});

	test('duplicate reactions do not publish chat events', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		ctx.chatMessagesQueryBuilder.execute.mockResolvedValueOnce({ affected: 0 });

		await expect(ctx.service.react('message-id', 'sender', '👍')).rejects.toThrow('reaction not changed');

		expect(ctx.globalEventService.publishChatUserStream).not.toHaveBeenCalled();
		expect(ctx.globalEventService.publishChatRoomStream).not.toHaveBeenCalled();
	});

	test('non-participants cannot unreact private chat messages', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);

		await expect(ctx.service.unreact('message-id', 'intruder', '👍')).rejects.toThrow('cannot react to others message');

		expect(ctx.chatMessagesQueryBuilder.update).not.toHaveBeenCalled();
		expect(ctx.globalEventService.publishChatRoomStream).not.toHaveBeenCalled();
	});

	test('unreact uses query parameters for authorized participants', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);

		await ctx.service.unreact('message-id', 'sender', '👍');

		expect((ctx.chatMessagesQueryBuilder.set.mock.calls[0]?.[0] as any).reactions()).toBe('array_remove("reactions", :reactionRecord)');
		expect(ctx.chatMessagesQueryBuilder.andWhere).toHaveBeenCalledWith(':reactionRecord = ANY("reactions")');
		expect(ctx.chatMessagesQueryBuilder.setParameter).toHaveBeenCalledWith('reactionRecord', 'sender/👍');
	});

	test('missing reactions do not publish unreact events', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		ctx.chatMessagesQueryBuilder.execute.mockResolvedValueOnce({ affected: 0 });

		await ctx.service.unreact('message-id', 'sender', '👍');

		expect(ctx.globalEventService.publishChatUserStream).not.toHaveBeenCalled();
		expect(ctx.globalEventService.publishChatRoomStream).not.toHaveBeenCalled();
	});

	test('message context returns a room window around the target message', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		const beforeRows = [
			{ id: 'm09', toRoomId: 'room' },
			{ id: 'm08', toRoomId: 'room' },
			{ id: 'm07', toRoomId: 'room' },
		];
		const afterRows = [
			{ id: 'm11', toRoomId: 'room' },
			{ id: 'm12', toRoomId: 'room' },
			{ id: 'm13', toRoomId: 'room' },
		];
		const beforeQuery = createMessageQueryBuilder(beforeRows);
		const afterQuery = createMessageQueryBuilder(afterRows);
		ctx.chatMessagesRepository.createQueryBuilder
			.mockReturnValueOnce(beforeQuery)
			.mockReturnValueOnce(afterQuery);

		const target = { id: 'm10', fromUserId: 'sender', toUserId: null, toRoomId: 'room' };
		const context = await ctx.service.messageContext(target as never, 2, 2);

		expect(context).toEqual({
			before: beforeRows.slice(0, 2),
			target,
			after: [afterRows[1], afterRows[0]],
			hasMoreBefore: true,
			hasMoreAfter: true,
		});
		expect(beforeQuery.andWhere).toHaveBeenCalledWith('message.toRoomId = :roomId', { roomId: 'room' });
		expect(beforeQuery.andWhere).toHaveBeenCalledWith('message.id < :messageId', { messageId: 'm10' });
		expect(beforeQuery.orderBy).toHaveBeenCalledWith('message.id', 'DESC');
		expect(beforeQuery.take).toHaveBeenCalledWith(3);
		expect(afterQuery.andWhere).toHaveBeenCalledWith('message.id > :messageId', { messageId: 'm10' });
		expect(afterQuery.orderBy).toHaveBeenCalledWith('message.id', 'ASC');
	});

	test('message context scopes user chats to both participants', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		const beforeQuery = createMessageQueryBuilder([]);
		const afterQuery = createMessageQueryBuilder([]);
		ctx.chatMessagesRepository.createQueryBuilder
			.mockReturnValueOnce(beforeQuery)
			.mockReturnValueOnce(afterQuery);

		await ctx.service.messageContext({
			id: 'm10',
			fromUserId: 'sender',
			toUserId: 'receiver',
			toRoomId: null,
		} as never, 10, 10);

		expect(beforeQuery.setParameter).toHaveBeenCalledWith('fromUserId', 'sender');
		expect(beforeQuery.setParameter).toHaveBeenCalledWith('toUserId', 'receiver');
		expect(afterQuery.setParameter).toHaveBeenCalledWith('fromUserId', 'sender');
		expect(afterQuery.setParameter).toHaveBeenCalledWith('toUserId', 'receiver');
	});

	test('silenced rooms reject messages from non-owner members', async () => {
		const ctx = createService(10);

		// isSilenced は findRoomMessageTargetBy のキャッシュ値(=toRoom)から判定される
		await expect(ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner', isSilenced: true } as never, {
			text: 'hello',
		})).rejects.toThrow('room is silenced');

		expect(ctx.chatMessagesRepository.insertOne).not.toHaveBeenCalled();
		expect(ctx.globalEventService.publishChatRoomStream).not.toHaveBeenCalled();
	});

	test('silenced rooms still accept messages from the owner', async () => {
		const ctx = createService(10);

		await ctx.service.createMessageToRoom({ id: 'owner', host: null }, { id: 'room', ownerId: 'owner', isSilenced: true } as never, {
			text: 'hello',
		});

		// オーナーはミュート/サイレンスのためのmembership取得を行わない
		expect(ctx.chatRoomMembershipsRepository.findOne).not.toHaveBeenCalled();
		expect(ctx.chatMessagesRepository.insertOne).toHaveBeenCalled();
	});

	test('muted members cannot send messages until the mute expires', async () => {
		const ctx = createService(10);
		ctx.chatRoomMembershipsRepository.findOne.mockResolvedValue({ userId: 'sender', isMuted: false, mutedUntil: new Date('2100-01-01T00:00:00.000Z') });

		await expect(ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			text: 'hello',
		})).rejects.toThrow('you are muted in this room');

		expect(ctx.chatMessagesRepository.insertOne).not.toHaveBeenCalled();
	});

	test('expired member mutes no longer block messages', async () => {
		const ctx = createService(10);
		ctx.chatRoomMembershipsRepository.findOne.mockResolvedValue({ userId: 'sender', isMuted: false, mutedUntil: new Date('1970-01-01T00:00:00.000Z') });

		await ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			text: 'hello',
		});

		expect(ctx.chatMessagesRepository.insertOne).toHaveBeenCalled();
	});

	test('kicking a member removes the membership and publishes memberKicked', async () => {
		const ctx = createService(10);
		ctx.chatRoomMembershipsRepository.findOneBy.mockResolvedValueOnce({ id: 'membership-id', roomId: 'room', userId: 'target' });

		await ctx.service.kickFromRoom({ id: 'room', ownerId: 'owner' } as never, 'target', { ban: false });

		expect(ctx.chatRoomMembershipsRepository.delete).toHaveBeenCalledWith('membership-id');
		expect(ctx.chatRoomBanningsRepository.createQueryBuilder).not.toHaveBeenCalled();
		expect(ctx.globalEventService.publishChatRoomStream).toHaveBeenCalledWith('room', 'memberKicked', {
			roomId: 'room',
			userId: 'target',
			banned: false,
		});
	});

	test('kicking with ban inserts a banning record', async () => {
		const ctx = createService(10);
		ctx.chatRoomMembershipsRepository.findOneBy.mockResolvedValueOnce({ id: 'membership-id', roomId: 'room', userId: 'target' });

		await ctx.service.kickFromRoom({ id: 'room', ownerId: 'owner' } as never, 'target', { ban: true });

		expect(ctx.chatRoomBanningsRepository.createQueryBuilder).toHaveBeenCalled();
		expect(ctx.globalEventService.publishChatRoomStream).toHaveBeenCalledWith('room', 'memberKicked', {
			roomId: 'room',
			userId: 'target',
			banned: true,
		});
	});

	test('the room owner cannot be kicked', async () => {
		const ctx = createService(10);

		await expect(ctx.service.kickFromRoom({ id: 'room', ownerId: 'owner' } as never, 'owner', {}))
			.rejects.toThrow('cannot kick the owner');
	});

	test('banned users cannot join the room', async () => {
		const ctx = createService(10);
		ctx.chatRoomBanningsRepository.existsBy.mockResolvedValueOnce(true);

		await expect(ctx.service.joinToRoom('banned-user', 'room')).rejects.toThrow('you are banned');
		expect(ctx.chatRoomMembershipsRepository.insertOne).not.toHaveBeenCalled();
	});

	test('banned users cannot be invited', async () => {
		const ctx = createService(10);
		ctx.chatRoomBanningsRepository.existsBy.mockResolvedValueOnce(true);
		ctx.chatRoomMembershipsRepository.findOneBy.mockResolvedValueOnce(null);

		await expect(ctx.service.createRoomInvitation({ id: 'owner' } as never, 'room', 'banned-user')).rejects.toThrow('user is banned');
	});

	test('blocked users cannot be invited', async () => {
		const ctx = createService(10);
		ctx.chatRoomMembershipsRepository.findOneBy.mockResolvedValueOnce(null);
		ctx.userBlockingService.checkBlocked.mockResolvedValueOnce(true);

		await expect(ctx.service.createRoomInvitation({ id: 'owner' } as never, 'room', 'blocked-user')).rejects.toThrow('blocked');
		expect(ctx.userBlockingService.checkBlocked).toHaveBeenCalledWith('blocked-user', 'owner');
		expect(ctx.chatRoomInvitationsRepository.insertOne).not.toHaveBeenCalled();
		expect(ctx.notificationService.createNotification).not.toHaveBeenCalled();
	});

	test('muting a member updates the membership and publishes memberMuted', async () => {
		const ctx = createService(10);
		ctx.chatRoomMembershipsRepository.findOneBy.mockResolvedValueOnce({ id: 'membership-id', roomId: 'room', userId: 'target' });
		const mutedUntil = new Date('2100-01-01T00:00:00.000Z');

		await ctx.service.muteRoomMember({ id: 'room', ownerId: 'owner' } as never, 'target', mutedUntil);

		expect(ctx.chatRoomMembershipsRepository.update).toHaveBeenCalledWith('membership-id', { mutedUntil });
		expect(ctx.globalEventService.publishChatRoomStream).toHaveBeenCalledWith('room', 'memberMuted', {
			roomId: 'room',
			userId: 'target',
			mutedUntil: mutedUntil.toISOString(),
		});
	});

	test('the room owner cannot be muted', async () => {
		const ctx = createService(10);

		await expect(ctx.service.muteRoomMember({ id: 'room', ownerId: 'owner' } as never, 'owner', null))
			.rejects.toThrow('cannot mute the owner');
	});
});
