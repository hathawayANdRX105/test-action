/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { ChatRoomsRepository } from '@/models/_.js';
import { ApiError } from '@/server/api/error.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ChatService } from '@/core/ChatService.js';

export const meta = {
	tags: ['admin', 'chat'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'read:admin:meta',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'ChatMessageLiteForRoom',
		},
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'b4db30f7-50a5-4d41-8410-9e3439fd71f2',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
	},
	required: ['roomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		private chatEntityService: ChatEntityService,
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps) => {
			const room = await this.chatRoomsRepository.findOneBy({ id: ps.roomId });
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			const messages = await this.chatService.roomTimeline(null, room.id, ps.limit, ps.sinceId, ps.untilId);

			return await this.chatEntityService.packMessagesLiteForRoom(messages);
		});
	}
}
