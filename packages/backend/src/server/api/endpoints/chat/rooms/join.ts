/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '84416476-5ce8-4a2c-b568-9569f1b10733',
		},
		invitationRequired: {
			message: 'Invitation required.',
			code: 'INVITATION_REQUIRED',
			id: '6bf0e3a6-0434-4be0-85d5-5d3c9b8f4f6d',
		},
		alreadyJoined: {
			message: 'Already joined.',
			code: 'ALREADY_JOINED',
			id: '6fb64f62-e643-498a-9b91-778527744843',
		},
		roomFull: {
			message: 'Room is full. Member limit has been reached.',
			code: 'ROOM_FULL',
			id: 'b4855d16-3863-4600-8301-2a53f2f76541',
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
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			try {
				await this.chatService.joinToRoom(me.id, ps.roomId);
			} catch (err) {
				if (err instanceof Error) {
					if (err.message === 'invitation required') throw new ApiError(meta.errors.invitationRequired);
					if (err.message === 'already member') throw new ApiError(meta.errors.alreadyJoined);
					if (err.message === 'room is full') throw new ApiError(meta.errors.roomFull);
				}
				throw new ApiError(meta.errors.noSuchRoom);
			}
		});
	}
}
