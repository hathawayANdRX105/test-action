/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import ShowRoomEndpoint from '@/server/api/endpoints/chat/rooms/show.js';
import RoomMembersEndpoint from '@/server/api/endpoints/chat/rooms/members.js';
import UpdateMemberRoleEndpoint from '@/server/api/endpoints/chat/rooms/members/update-role.js';
import DeleteAllMessagesEndpoint, { meta as deleteAllMessagesMeta, paramDef as deleteAllMessagesParamDef } from '@/server/api/endpoints/chat/rooms/manage/delete-all-messages.js';
import DeleteUserMessagesEndpoint, { meta as deleteUserMessagesMeta } from '@/server/api/endpoints/chat/rooms/manage/delete-user-messages.js';

describe('chat room manage endpoints', () => {
	const me = { id: 'me' } as never;
	const room = { id: 'room', ownerId: 'owner' } as never;

	function createDeleteAllEndpoint(options?: {
		canManage?: boolean;
		passwordMatches?: boolean;
	}) {
		const chatService: any = {
			checkChatAvailability: jest.fn(async () => undefined),
			findRoomById: jest.fn(async () => room),
			hasPermissionToManageRoomRoles: jest.fn(async () => options?.canManage ?? true),
			deleteAllRoomMessages: jest.fn(async () => undefined),
		};
		const userAuthService: any = {
			checkPassword: jest.fn(async () => options?.passwordMatches ?? true),
		};
		const cacheService: any = {
			userProfileCache: {
				fetch: jest.fn(async () => ({ userId: 'me' })),
			},
		};

		return {
			endpoint: new DeleteAllMessagesEndpoint(chatService, userAuthService, cacheService),
			chatService,
			userAuthService,
			cacheService,
		};
	}

	function createDeleteUserEndpoint(options?: {
		canManage?: boolean;
	}) {
		const usersRepository: any = {
			findOneBy: jest.fn(async () => ({ id: 'target' })),
		};
		const chatService: any = {
			checkChatAvailability: jest.fn(async () => undefined),
			findRoomById: jest.fn(async () => room),
			canDeleteRoomMessagesByUser: jest.fn(async () => options?.canManage ?? true),
			deleteRoomMessagesByUser: jest.fn(async () => ['message-1', 'message-2']),
		};

		return {
			endpoint: new DeleteUserMessagesEndpoint(usersRepository, chatService),
			usersRepository,
			chatService,
		};
	}

	function createRoomMembersEndpoint(options?: {
		isMember?: boolean;
		canManage?: boolean;
	}) {
		const memberships = [{ id: 'membership-1', roomId: 'room', userId: 'target' }];
		const chatService: any = {
			checkChatAvailability: jest.fn(async () => undefined),
			findRoomById: jest.fn(async () => room),
			isRoomMember: jest.fn(async () => options?.isMember ?? false),
			hasPermissionToManageRoom: jest.fn(async () => options?.canManage ?? true),
			getRoomMembershipsWithPagination: jest.fn(async () => memberships),
		};
		const chatEntityService: any = {
			packRoomMemberships: jest.fn(async () => memberships),
		};

		return {
			endpoint: new RoomMembersEndpoint(chatService, chatEntityService),
			chatService,
			chatEntityService,
			memberships,
		};
	}

	function createUpdateMemberRoleEndpoint(options?: {
		canManageRoles?: boolean;
	}) {
		const membership = { id: 'membership-1', roomId: 'room', userId: 'target', role: 'manager' };
		const chatService: any = {
			checkChatAvailability: jest.fn(async () => undefined),
			findRoomById: jest.fn(async () => room),
			hasPermissionToManageRoomRoles: jest.fn(async () => options?.canManageRoles ?? true),
			updateRoomMembershipRole: jest.fn(async () => membership),
		};
		const chatEntityService: any = {
			packRoomMembership: jest.fn(async () => membership),
		};

		return {
			endpoint: new UpdateMemberRoleEndpoint(chatService, chatEntityService),
			chatService,
			chatEntityService,
			membership,
		};
	}

	function createShowRoomEndpoint(options?: {
		joinMode?: 'open' | 'inviteOnly' | 'closed';
		canView?: boolean;
	}) {
		const showRoom = {
			id: 'room',
			ownerId: 'owner',
			joinMode: options?.joinMode ?? 'open',
		};
		const packedRoom = {
			...showRoom,
			name: 'room',
		};
		const chatService: any = {
			checkChatAvailability: jest.fn(async () => undefined),
			findRoomById: jest.fn(async () => showRoom),
			hasPermissionToViewRoomTimeline: jest.fn(async () => options?.canView ?? false),
		};
		const chatEntityService: any = {
			packRoom: jest.fn(async () => packedRoom),
		};

		return {
			endpoint: new ShowRoomEndpoint(chatService, chatEntityService),
			chatService,
			chatEntityService,
			showRoom,
			packedRoom,
		};
	}

	test('delete-user-messages relies on room moderation target permission instead of requireModerator', async () => {
		expect(deleteUserMessagesMeta.requireModerator).toBeUndefined();
		const ctx = createDeleteUserEndpoint();

		await expect(ctx.endpoint.exec({ roomId: 'room', userId: 'target' }, me, null)).resolves.toEqual({
			deletedIds: ['message-1', 'message-2'],
		});
		expect(ctx.chatService.canDeleteRoomMessagesByUser).toHaveBeenCalledWith(me, room, 'target');
		expect(ctx.chatService.deleteRoomMessagesByUser).toHaveBeenCalledWith(room, 'target');
	});

	test('delete-user-messages rejects users without target moderation permission', async () => {
		const ctx = createDeleteUserEndpoint({ canManage: false });

		await expect(ctx.endpoint.exec({ roomId: 'room', userId: 'target' }, me, null)).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
		});
		expect(ctx.chatService.deleteRoomMessagesByUser).not.toHaveBeenCalled();
	});

	test('delete-all-messages requires password and rejects incorrect passwords', async () => {
		expect(deleteAllMessagesMeta.secure).toBe(true);
		expect(deleteAllMessagesParamDef.required).toContain('password');
		const ctx = createDeleteAllEndpoint({ passwordMatches: false });

		await expect(ctx.endpoint.exec({ roomId: 'room' }, me, null)).rejects.toMatchObject({
			code: 'INVALID_PARAM',
		});
		await expect(ctx.endpoint.exec({ roomId: 'room', password: 'wrong' }, me, null)).rejects.toMatchObject({
			code: 'INCORRECT_PASSWORD',
		});
		expect(ctx.userAuthService.checkPassword).toHaveBeenCalledWith({ userId: 'me' }, 'wrong');
		expect(ctx.chatService.deleteAllRoomMessages).not.toHaveBeenCalled();
	});

	test('delete-all-messages clears the room when password is correct', async () => {
		const ctx = createDeleteAllEndpoint({ passwordMatches: true });

		await expect(ctx.endpoint.exec({ roomId: 'room', password: 'correct' }, me, null)).resolves.toBeUndefined();
		expect(ctx.cacheService.userProfileCache.fetch).toHaveBeenCalledWith('me');
		expect(ctx.chatService.deleteAllRoomMessages).toHaveBeenCalledWith(room);
	});

	test('room members can be listed by room managers even when they are not members', async () => {
		const ctx = createRoomMembersEndpoint({ isMember: false, canManage: true });

		await expect(ctx.endpoint.exec({ roomId: 'room', limit: 30 }, me, null)).resolves.toEqual(ctx.memberships);
		expect(ctx.chatService.hasPermissionToManageRoom).toHaveBeenCalledWith(me, room);
		expect(ctx.chatService.getRoomMembershipsWithPagination).toHaveBeenCalledWith('room', 30, undefined, undefined, undefined, undefined, undefined);
		expect(ctx.chatEntityService.packRoomMemberships).toHaveBeenCalledWith(ctx.memberships, me, {
			populateUser: true,
			populateRoom: false,
		});
	});

	test('room members still reject non-members without room management permission', async () => {
		const ctx = createRoomMembersEndpoint({ isMember: false, canManage: false });

		await expect(ctx.endpoint.exec({ roomId: 'room', limit: 30 }, me, null)).rejects.toMatchObject({
			code: 'NO_SUCH_ROOM',
		});
		expect(ctx.chatService.getRoomMembershipsWithPagination).not.toHaveBeenCalled();
	});

	test('room show allows open room previews for non-members', async () => {
		const ctx = createShowRoomEndpoint({ joinMode: 'open', canView: false });

		await expect(ctx.endpoint.exec({ roomId: 'room' }, me, null)).resolves.toEqual(ctx.packedRoom);
		expect(ctx.chatService.hasPermissionToViewRoomTimeline).not.toHaveBeenCalled();
		expect(ctx.chatEntityService.packRoom).toHaveBeenCalledWith(ctx.showRoom, me);
	});

	test('room show hides invite-only rooms from non-members', async () => {
		const ctx = createShowRoomEndpoint({ joinMode: 'inviteOnly', canView: false });

		await expect(ctx.endpoint.exec({ roomId: 'room' }, me, null)).rejects.toMatchObject({
			code: 'NO_SUCH_ROOM',
		});
		expect(ctx.chatService.hasPermissionToViewRoomTimeline).toHaveBeenCalledWith(me, ctx.showRoom);
		expect(ctx.chatEntityService.packRoom).not.toHaveBeenCalled();
	});

	test('room show allows private rooms when the user can view the room', async () => {
		const ctx = createShowRoomEndpoint({ joinMode: 'closed', canView: true });

		await expect(ctx.endpoint.exec({ roomId: 'room' }, me, null)).resolves.toEqual(ctx.packedRoom);
		expect(ctx.chatService.hasPermissionToViewRoomTimeline).toHaveBeenCalledWith(me, ctx.showRoom);
		expect(ctx.chatEntityService.packRoom).toHaveBeenCalledWith(ctx.showRoom, me);
	});

	test('room owner level permission can update member role', async () => {
		const ctx = createUpdateMemberRoleEndpoint({ canManageRoles: true });

		await expect(ctx.endpoint.exec({ roomId: 'room', userId: 'target', role: 'manager' }, me, null)).resolves.toEqual(ctx.membership);
		expect(ctx.chatService.hasPermissionToManageRoomRoles).toHaveBeenCalledWith(me, room);
		expect(ctx.chatService.updateRoomMembershipRole).toHaveBeenCalledWith(room, 'target', 'manager');
		expect(ctx.chatEntityService.packRoomMembership).toHaveBeenCalledWith(ctx.membership, me, {
			populateUser: true,
			populateRoom: false,
		});
	});

	test('room manager cannot update member role without owner level permission', async () => {
		const ctx = createUpdateMemberRoleEndpoint({ canManageRoles: false });

		await expect(ctx.endpoint.exec({ roomId: 'room', userId: 'target', role: 'manager' }, me, null)).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
		});
		expect(ctx.chatService.updateRoomMembershipRole).not.toHaveBeenCalled();
	});
});
