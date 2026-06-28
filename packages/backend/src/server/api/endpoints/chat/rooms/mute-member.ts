/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService, CHAT_ROOM_PERMANENT_MUTE } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'b9bd0558-f67a-49dd-be94-dca06c1a56a9',
		},
		accessDenied: {
			message: 'Only the room owner can mute members.',
			code: 'ACCESS_DENIED',
			id: '8782a4bc-b573-4961-b0b9-87507a75cf22',
		},
		cannotMuteOwner: {
			message: 'You cannot mute the room owner.',
			code: 'CANNOT_MUTE_OWNER',
			id: 'a78f51f3-9836-4f84-b399-ab92c70e86d6',
		},
		notAMember: {
			message: 'The user is not a member of the room.',
			code: 'NOT_A_MEMBER',
			id: 'b465a011-9bd2-49df-af77-0bd936c8f810',
		},
		invalidExpiresAt: {
			message: 'Invalid expiresAt.',
			code: 'INVALID_EXPIRES_AT',
			id: 'afe8c2bf-a8e4-4d78-8db5-893357bb46b1',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
		// epoch ms。null または省略で無期限ミュート。上限はECMAScriptの最大時間値。
		expiresAt: { type: 'integer', nullable: true, minimum: 1, maximum: 8640000000000000 },
	},
	required: ['roomId', 'userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			const room = await this.chatService.findRoomById(ps.roomId);
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			if (!(await this.chatService.hasPermissionToModerateRoom(me, room))) {
				throw new ApiError(meta.errors.accessDenied);
			}

			if (ps.userId === room.ownerId) {
				throw new ApiError(meta.errors.cannotMuteOwner);
			}

			let mutedUntil = CHAT_ROOM_PERMANENT_MUTE;
			if (ps.expiresAt != null) {
				if (ps.expiresAt <= Date.now()) {
					throw new ApiError(meta.errors.invalidExpiresAt);
				}
				mutedUntil = new Date(ps.expiresAt);
				if (Number.isNaN(mutedUntil.getTime())) {
					throw new ApiError(meta.errors.invalidExpiresAt);
				}
			}

			await this.chatService.muteRoomMember(room, ps.userId, mutedUntil, me).catch(err => {
				if (err instanceof Error) {
					if (err.message === 'not a member') throw new ApiError(meta.errors.notAMember);
					if (err.message === 'cannot moderate member') throw new ApiError(meta.errors.accessDenied);
				}
				throw err;
			});
		});
	}
}
