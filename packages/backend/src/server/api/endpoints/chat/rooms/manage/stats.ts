/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'read:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			total: { type: 'integer', optional: false, nullable: false },
			oldestAt: { type: 'string', optional: false, nullable: true },
			newestAt: { type: 'string', optional: false, nullable: true },
			daily: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						date: { type: 'string', optional: false, nullable: false },
						count: { type: 'integer', optional: false, nullable: false },
					},
				},
			},
		},
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'a33d13ff-73c7-447b-8df9-c84eaa5a48ab',
		},
		accessDenied: {
			message: 'You cannot manage this room.',
			code: 'ACCESS_DENIED',
			id: '028f92b3-39be-46be-a081-ea7dc0c444e0',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		days: { type: 'integer', minimum: 7, maximum: 30, default: 14 },
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
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}
			if (!await this.chatService.hasPermissionToManageRoom(me, room)) {
				throw new ApiError(meta.errors.accessDenied);
			}

			return await this.chatService.getRoomMessageStats(room, ps.days);
		});
	}
}
