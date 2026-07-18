/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';

describe('ChatEntityService', () => {
	function createService() {
		const redisState = new Map<string, string>();
		const redisClient: any = {
			get: jest.fn(async (key: string) => redisState.get(key) ?? null),
			mget: jest.fn(async (...keys: string[]) => keys.map(key => redisState.get(key) ?? null)),
			set: jest.fn(async (key: string, value: string) => {
				redisState.set(key, value);
				return 'OK';
			}),
			pipeline: jest.fn(() => {
				const commands: (() => void)[] = [];
				const pipeline = {
					set: jest.fn((key: string, value: string) => {
						commands.push(() => {
							redisState.set(key, value);
						});
						return pipeline;
					}),
					exec: jest.fn(async () => {
						commands.forEach(command => command());
						commands.length = 0;
						return [] as [Error | null, unknown][];
					}),
				};
				return pipeline;
			}),
		};
		const userEntityService: any = {
			pack: jest.fn(async (userOrId: any) => ({
				id: typeof userOrId === 'string' ? userOrId : userOrId.id,
			})),
			packMany: jest.fn(async (users: any[]) => users.map(userOrId => ({
				id: typeof userOrId === 'string' ? userOrId : userOrId.id,
			}))),
		};
		const driveFileEntityService: any = {
			getPublicUrl: jest.fn(() => 'https://example.test/proxy/avatar.webp?url=file'),
			pack: jest.fn(),
			packMany: jest.fn(async () => []),
		};
		const driveFilesRepository: any = {
			findBy: jest.fn(async () => []),
		};
		const chatRoomMembershipsQueryBuilder: any = {
			select: jest.fn(function (this: any) { return this; }),
			addSelect: jest.fn(function (this: any) { return this; }),
			where: jest.fn(function (this: any) { return this; }),
			groupBy: jest.fn(function (this: any) { return this; }),
			getRawMany: jest.fn(async () => []),
		};
		const chatRoomMembershipsRepository: any = {
			find: jest.fn(async () => []),
			findOneBy: jest.fn(async () => null),
			countBy: jest.fn(async () => 0),
			createQueryBuilder: jest.fn(() => chatRoomMembershipsQueryBuilder),
		};
		const chatRoomUserMutingsRepository: any = {
			existsBy: jest.fn(async () => false),
			findOneByOrFail: jest.fn(async () => ({
				id: 'room-user-muting-id',
				createdAt: new Date(0),
				roomId: 'room',
				muterId: 'me',
				muteeId: 'sender',
				mutee: { id: 'sender' },
			})),
		};
		const chatRoomsRepository: any = {
			find: jest.fn(async () => []),
			findOneByOrFail: jest.fn(),
			update: jest.fn(async () => ({ affected: 1 })),
		};
		const chatRoomUserSettingsRepository: any = {
			find: jest.fn(async () => []),
			findOneBy: jest.fn(async () => null),
		};
		const chatRoomBanningsRepository: any = {
			findOneByOrFail: jest.fn(),
		};
		const roleService: any = {
			isAdministrator: jest.fn(async () => false),
			isModerator: jest.fn(async () => false),
		};
		const idService: any = {
			parse: jest.fn(() => ({ date: new Date(0) })),
		};
		const mfmService: any = {
			extractMentions: jest.fn(() => [{ username: 'alice', host: null }]),
		};
		const remoteUserResolveService: any = {
			resolveUser: jest.fn(async () => ({ id: 'alice-id', host: null })),
		};
		const service = new ChatEntityService(
			{} as never,
			chatRoomsRepository as never,
			driveFilesRepository as never,
			{} as never,
			chatRoomMembershipsRepository as never,
			chatRoomUserSettingsRepository as never,
			chatRoomUserMutingsRepository as never,
			chatRoomBanningsRepository as never,
			{ chatRoomDefaultMemberLimit: 500 } as never,
			redisClient as never,
			userEntityService as never,
			driveFileEntityService as never,
			idService as never,
			roleService as never,
			mfmService as never,
			remoteUserResolveService as never,
		);

		const message: any = {
			id: 'message-id',
			text: '@alice hello',
			fromUserId: 'sender',
			fromUser: { id: 'sender' },
			toRoomId: 'room',
			fileId: null,
			replyId: null,
			quoteId: null,
			reactions: [],
		};

		return {
			service,
			redisState,
			redisClient,
			userEntityService,
			driveFileEntityService,
			driveFilesRepository,
			chatRoomsRepository,
			chatRoomMembershipsRepository,
			chatRoomMembershipsQueryBuilder,
			chatRoomUserSettingsRepository,
			chatRoomUserMutingsRepository,
			chatRoomBanningsRepository,
			roleService,
			mfmService,
			remoteUserResolveService,
			message,
		};
	}

	test('reuses cached mentioned users when packing room messages repeatedly', async () => {
		const ctx = createService();

		await ctx.service.packMessageLiteForRoom(ctx.message);
		await ctx.service.packMessageLiteForRoom(ctx.message);

		expect(ctx.mfmService.extractMentions).toHaveBeenCalledTimes(1);
		expect(ctx.remoteUserResolveService.resolveUser).toHaveBeenCalledTimes(1);
		expect(ctx.redisClient.get).toHaveBeenCalledTimes(2);
		expect(ctx.redisClient.set).toHaveBeenCalledWith('chatMessageMentionedUserIds:message-id', JSON.stringify(['alice-id']), 'EX', 60 * 60 * 24 * 30);
	});

	test('skips mention cache IO for messages without mention text', async () => {
		const ctx = createService();
		ctx.message.text = 'hello';

		const packed = await ctx.service.packMessageLiteForRoom(ctx.message);

		expect(packed.mentionedUserIds).toEqual([]);
		expect(ctx.redisClient.get).not.toHaveBeenCalled();
		expect(ctx.redisClient.set).not.toHaveBeenCalled();
		expect(ctx.mfmService.extractMentions).not.toHaveBeenCalled();
	});

	test('batch-packs room messages with one Redis cache read', async () => {
		const ctx = createService();
		ctx.redisState.set('chatMessageMentionedUserIds:cached-message', JSON.stringify(['cached-user']));
		const uncachedMessage = {
			...ctx.message,
			id: 'uncached-message',
		};
		const cachedMessage = {
			...ctx.message,
			id: 'cached-message',
		};

		const packed = await ctx.service.packMessagesLiteForRoom([uncachedMessage, cachedMessage]);

		expect(packed.map(message => message.mentionedUserIds)).toEqual([
			['alice-id'],
			['cached-user'],
		]);
		expect(ctx.redisClient.mget).toHaveBeenCalledTimes(1);
		expect(ctx.redisClient.mget).toHaveBeenCalledWith('chatMessageMentionedUserIds:uncached-message', 'chatMessageMentionedUserIds:cached-message');
		expect(ctx.redisClient.get).not.toHaveBeenCalled();
		expect(ctx.redisClient.pipeline).toHaveBeenCalledTimes(1);
		expect(ctx.mfmService.extractMentions).toHaveBeenCalledTimes(1);
		expect(ctx.remoteUserResolveService.resolveUser).toHaveBeenCalledTimes(1);
	});

	test('deduplicates room, owner, membership, and member-count work when packing rooms', async () => {
		const ctx = createService();
		ctx.chatRoomsRepository.find.mockResolvedValueOnce([{
			id: 'room-2',
			name: 'room 2',
			description: null,
			joinMode: 'open',
			ownerId: 'owner-2',
			owner: { id: 'owner-2' },
			memberLimitOverride: null,
			messageRetentionDays: null,
		}]);
		ctx.chatRoomMembershipsQueryBuilder.getRawMany.mockResolvedValueOnce([
			{ roomId: 'room-1', count: '2' },
			{ roomId: 'room-2', count: '4' },
		]);
		ctx.chatRoomMembershipsRepository.find.mockResolvedValueOnce([
			{ roomId: 'room-1', userId: 'me', isMuted: true },
		]);
		const room1 = {
			id: 'room-1',
			name: 'room 1',
			description: null,
			joinMode: 'open',
			ownerId: 'owner-1',
			owner: { id: 'owner-1' },
			memberLimitOverride: null,
			messageRetentionDays: null,
		};

		const packed = await ctx.service.packRooms([room1, room1, 'room-2', 'room-2'], { id: 'me' });

		expect(packed).toHaveLength(2);
		expect(packed.map(room => [room.id, room.memberCount, room.isMuted])).toEqual([
			['room-1', 3, true],
			['room-2', 5, false],
		]);
		expect(ctx.chatRoomsRepository.find).toHaveBeenCalledTimes(1);
		expect(ctx.userEntityService.packMany).toHaveBeenLastCalledWith([{ id: 'owner-1' }, { id: 'owner-2' }], { id: 'me' });
		expect(ctx.chatRoomMembershipsRepository.find).toHaveBeenCalledTimes(1);
		expect(ctx.chatRoomMembershipsRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
		expect(ctx.roleService.isAdministrator).toHaveBeenCalledTimes(1);
		expect(ctx.roleService.isModerator).toHaveBeenCalledTimes(1);
	});

	test('skips room packing for memberships without populated rooms', async () => {
		const ctx = createService();
		const memberships: any[] = [{
			id: 'membership-id',
			userId: 'member',
			user: { id: 'member' },
			roomId: 'room',
			role: 'member',
			mutedUntil: null,
		}];

		const [packed] = await ctx.service.packRoomMemberships(memberships, { id: 'me' }, {
			populateUser: true,
			populateRoom: false,
		});

		expect(packed).toMatchObject({
			userId: 'member',
			user: { id: 'member' },
			roomId: 'room',
		});
		expect(packed.room).toBeUndefined();
		expect(ctx.chatRoomMembershipsRepository.createQueryBuilder).not.toHaveBeenCalled();
	});

	test('packs owned rooms as manageable with retention settings visible', async () => {
		const ctx = createService();
		ctx.chatRoomMembershipsRepository.countBy.mockResolvedValueOnce(2);
		const room = {
			id: 'room-owned',
			name: 'owned room',
			description: null,
			joinMode: 'open',
			ownerId: 'me',
			owner: { id: 'me' },
			memberLimitOverride: null,
			messageRetentionDays: 30,
		};

		const packed = await ctx.service.packRoom(room, { id: 'me' });

		expect(packed.canManage).toBe(true);
		expect(packed.messageRetentionDays).toBe(30);
		expect(packed.isJoined).toBe(true);
	});

	test('coalesces concurrent member-count loads while packing the same room', async () => {
		const ctx = createService();
		let resolveCount: (count: number) => void = () => {};
		const countStarted = new Promise<void>(resolve => {
			ctx.chatRoomMembershipsRepository.countBy.mockImplementationOnce(() => {
				resolve();
				return new Promise<number>(resolveCount_ => {
					resolveCount = resolveCount_;
				});
			});
		});
		const room = {
			id: 'room-concurrent-count',
			name: 'concurrent count room',
			description: null,
			joinMode: 'open',
			ownerId: 'me',
			owner: { id: 'me' },
			memberLimitOverride: null,
			messageRetentionDays: null,
		};

		const packedRooms = Promise.all([
			ctx.service.packRoom(room, { id: 'me' }),
			ctx.service.packRoom(room, { id: 'me' }),
			ctx.service.packRoom(room, { id: 'me' }),
		]);

		await countStarted;
		expect(ctx.chatRoomMembershipsRepository.countBy).toHaveBeenCalledTimes(1);

		resolveCount(2);
		await expect(packedRooms).resolves.toEqual(expect.arrayContaining([
			expect.objectContaining({ memberCount: 3 }),
			expect.objectContaining({ memberCount: 3 }),
			expect.objectContaining({ memberCount: 3 }),
		]));
	});

	test('clears a failed member-count load so a later room pack retries', async () => {
		const ctx = createService();
		ctx.chatRoomMembershipsRepository.countBy
			.mockRejectedValueOnce(new Error('database unavailable'))
			.mockResolvedValueOnce(2);
		const room = {
			id: 'room-count-retry',
			name: 'retry count room',
			description: null,
			joinMode: 'open',
			ownerId: 'me',
			owner: { id: 'me' },
			memberLimitOverride: null,
			messageRetentionDays: null,
		};

		await expect(ctx.service.packRoom(room, { id: 'me' })).rejects.toThrow('database unavailable');
		await expect(ctx.service.packRoom(room, { id: 'me' })).resolves.toEqual(expect.objectContaining({ memberCount: 3 }));

		expect(ctx.chatRoomMembershipsRepository.countBy).toHaveBeenCalledTimes(2);
	});

	test('repairs missing room avatar URLs while packing a room', async () => {
		const ctx = createService();
		ctx.driveFilesRepository.findBy.mockResolvedValueOnce([{
			id: 'file-1',
			url: 'https://example.test/files/file-1',
			webpublicUrl: null,
			uri: null,
			userHost: null,
			isLink: false,
		}]);
		ctx.driveFileEntityService.getPublicUrl.mockReturnValueOnce('https://example.test/proxy/avatar.webp?url=file-1');
		const room = {
			id: 'room-avatar',
			name: 'avatar room',
			description: null,
			joinMode: 'open',
			ownerId: 'owner',
			owner: { id: 'owner' },
			avatarId: 'file-1',
			avatar: null,
			avatarUrl: null,
			memberLimitOverride: null,
			messageRetentionDays: null,
		};

		const packed = await ctx.service.packRoom(room, { id: 'me' });

		expect(packed.avatarUrl).toBe('https://example.test/proxy/avatar.webp?url=file-1');
		expect(ctx.driveFilesRepository.findBy).toHaveBeenCalledTimes(1);
		expect(ctx.driveFileEntityService.getPublicUrl).toHaveBeenCalledWith(expect.objectContaining({ id: 'file-1' }), 'avatar');
		expect(ctx.chatRoomsRepository.update).toHaveBeenCalledWith('room-avatar', {
			avatarUrl: 'https://example.test/proxy/avatar.webp?url=file-1',
		});
	});

	test('packs moderator rooms as manageable even without membership', async () => {
		const ctx = createService();
		ctx.roleService.isModerator.mockResolvedValueOnce(true);
		ctx.chatRoomMembershipsQueryBuilder.getRawMany.mockResolvedValueOnce([
			{ roomId: 'room-moderated', count: '3' },
		]);
		const room = {
			id: 'room-moderated',
			name: 'moderated room',
			description: null,
			joinMode: 'open',
			ownerId: 'owner',
			owner: { id: 'owner' },
			memberLimitOverride: null,
			messageRetentionDays: 14,
		};

		const [packed] = await ctx.service.packRooms([room], { id: 'moderator' });

		expect(packed.canManage).toBe(true);
		expect(packed.messageRetentionDays).toBe(14);
		expect(packed.isJoined).toBe(false);
		expect(ctx.chatRoomMembershipsRepository.find).toHaveBeenCalledWith({
			where: {
				roomId: expect.anything(),
				userId: 'moderator',
			},
		});
	});

	test('packs administrator rooms as manageable through moderator role', async () => {
		const ctx = createService();
		ctx.roleService.isAdministrator.mockResolvedValueOnce(true);
		ctx.roleService.isModerator.mockResolvedValueOnce(true);
		ctx.chatRoomMembershipsQueryBuilder.getRawMany.mockResolvedValueOnce([
			{ roomId: 'room-admin', count: '1' },
		]);
		const room = {
			id: 'room-admin',
			name: 'admin room',
			description: null,
			joinMode: 'open',
			ownerId: 'owner',
			owner: { id: 'owner' },
			memberLimitOverride: null,
			messageRetentionDays: 7,
		};

		const [packed] = await ctx.service.packRooms([room], { id: 'admin' });

		expect(packed.canManage).toBe(true);
		expect(packed.messageRetentionDays).toBe(7);
		expect(packed.isJoined).toBe(false);
	});
});
