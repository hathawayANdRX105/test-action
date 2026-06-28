/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { UserAuthService } from '@/core/UserAuthService.js';
import { CacheService } from '@/core/CacheService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,
	secure: true,

	kind: 'write:chat',

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '56981867-e0a6-436c-a3de-12b493118296',
		},
		accessDenied: {
			message: 'You cannot manage this room.',
			code: 'ACCESS_DENIED',
			id: '45392e23-7484-4cef-92fa-4e305d3c2082',
		},
		incorrectPassword: {
			message: 'Incorrect password.',
			code: 'INCORRECT_PASSWORD',
			id: '7add0395-9901-4098-82f9-4f67af65f775',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		password: { type: 'string' },
	},
	required: ['roomId', 'password'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private userAuthService: UserAuthService,
		private cacheService: CacheService,
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

			const profile = await this.cacheService.userProfileCache.fetch(me.id);
			if (!await this.userAuthService.checkPassword(profile, ps.password)) {
				throw new ApiError(meta.errors.incorrectPassword);
			}

			await this.chatService.deleteAllRoomMessages(room);
		});
	}
}
