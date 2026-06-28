/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
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
			id: '7f9e7a67-ea83-4c6c-8bde-0d39f6b6410b',
		},

		accessDenied: {
			message: 'You must be a member of the room to update your room settings.',
			code: 'ACCESS_DENIED',
			id: 'd18cf7e6-0a4a-4d77-a1fc-c2b99192f6e4',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		nickname: { type: 'string', maxLength: 128, nullable: true },
		folder: { type: 'string', maxLength: 80, nullable: true },
	},
	required: ['roomId'],
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

			if (!await this.chatService.isRoomParticipant(me.id, room)) {
				throw new ApiError(meta.errors.accessDenied);
			}

			const settingParams: {
				nickname?: string | null;
				folder?: string | null;
			} = {};
			if (ps.nickname !== undefined) settingParams.nickname = ps.nickname;
			if (ps.folder !== undefined) settingParams.folder = ps.folder;

			await this.chatService.updateRoomUserSetting(me.id, room.id, settingParams);

			return await this.chatEntityService.packRoom(room, me);
		});
	}
}
