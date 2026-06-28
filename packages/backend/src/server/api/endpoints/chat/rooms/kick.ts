/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';
import type { UsersRepository } from '@/models/_.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'a8152fcc-e62c-411d-aa92-a6029d99825c',
		},
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '9cca6277-ef0a-4400-9a73-82ce20712daf',
		},
		accessDenied: {
			message: 'Only the room owner can kick members.',
			code: 'ACCESS_DENIED',
			id: 'a181191d-d239-44ac-8dbe-ae172659cd3e',
		},
		cannotKickOwner: {
			message: 'You cannot kick the room owner.',
			code: 'CANNOT_KICK_OWNER',
			id: '1e2852e4-7d3c-4fce-a563-b04b2d9d1357',
		},
		notAMember: {
			message: 'The user is not a member of the room.',
			code: 'NOT_A_MEMBER',
			id: '7fe07987-a395-4475-9c1b-4087ddb3063b',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
		ban: { type: 'boolean', default: false },
	},
	required: ['roomId', 'userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

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
				throw new ApiError(meta.errors.cannotKickOwner);
			}

			const user = await this.usersRepository.findOneBy({ id: ps.userId });
			if (user == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			await this.chatService.kickFromRoom(room, user.id, { ban: ps.ban, actor: me }).catch(err => {
				if (err instanceof Error) {
					if (err.message === 'not a member') throw new ApiError(meta.errors.notAMember);
					if (err.message === 'cannot moderate member') throw new ApiError(meta.errors.accessDenied);
				}
				throw err;
			});
		});
	}
}
