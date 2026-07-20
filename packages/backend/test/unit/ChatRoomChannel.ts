/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import { ChatRoomChannelService } from '@/server/api/stream/channels/chat-room.js';

describe('chat room channel bootstrap', () => {
	test('does not fetch or serialize members that the client does not consume', async () => {
		const me = { id: 'me' };
		const room = { id: 'room', ownerId: 'owner' };
		const connection: any = {
			user: me,
			subscriber: {
				on: jest.fn(),
				off: jest.fn(),
			},
			sendSerializedMessageToWsFast: jest.fn(),
		};
		const chatRoomsRepository: any = {
			findOne: jest.fn()
				.mockResolvedValueOnce(room as never)
				.mockResolvedValueOnce(room as never),
		};
		const chatService: any = {
			hasPermissionToViewRoomTimeline: jest.fn(async () => true),
			packedRoomTimeline: jest.fn(async () => []),
			getMutedRoomUserIds: jest.fn(async () => new Set()),
			getRoomMembershipsWithPagination: jest.fn(),
		};
		const shardRouter: any = {
			channelFor: jest.fn(() => 'chat:room'),
		};
		const chatEntityService: any = {
			packRoom: jest.fn(async () => ({ ...room, owner: me })),
			packRoomMemberships: jest.fn(),
		};
		const service = new ChatRoomChannelService(chatRoomsRepository, chatService, shardRouter, chatEntityService);
		const channel = service.create('channel-id', connection);

		expect(await channel.init({ roomId: room.id })).toBe(true);
		await new Promise<void>(resolve => setImmediate(resolve));

		expect(chatService.getRoomMembershipsWithPagination).not.toHaveBeenCalled();
		expect(chatEntityService.packRoomMemberships).not.toHaveBeenCalled();
		expect(connection.sendSerializedMessageToWsFast).toHaveBeenCalledTimes(1);
		const payload = JSON.parse(connection.sendSerializedMessageToWsFast.mock.calls[0][0]);
		expect(payload.body.body).not.toHaveProperty('members');
	});
});
