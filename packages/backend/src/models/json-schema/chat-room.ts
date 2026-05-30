/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedChatRoomSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		ownerId: {
			type: 'string',
			optional: false, nullable: false,
		},
		owner: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserLite',
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
		},
		description: {
			type: 'string',
			optional: false, nullable: false,
		},
		joinMode: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['inviteOnly', 'open', 'closed'],
		},
		memberLimit: {
			type: 'integer',
			optional: false, nullable: false,
		},
		memberLimitOverride: {
			type: 'integer',
			optional: true, nullable: true,
		},
		canManage: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		messageRetentionDays: {
			type: 'integer',
			optional: true, nullable: true,
		},
		memberCount: {
			type: 'integer',
			optional: false, nullable: false,
		},
		isJoined: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		isMuted: {
			type: 'boolean',
			optional: true, nullable: false,
		},
	},
} as const;
