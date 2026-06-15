/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService } from '@/core/ChatService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,
	kind: 'read:chat',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				user: {
					type: 'object',
					optional: false, nullable: true,
					ref: 'UserLite',
				},
				keyword: { type: 'string', optional: false, nullable: false },
				mutedUntil: { type: 'string', optional: false, nullable: true },
				createdAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
			},
		},
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'a9f1b6c2-3d4e-4f5a-8b6c-7d8e9f0a1b2c',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
	},
	required: ['roomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'read');

			const room = await this.chatService.findRoomById(ps.roomId);
			if (room == null || !(await this.chatService.hasPermissionToManageRoom(me, room))) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			return await this.chatService.getRoomMuteLog(ps.roomId, me.id, ps.limit);
		});
	}
}
