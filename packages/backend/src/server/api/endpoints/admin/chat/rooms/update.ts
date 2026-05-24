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
import { ChatService, MAX_CHAT_ROOM_MEMBER_LIMIT, MIN_CHAT_ROOM_MEMBER_LIMIT } from '@/core/ChatService.js';
import type { MiMeta } from '@/models/Meta.js';

export const meta = {
	tags: ['admin', 'chat'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:meta',

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
			id: '8193a263-8d3e-4890-9fd2-cb3e320de4a7',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		memberLimitOverride: { type: 'integer', nullable: true, minimum: MIN_CHAT_ROOM_MEMBER_LIMIT, maximum: MAX_CHAT_ROOM_MEMBER_LIMIT },
	},
	required: ['roomId', 'memberLimitOverride'],
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

			const updated = await this.chatService.updateRoomMemberLimitOverride(room, ps.memberLimitOverride);
			const memberCount = await this.chatService.getRoomMembersCount(updated.id);
			const memberLimit = this.chatService.getEffectiveRoomMemberLimit(updated);

			return {
				room: await this.chatEntityService.packRoom(updated, me),
				memberCount,
				defaultMemberLimit: this.serverSettings.chatRoomDefaultMemberLimit,
				memberLimitOverride: updated.memberLimitOverride,
				memberLimit,
			};
		});
	}
}
