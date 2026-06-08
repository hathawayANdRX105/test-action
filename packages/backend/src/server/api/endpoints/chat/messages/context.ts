/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ApiError } from '@/server/api/error.js';
import { RoleService } from '@/core/RoleService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'read:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			before: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'ChatMessage',
				},
			},
			target: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'ChatMessage',
			},
			after: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'ChatMessage',
				},
			},
			hasMoreBefore: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			hasMoreAfter: {
				type: 'boolean',
				optional: false, nullable: false,
			},
		},
	},

	errors: {
		noSuchMessage: {
			message: 'No such message.',
			code: 'NO_SUCH_MESSAGE',
			id: 'ff7c9f90-4e64-4996-a56d-1b21b2d6bdf8',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		messageId: { type: 'string', format: 'misskey:id' },
		limitBefore: { type: 'integer', minimum: 0, maximum: 100, default: 30 },
		limitAfter: { type: 'integer', minimum: 0, maximum: 100, default: 30 },
	},
	required: ['messageId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private roleService: RoleService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'read');

			const message = await this.chatService.findMessageById(ps.messageId);
			if (message == null) {
				throw new ApiError(meta.errors.noSuchMessage);
			}

			let canView = message.fromUserId === me.id || message.toUserId === me.id || await this.roleService.isModerator(me);
			if (!canView && message.toRoomId != null) {
				const room = await this.chatService.findRoomMessageTargetById(message.toRoomId);
				canView = room != null && await this.chatService.hasPermissionToViewRoomTimeline(me, room);
			}

			if (!canView) {
				throw new ApiError(meta.errors.noSuchMessage);
			}

			if (message.toRoomId != null && message.fromUserId !== me.id && await this.chatService.isRoomUserMuted(me.id, message.toRoomId, message.fromUserId)) {
				throw new ApiError(meta.errors.noSuchMessage);
			}

			const context = await this.chatService.messageContext(message, ps.limitBefore, ps.limitAfter, me.id);
			const messages = [...context.after, context.target, ...context.before];
			const packed = await this.chatEntityService.packMessagesDetailed(messages, me);
			const packedById = new Map(packed.map(item => [item.id, item]));

			return {
				before: context.before.map(item => packedById.get(item.id)!),
				target: packedById.get(context.target.id)!,
				after: context.after.map(item => packedById.get(item.id)!),
				hasMoreBefore: context.hasMoreBefore,
				hasMoreAfter: context.hasMoreAfter,
			};
		});
	}
}
