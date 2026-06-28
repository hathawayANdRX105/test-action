/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ApiError } from '@/server/api/error.js';
import { chatRoomMembershipRoles } from '@/models/ChatRoomMembership.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoomMembership',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '21126c94-691f-4b90-bf82-d279a3628a3b',
		},
		accessDenied: {
			message: 'You cannot manage room managers.',
			code: 'ACCESS_DENIED',
			id: 'ed7bf53e-0678-4d35-8629-f7b35e55dcd0',
		},
		cannotUpdateOwner: {
			message: 'You cannot change the room owner role.',
			code: 'CANNOT_UPDATE_OWNER_ROLE',
			id: '87b65d2d-f1c0-458f-a65f-640e4b3b02dc',
		},
		cannotUpdateModerator: {
			message: 'You cannot change a site moderator role.',
			code: 'CANNOT_UPDATE_MODERATOR_ROLE',
			id: '53528d77-4b20-4a12-9706-57d5e4621224',
		},
		notAMember: {
			message: 'The user is not a member of the room.',
			code: 'NOT_A_MEMBER',
			id: '20489ef5-359b-4c59-9147-c94abda45ebe',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		userId: { type: 'string', format: 'misskey:id' },
		role: { type: 'string', enum: chatRoomMembershipRoles },
	},
	required: ['roomId', 'userId', 'role'],
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

			const membership = await this.chatService.updateRoomMembershipRole(room, ps.userId, ps.role).catch(err => {
				if (err instanceof Error) {
					if (err.message === 'cannot update owner role') throw new ApiError(meta.errors.cannotUpdateOwner);
					if (err.message === 'cannot update moderator role') throw new ApiError(meta.errors.cannotUpdateModerator);
					if (err.message === 'not a member') throw new ApiError(meta.errors.notAMember);
				}
				throw err;
			});

			return await this.chatEntityService.packRoomMembership(membership, me, {
				populateUser: true,
				populateRoom: false,
			});
		});
	}
}
