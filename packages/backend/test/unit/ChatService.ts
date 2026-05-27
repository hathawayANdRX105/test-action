/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { ChatService, LARGE_CHAT_ROOM_MEMBER_THRESHOLD } from '@/core/ChatService.js';

describe('ChatService large room fast path', () => {
	function createService(memberCount: number, senderIsMember = true) {
		const redisState = new Map<string, string>();
		const redisPipeline = {
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
		const redisClient = {
			pipeline: jest.fn(() => redisPipeline),
			get: jest.fn(async (key: string) => redisState.get(key) ?? null),
			set: jest.fn(async (key: string, value: string) => {
				redisState.set(key, value);
				return 'OK';
			}),
			del: jest.fn(async (key: string) => redisState.delete(key) ? 1 : 0),
			scard: jest.fn(async () => 0),
		};
		const chatRoomMembershipsRepository = {
			countBy: jest.fn(async () => memberCount - 1),
			findOne: jest.fn(async () => senderIsMember ? { userId: 'sender', isMuted: false } : null),
			findOneBy: jest.fn(async () => null),
			findOneByOrFail: jest.fn(async () => ({ id: 'membership-id', roomId: 'room', userId: 'sender' })),
			findBy: jest.fn(async () => []),
			insertOne: jest.fn(async (membership) => membership),
			delete: jest.fn(async () => ({ affected: 1 })),
		};
		const chatMessagesQueryBuilder = {
			update: jest.fn(function () { return this; }),
			set: jest.fn(function () { return this; }),
			where: jest.fn(function () { return this; }),
			orWhere: jest.fn(function () { return this; }),
			andWhere: jest.fn(function () { return this; }),
			leftJoinAndSelect: jest.fn(function () { return this; }),
			orderBy: jest.fn(function () { return this; }),
			take: jest.fn(function () { return this; }),
			setParameter: jest.fn(function () { return this; }),
			execute: jest.fn(async () => ({ affected: 1 })),
			getMany: jest.fn(async () => []),
		};
		const chatMessagesRepository = {
			insertOne: jest.fn(async (message) => ({ ...message, reactions: [] })),
			findOneByOrFail: jest.fn(async () => ({
				id: 'message-id',
				fromUserId: 'other',
				toUserId: 'sender',
				toRoomId: null,
				reactions: [],
			})),
			createQueryBuilder: jest.fn(() => chatMessagesQueryBuilder),
		};
		const userEntityService = {
			pack: jest.fn(async (userId) => ({ id: userId })),
		};
		const chatEntityService = {
			packMessageLiteForRoom: jest.fn(async (message) => ({
				id: message.id,
				createdAt: new Date(0).toISOString(),
				fromUserId: message.fromUserId,
				fromUser: { id: message.fromUserId },
				toRoomId: message.toRoomId,
				text: message.text,
				fileId: message.fileId,
				file: null,
				reactions: [],
			})),
		};
		const globalEventService = {
			publishChatUserStream: jest.fn(),
			publishChatRoomStream: jest.fn(),
			publishMainStream: jest.fn(),
		};
		const pushNotificationService = {
			pushNotification: jest.fn(),
		};
		const timeService = {
			startTimer: jest.fn(),
		};
		const idService = {
			gen: jest.fn(() => 'message-id'),
		};
		const chatRoomsRepository = {
			findOneByOrFail: jest.fn(async () => ({
				id: 'room',
				ownerId: 'owner',
				joinMode: 'open',
				memberLimitOverride: null,
			})),
		};
		const chatRoomInvitationsRepository = {
			findOneBy: jest.fn(async () => null),
			delete: jest.fn(async () => ({ affected: 1 })),
		};
		const customEmojiService = {
			emojisByKeyCache: {
				fetchMaybe: jest.fn(async () => null),
			},
		};
		const unlockChatRoomJoin = jest.fn(async () => {});
		const appLockService = {
			getChatRoomJoinLock: jest.fn(async () => unlockChatRoomJoin),
		};
		const service = new ChatService(
			{} as never,
			redisClient as never,
			{ chatRoomDefaultMemberLimit: 10000 } as never,
			{} as never,
			chatMessagesRepository as never,
			{} as never,
			chatRoomsRepository as never,
			chatRoomInvitationsRepository as never,
			chatRoomMembershipsRepository as never,
			{} as never,
			userEntityService as never,
			chatEntityService as never,
			idService as never,
			globalEventService as never,
			{} as never,
			{} as never,
			pushNotificationService as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
			customEmojiService as never,
			{} as never,
			timeService as never,
			{} as never,
			appLockService as never,
		);

		return {
			service,
			redisState,
			redisClient,
			redisPipeline,
			chatMessagesRepository,
			chatMessagesQueryBuilder,
			chatRoomMembershipsRepository,
			chatRoomsRepository,
			appLockService,
			unlockChatRoomJoin,
			globalEventService,
			pushNotificationService,
			timeService,
		};
	}

	function createMessageQueryBuilder(rows: unknown[]) {
		return {
			where: jest.fn(function () { return this; }),
			orWhere: jest.fn(function () { return this; }),
			andWhere: jest.fn(function () { return this; }),
			leftJoinAndSelect: jest.fn(function () { return this; }),
			orderBy: jest.fn(function () { return this; }),
			take: jest.fn(function () { return this; }),
			setParameter: jest.fn(function () { return this; }),
			getMany: jest.fn(async () => rows),
		};
	}

	test('large rooms skip per-member unread and push fanout', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);

		await ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			text: 'hello',
		});

		expect(ctx.chatRoomMembershipsRepository.findBy).not.toHaveBeenCalled();
		expect(ctx.redisClient.pipeline).not.toHaveBeenCalled();
		expect(ctx.chatRoomMembershipsRepository.countBy).toHaveBeenCalledTimes(1);
		expect(ctx.redisClient.get).toHaveBeenCalledWith('chatRoomMembersCount:room');
		expect(ctx.redisClient.set).toHaveBeenCalledWith('chatRoomMembersCount:room', String(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1), 'EX', 60);
		expect(ctx.redisClient.set).toHaveBeenCalledWith('latestRoomChatMessage:room', 'message-id', 'EX', 60 * 60 * 24 * 30);
		expect(ctx.timeService.startTimer).not.toHaveBeenCalled();
		expect(ctx.pushNotificationService.pushNotification).not.toHaveBeenCalled();
		expect(ctx.globalEventService.publishChatRoomStream).toHaveBeenCalledWith('room', 'message', expect.objectContaining({ id: 'message-id' }));
	});

	test('small rooms keep existing unread fanout path', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD);

		await ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			text: 'hello',
		});

		expect(ctx.chatRoomMembershipsRepository.findBy).toHaveBeenCalledWith({ roomId: 'room' });
		expect(ctx.redisClient.pipeline).toHaveBeenCalled();
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

	test('message fanout reuses cached room member count', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		ctx.redisClient.get.mockResolvedValueOnce(String(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1));

		await ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
			text: 'hello',
		});

		expect(ctx.chatRoomMembershipsRepository.countBy).not.toHaveBeenCalled();
		expect(ctx.redisClient.set).not.toHaveBeenCalledWith('chatRoomMembersCount:room', expect.anything(), 'EX', 60);
		expect(ctx.redisClient.set).toHaveBeenCalledWith('latestRoomChatMessage:room', 'message-id', 'EX', 60 * 60 * 24 * 30);
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
		expect(ctx.globalEventService.publishChatRoomStream).toHaveBeenCalledTimes(3);
	});

	test('large room burst sends do not reintroduce member fanout', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);
		const burstSize = 5000;

		await Promise.all(Array.from({ length: burstSize }, (_, i) => (
			ctx.service.createMessageToRoom({ id: 'sender', host: null }, { id: 'room', ownerId: 'owner' } as never, {
				text: `hello ${i}`,
			})
		)));

		expect(ctx.chatRoomMembershipsRepository.countBy).toHaveBeenCalledTimes(1);
		expect(ctx.chatRoomMembershipsRepository.findBy).not.toHaveBeenCalled();
		expect(ctx.redisClient.pipeline).not.toHaveBeenCalled();
		expect(ctx.timeService.startTimer).not.toHaveBeenCalled();
		expect(ctx.globalEventService.publishChatRoomStream).toHaveBeenCalledTimes(burstSize);
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

		expect(ctx.redisPipeline.set).toHaveBeenCalledWith('readRoomChatMessage:reader:room', 'message-id', 'EX', 60 * 60 * 24 * 30);
		await expect(ctx.service.getRoomReadStateMap('reader', ['room'])).resolves.toEqual({ room: true });
	});

	test('reactions use query parameters instead of interpolating records into SQL', async () => {
		const ctx = createService(LARGE_CHAT_ROOM_MEMBER_THRESHOLD + 1);

		await ctx.service.react('message-id', 'sender', '👍');

		expect(ctx.chatMessagesQueryBuilder.set).toHaveBeenCalledWith({
			reactions: expect.any(Function),
		});
		expect(ctx.chatMessagesQueryBuilder.set.mock.calls[0][0].reactions()).toBe('array_append("reactions", :reactionRecord)');
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

		expect(ctx.chatMessagesQueryBuilder.set.mock.calls[0][0].reactions()).toBe('array_remove("reactions", :reactionRecord)');
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
});
