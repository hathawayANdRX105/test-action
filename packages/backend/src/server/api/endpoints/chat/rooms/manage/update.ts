/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService, MAX_CHAT_ROOM_MESSAGE_RETENTION_DAYS, MIN_CHAT_ROOM_MESSAGE_RETENTION_DAYS } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoom',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'dcfe4cb6-2293-47cc-ad64-e633cb97dd9d',
		},
		accessDenied: {
			message: 'You cannot manage this room.',
			code: 'ACCESS_DENIED',
			id: '3d5cefd2-b57b-43dd-98b5-a1d87dc38520',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		messageRetentionDays: { type: 'integer', nullable: true, minimum: MIN_CHAT_ROOM_MESSAGE_RETENTION_DAYS, maximum: MAX_CHAT_ROOM_MESSAGE_RETENTION_DAYS },
	},
	required: ['roomId', 'messageRetentionDays'],
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
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}
			if (!await this.chatService.hasPermissionToManageRoomRoles(me, room)) {
				throw new ApiError(meta.errors.accessDenied);
			}

			const updated = await this.chatService.updateRoomMessageRetentionDays(room, ps.messageRetentionDays);
			return await this.chatEntityService.packRoom(updated, me);
		});
	}
}
