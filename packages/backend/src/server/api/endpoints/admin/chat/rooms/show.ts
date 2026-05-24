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
import type { MiMeta } from '@/models/Meta.js';

export const meta = {
	tags: ['admin', 'chat'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'read:admin:meta',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			room: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'ChatRoom',
			},
			memberCount: {
				type: 'integer',
				optional: false, nullable: false,
			},
			defaultMemberLimit: {
				type: 'integer',
				optional: false, nullable: false,
			},
			memberLimitOverride: {
				type: 'integer',
				optional: false, nullable: true,
			},
			memberLimit: {
				type: 'integer',
				optional: false, nullable: false,
			},
		},
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '1f75ae4d-3bf3-4dbe-a9f4-c37d998c16f0',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
	},
	required: ['roomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const room = await this.chatRoomsRepository.findOne({ where: { id: ps.roomId }, relations: ['owner'] });
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			const memberCount = await this.chatService.getRoomMembersCount(room.id);
			const memberLimit = this.chatService.getEffectiveRoomMemberLimit(room);

			return {
				room: await this.chatEntityService.packRoom(room, me),
				memberCount,
				defaultMemberLimit: this.serverSettings.chatRoomDefaultMemberLimit,
				memberLimitOverride: room.memberLimitOverride,
				memberLimit,
			};
		});
	}
}
