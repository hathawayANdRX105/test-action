/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	limit: {
		duration: ms('1day'),
		max: 50,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoomInvitation',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '916f9507-49ba-4e90-b57f-1fd4deaa47a5',
		},
		roomFull: {
			message: 'Room is full. Member limit has been reached.',
			code: 'ROOM_FULL',
			id: '917bb5fc-0c8a-489a-b9c7-899c3287f36c',
		},
		joiningDisabled: {
			message: 'Joining this room is disabled.',
			code: 'JOINING_DISABLED',
			id: '4f26ceee-f4db-44f2-aa08-27858b770692',
		},
		youHaveBeenBlocked: {
			message: 'You cannot invite this user because you have been blocked by this user.',
			code: 'YOU_HAVE_BEEN_BLOCKED',
			kind: 'permission',
			id: '73773707-3721-438d-a27d-cc04cf28a226',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['roomId', 'userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			const room = await this.chatService.findRoomById(ps.roomId);
			if (room == null || !await this.chatService.hasPermissionToModerateRoom(me, room)) {
				throw new ApiError(meta.errors.noSuchRoom);
			}
			let invitation;
			try {
				invitation = await this.chatService.createRoomInvitation(me, room.id, ps.userId);
			} catch (err) {
				if (err instanceof Error) {
					if (err.message === 'room is full') throw new ApiError(meta.errors.roomFull);
					if (err.message === 'joining disabled') throw new ApiError(meta.errors.joiningDisabled);
					if (err.message === 'blocked') throw new ApiError(meta.errors.youHaveBeenBlocked);
				}
				throw err;
			}
			return await this.chatEntityService.packRoomInvitation(invitation, me);
		});
	}
}
