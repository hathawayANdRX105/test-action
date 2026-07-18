/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '@/server/api/error.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { chatRoomJoinModes } from '@/models/ChatRoom.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'write:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatRoom',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'fcdb0f92-bda6-47f9-bd05-343e0e020932',
		},

		accessDenied: {
			message: 'Only the room owner can update room settings.',
			code: 'ACCESS_DENIED',
			id: '8e9f5f5b-9f7d-4f8d-bc8f-2d0d6ed3cfe4',
		},

		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'dce7fdd6-18bb-4a16-ba55-687d5d0b0d0a',
		},

		notAnImage: {
			message: 'The file specified as an avatar is not an image.',
			code: 'NOT_AN_IMAGE',
			id: '3a97f479-d551-4fd8-b155-3a0c2fcce8e8',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', maxLength: 256 },
		description: { type: 'string', maxLength: 1024 },
		joinMode: { type: 'string', enum: chatRoomJoinModes },
		isSilenced: { type: 'boolean' },
		announcement: { type: 'string', maxLength: 2048 },
		announcementPinned: { type: 'boolean' },
		announcementHistory: {
			type: 'array',
			maxItems: 50,
			items: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					text: { type: 'string', maxLength: 2048 },
					createdAt: { type: 'string' },
					pinned: { type: 'boolean' },
				},
				required: ['text', 'createdAt'],
			},
		},
		avatarId: { type: 'string', format: 'misskey:id', nullable: true },
		slowModeSeconds: { type: 'integer', minimum: 0, maximum: 86400 },
		bannedKeywords: { type: 'array', items: { type: 'string', maxLength: 256 }, maxItems: 100 },
		keywordMuteSeconds: { type: 'integer', minimum: -1 },
	},
	required: ['roomId'],
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

			const profileFieldsTouched = ps.name !== undefined || ps.description !== undefined || ps.joinMode !== undefined || ps.avatarId !== undefined;
			if (profileFieldsTouched && !(await this.chatService.hasPermissionToEditRoomProfile(me, room))) {
				throw new ApiError(meta.errors.accessDenied);
			}
			if (!profileFieldsTouched && !(await this.chatService.hasPermissionToModerateRoom(me, room))) {
				throw new ApiError(meta.errors.accessDenied);
			}

			const updated = await this.chatService.updateRoom(room, {
				name: ps.name,
				description: ps.description,
				joinMode: ps.joinMode,
				isSilenced: ps.isSilenced,
				announcement: ps.announcement,
				announcementPinned: ps.announcementPinned,
				announcementHistory: ps.announcementHistory,
				avatarId: ps.avatarId,
				slowModeSeconds: ps.slowModeSeconds,
				bannedKeywords: ps.bannedKeywords,
				keywordMuteSeconds: ps.keywordMuteSeconds,
			}, me.id).catch(err => {
				if (err instanceof Error) {
					if (err.message === 'no such file') throw new ApiError(meta.errors.noSuchFile);
					if (err.message === 'not an image') throw new ApiError(meta.errors.notAnImage);
				}
				throw err;
			});

			return await this.chatEntityService.packRoom(updated, me);
		});
	}
}
